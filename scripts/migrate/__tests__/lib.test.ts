import { describe, it, expect } from "vitest";
import {
  APP_ROLE,
  checksum,
  classifyFiles,
  computePlan,
  executionMode,
  hasTransactionControl,
  MigrationError,
  normalizeMigrationName,
  parseArgs,
  planBaseline,
  planDown,
  planUp,
  resolveMigrationsUrl,
  roleError,
  splitStatements,
  summarizePlan,
} from "../lib.mjs";

const ok = (name: string, sum = `sum-${name}`) => ({ name, checksum: sum });
const row = (name: string, sum = `sum-${name}`, baseline = false) => ({ name, checksum: sum, baseline });

describe("checksum", () => {
  it("da el mismo hash con CRLF que con LF", () => {
    expect(checksum("SELECT 1;\r\nSELECT 2;\r\n")).toBe(checksum("SELECT 1;\nSELECT 2;\n"));
  });

  it("es un sha256 en hexadecimal", () => {
    expect(checksum("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia si cambia el contenido", () => {
    expect(checksum("SELECT 1;\n")).not.toBe(checksum("SELECT 2;\n"));
  });
});

describe("classifyFiles", () => {
  it("ordena por nombre y tolera huecos en la numeracion", () => {
    const r = classifyFiles(["0010_b.sql", "0002_a.sql", "0008_c.sql", "0000_init.sql"]);
    expect(r.migrations).toEqual(["0000_init.sql", "0002_a.sql", "0008_c.sql", "0010_b.sql"]);
  });

  it("separa los .down.sql y los asocia a su migracion", () => {
    const r = classifyFiles(["0015_x.sql", "0015_x.down.sql"]);
    expect(r.migrations).toEqual(["0015_x.sql"]);
    expect(r.downs.get("0015_x.sql")).toBe("0015_x.down.sql");
  });

  it("ignora lo que no es .sql", () => {
    expect(classifyFiles(["meta", "README.md", "0001_a.sql"]).migrations).toEqual(["0001_a.sql"]);
  });

  it("rechaza un .sql con nombre fuera del patron NNNN_nombre.sql", () => {
    expect(() => classifyFiles(["0001_a.sql", "parche.sql"])).toThrow(MigrationError);
    expect(() => classifyFiles(["parche.sql"])).toThrow(/parche\.sql/);
  });

  it("rechaza dos migraciones con el mismo numero", () => {
    expect(() => classifyFiles(["0015_a.sql", "0015_b.sql"])).toThrow(/0015/);
  });

  it("rechaza un .down.sql sin su migracion", () => {
    expect(() => classifyFiles(["0016_y.down.sql"])).toThrow(/0016_y/);
  });
});

describe("computePlan", () => {
  it("marca pendientes las que no tienen fila", () => {
    const plan = computePlan([ok("0000_a.sql"), ok("0001_b.sql")], []);
    expect(plan.map((e) => e.state)).toEqual(["pending", "pending"]);
  });

  it("distingue aplicada y baseline", () => {
    const plan = computePlan(
      [ok("0000_a.sql"), ok("0001_b.sql")],
      [row("0000_a.sql", "sum-0000_a.sql", true), row("0001_b.sql")],
    );
    expect(plan.map((e) => e.state)).toEqual(["baseline", "applied"]);
  });

  it("marca modificada la que cambio de checksum", () => {
    const plan = computePlan([ok("0000_a.sql", "nuevo")], [row("0000_a.sql", "viejo")]);
    expect(plan[0].state).toBe("modified");
  });

  it("marca missing la fila sin fichero y la ordena con el resto", () => {
    const plan = computePlan([ok("0000_a.sql"), ok("0002_c.sql")], [row("0000_a.sql"), row("0001_b.sql")]);
    expect(plan.map((e) => [e.name, e.state])).toEqual([
      ["0000_a.sql", "applied"],
      ["0001_b.sql", "missing"],
      ["0002_c.sql", "pending"],
    ]);
  });

  it("marca fuera de orden una pendiente anterior a una ya aplicada", () => {
    const plan = computePlan([ok("0001_a.sql"), ok("0002_b.sql")], [row("0002_b.sql")]);
    expect(plan[0]).toMatchObject({ name: "0001_a.sql", state: "pending", outOfOrder: true });
    expect(summarizePlan(plan).outOfOrder).toEqual(["0001_a.sql"]);
  });

  it("resume los problemas por estado", () => {
    const plan = computePlan(
      [ok("0000_a.sql", "x"), ok("0002_c.sql")],
      [row("0000_a.sql", "y"), row("0001_b.sql")],
    );
    expect(summarizePlan(plan)).toMatchObject({
      pending: ["0002_c.sql"],
      modified: ["0000_a.sql"],
      missing: ["0001_b.sql"],
    });
  });
});

describe("planBaseline", () => {
  const files = [ok("0000_a.sql"), ok("0001_b.sql"), ok("0003_c.sql")];

  it("marca todo hasta --through incluido", () => {
    expect(planBaseline(computePlan(files, []), "0001_b.sql")).toEqual(["0000_a.sql", "0001_b.sql"]);
  });

  it("no vuelve a marcar las que ya tienen fila", () => {
    expect(planBaseline(computePlan(files, [row("0000_a.sql")]), "0001_b.sql")).toEqual(["0001_b.sql"]);
  });

  it("rechaza un --through que no existe", () => {
    expect(() => planBaseline(computePlan(files, []), "0002_x.sql")).toThrow(/0002_x\.sql/);
  });

  it("rechaza si ya hay una fila de una migracion posterior", () => {
    expect(() => planBaseline(computePlan(files, [row("0003_c.sql")]), "0001_b.sql")).toThrow(/0003_c\.sql/);
  });

  it("rechaza con migraciones modificadas o sin fichero", () => {
    expect(() => planBaseline(computePlan(files, [row("0000_a.sql", "otro")]), "0001_b.sql")).toThrow(
      MigrationError,
    );
    expect(() => planBaseline(computePlan(files, [row("0000_z.sql")]), "0001_b.sql")).toThrow(MigrationError);
  });
});

describe("planUp", () => {
  it("devuelve las pendientes en orden", () => {
    const plan = computePlan([ok("0000_a.sql"), ok("0001_b.sql"), ok("0002_c.sql")], [row("0000_a.sql")]);
    expect(planUp(plan)).toEqual(["0001_b.sql", "0002_c.sql"]);
  });

  it("rechaza si hay alguna modificada", () => {
    const plan = computePlan([ok("0000_a.sql", "x"), ok("0001_b.sql")], [row("0000_a.sql", "y")]);
    expect(() => planUp(plan)).toThrow(/0000_a\.sql/);
  });

  it("rechaza si hay filas sin fichero", () => {
    const plan = computePlan([ok("0001_b.sql")], [row("0000_a.sql")]);
    expect(() => planUp(plan)).toThrow(/0000_a\.sql/);
  });

  it("rechaza pendientes fuera de orden", () => {
    const plan = computePlan([ok("0001_a.sql"), ok("0002_b.sql")], [row("0002_b.sql")]);
    expect(() => planUp(plan)).toThrow(/0001_a\.sql/);
  });
});

describe("planDown", () => {
  const files = [ok("0014_a.sql"), ok("0015_b.sql"), ok("0016_c.sql")];
  const rows = [row("0014_a.sql", "sum-0014_a.sql", true), row("0015_b.sql"), row("0016_c.sql")];
  const downs = new Map([
    ["0015_b.sql", "0015_b.down.sql"],
    ["0016_c.sql", "0016_c.down.sql"],
  ]);

  it("revierte en orden inverso las posteriores a --to", () => {
    expect(planDown(computePlan(files, rows), "0014_a.sql", downs)).toEqual([
      { name: "0016_c.sql", down: "0016_c.down.sql" },
      { name: "0015_b.sql", down: "0015_b.down.sql" },
    ]);
  });

  it("rechaza si alguna no tiene .down.sql", () => {
    expect(() => planDown(computePlan(files, rows), "0013_z.sql", downs)).toThrow(MigrationError);
    const sinDown = new Map([["0016_c.sql", "0016_c.down.sql"]]);
    expect(() => planDown(computePlan(files, rows), "0014_a.sql", sinDown)).toThrow(/0015_b\.sql/);
  });

  it("rechaza un --to que no esta aplicado", () => {
    expect(() => planDown(computePlan(files, [row("0014_a.sql")]), "0015_b.sql", downs)).toThrow(/0015_b\.sql/);
  });

  it("rechaza si hay modificadas", () => {
    const modRows = [row("0014_a.sql"), row("0015_b.sql", "otro"), row("0016_c.sql")];
    expect(() => planDown(computePlan(files, modRows), "0014_a.sql", downs)).toThrow(/0015_b\.sql/);
  });

  it("no hace nada si --to es la ultima aplicada", () => {
    expect(planDown(computePlan(files, rows), "0016_c.sql", downs)).toEqual([]);
  });
});

describe("executionMode", () => {
  it("por defecto va en transaccion", () => {
    expect(executionMode("ALTER TYPE record_type ADD VALUE IF NOT EXISTS 'X';\n")).toBe("transaction");
  });

  it("detecta el marcador en la primera linea", () => {
    expect(executionMode("-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY i ON t (c);\n")).toBe(
      "no-transaction",
    );
    expect(executionMode("-- migrate:no-transaction\r\nVACUUM t;\r\n")).toBe("no-transaction");
  });

  it("ignora el marcador si no esta en la primera linea", () => {
    expect(executionMode("-- cabecera\n-- migrate:no-transaction\nSELECT 1;\n")).toBe("transaction");
  });

  it("no envuelve un fichero que ya lleva su propio BEGIN/COMMIT", () => {
    expect(executionMode("-- comentario\n\nBEGIN;\nUPDATE t SET x = 1;\nCOMMIT;\n")).toBe("self-managed");
  });
});

describe("hasTransactionControl", () => {
  it("detecta BEGIN/COMMIT/ROLLBACK de nivel superior", () => {
    expect(hasTransactionControl("BEGIN;\nSELECT 1;\nCOMMIT;")).toBe(true);
    expect(hasTransactionControl("start transaction;\nSELECT 1;")).toBe(true);
    expect(hasTransactionControl("SELECT 1;\n  rollback ;")).toBe(true);
  });

  it("no confunde los bloques DO de PL/pgSQL", () => {
    const sql = "DO $$ BEGIN\n\tALTER TABLE t ADD CONSTRAINT c CHECK (x > 0);\nEXCEPTION WHEN duplicate_object THEN null; END $$;";
    expect(hasTransactionControl(sql)).toBe(false);
    expect(hasTransactionControl("DO $$\nBEGIN\n  PERFORM 1;\nEND;\n$$;")).toBe(false);
  });

  it("ignora los comentarios", () => {
    expect(hasTransactionControl("-- BEGIN;\nSELECT 1;")).toBe(false);
  });
});

describe("splitStatements", () => {
  it("parte por los marcadores de drizzle-kit y descarta trozos vacios", () => {
    expect(splitStatements("SELECT 1;--> statement-breakpoint\nSELECT 2;\n--> statement-breakpoint\n")).toEqual([
      "SELECT 1;",
      "SELECT 2;",
    ]);
  });

  it("sin marcadores devuelve el fichero entero", () => {
    expect(splitStatements("BEGIN;\nSELECT 1;\nCOMMIT;\n")).toEqual(["BEGIN;\nSELECT 1;\nCOMMIT;"]);
  });
});

describe("resolveMigrationsUrl", () => {
  const MIG = "postgres://postgres:pw@db.local:5432/app";

  it("exige MIGRATIONS_DATABASE_URL", () => {
    expect(() => resolveMigrationsUrl({})).toThrow(/MIGRATIONS_DATABASE_URL/);
    expect(() => resolveMigrationsUrl({ MIGRATIONS_DATABASE_URL: "  " })).toThrow(/MIGRATIONS_DATABASE_URL/);
  });

  it("devuelve la URL si no hay DATABASE_URL", () => {
    expect(resolveMigrationsUrl({ MIGRATIONS_DATABASE_URL: MIG })).toBe(MIG);
  });

  it("rechaza la misma URL que DATABASE_URL", () => {
    expect(() => resolveMigrationsUrl({ MIGRATIONS_DATABASE_URL: MIG, DATABASE_URL: MIG })).toThrow(/DATABASE_URL/);
  });

  it("rechaza la misma conexion escrita distinto (password, puerto por defecto)", () => {
    expect(() =>
      resolveMigrationsUrl({
        MIGRATIONS_DATABASE_URL: "postgres://postgres:otra@db.local/app",
        DATABASE_URL: MIG,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("acepta otro usuario sobre la misma base", () => {
    expect(
      resolveMigrationsUrl({
        MIGRATIONS_DATABASE_URL: MIG,
        DATABASE_URL: "postgres://salestracker_app:pw@db.local:5432/app",
      }),
    ).toBe(MIG);
  });
});

describe("roleError", () => {
  const base = { currentUser: "postgres", isSuperuser: false, canCreateInDatabase: true, canCreateInPublic: true };

  it("acepta un superusuario", () => {
    expect(roleError({ ...base, isSuperuser: true, canCreateInDatabase: false, canCreateInPublic: false })).toBeNull();
  });

  it("acepta un rol con CREATE en la base y en public", () => {
    expect(roleError(base)).toBeNull();
  });

  it("rechaza el rol del app aunque tuviera permisos", () => {
    expect(roleError({ ...base, currentUser: APP_ROLE, isSuperuser: true })).toMatch(/salestracker_app/);
  });

  it("rechaza un rol sin permiso para crear tablas", () => {
    expect(roleError({ ...base, canCreateInPublic: false })).toMatch(/permisos/);
    expect(roleError({ ...base, canCreateInDatabase: false })).toMatch(/permisos/);
  });
});

describe("normalizeMigrationName", () => {
  it("acepta el nombre con o sin .sql", () => {
    expect(normalizeMigrationName("0014_app_role")).toBe("0014_app_role.sql");
    expect(normalizeMigrationName("0014_app_role.sql")).toBe("0014_app_role.sql");
    expect(normalizeMigrationName("drizzle/0014_app_role.sql")).toBe("0014_app_role.sql");
  });
});

describe("parseArgs", () => {
  it("status por defecto sin flags", () => {
    expect(parseArgs(["status"])).toMatchObject({ command: "status", strict: false });
    expect(parseArgs(["status", "--strict"])).toMatchObject({ command: "status", strict: true });
  });

  it("baseline exige --through y admite --yes", () => {
    expect(parseArgs(["baseline", "--through", "0014_app_role"])).toMatchObject({
      command: "baseline",
      through: "0014_app_role.sql",
      yes: false,
    });
    expect(parseArgs(["baseline", "--through=0014_app_role.sql", "--yes"])).toMatchObject({ yes: true });
    expect(() => parseArgs(["baseline"])).toThrow(/--through/);
  });

  it("up admite --dry-run", () => {
    expect(parseArgs(["up", "--dry-run"])).toMatchObject({ command: "up", dryRun: true });
  });

  it("down exige --to", () => {
    expect(parseArgs(["down", "--to", "0014_app_role", "--yes"])).toMatchObject({
      command: "down",
      to: "0014_app_role.sql",
      yes: true,
    });
    expect(() => parseArgs(["down"])).toThrow(/--to/);
  });

  it("sin comando o con help muestra la ayuda", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
  });

  it("rechaza comandos y flags desconocidos o fuera de su comando", () => {
    expect(() => parseArgs(["migrate"])).toThrow(/migrate/);
    expect(() => parseArgs(["up", "--force"])).toThrow(/--force/);
    expect(() => parseArgs(["status", "--yes"])).toThrow(/--yes/);
    expect(() => parseArgs(["baseline", "--through"])).toThrow(/--through/);
  });
});
