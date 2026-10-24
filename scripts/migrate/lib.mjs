/**
 * Logica pura del runner de migraciones (DATA-047): sin BD ni sistema de ficheros,
 * para poder probarla con vitest. La parte con efectos vive en cli.mjs.
 *
 * Es .mjs (y no .ts) porque el runner se ejecuta con `node` a secas en el VPS y en
 * CI, igual que los scripts de e2e/db: tsx no es dependencia directa del proyecto.
 */
import { createHash } from "node:crypto";

/** Rol de minimo privilegio del app (0014). Nunca debe migrar. */
export const APP_ROLE = "salestracker_app";

/** Esquema propio de la tabla de control. No es `public`: 0014 da permisos por
 *  defecto al rol del app sobre todo lo que se crea en `public`. */
export const CONTROL_SCHEMA = "migrations";
export const CONTROL_TABLE = `${CONTROL_SCHEMA}.applied`;

const MIGRATION_RE = /^(\d{4})_[A-Za-z0-9_-]+\.sql$/;
const DOWN_RE = /^(\d{4}_[A-Za-z0-9_-]+)\.down\.sql$/;
const NO_TX_MARKER_RE = /^--\s*migrate:no-transaction\s*$/i;
const BREAKPOINT_RE = /-->\s*statement-breakpoint/;
// BEGIN/COMMIT/ROLLBACK como sentencia propia al principio de linea. Los bloques
// PL/pgSQL no casan: su BEGIN no lleva `;` y `DO $$ BEGIN` empieza por DO.
const TX_CONTROL_RE =
  /^\s*(?:BEGIN(?:\s+(?:TRANSACTION|WORK|ISOLATION\s+LEVEL[^;\n]*|READ\s+(?:ONLY|WRITE)))?|START\s+TRANSACTION[^;\n]*|COMMIT(?:\s+(?:TRANSACTION|WORK))?|ROLLBACK(?:\s+(?:TRANSACTION|WORK))?)\s*;/im;

/** Error esperado: el CLI muestra solo el mensaje, sin traza. */
export class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationError";
  }
}

/**
 * Normaliza los finales de linea a LF. El repo guarda LF, pero un checkout en
 * Windows con core.autocrlf=true los convierte a CRLF: sin normalizar, el mismo
 * fichero daria otro checksum en Windows que en el VPS o en CI y saldria como
 * MODIFICADA sin que nadie lo haya tocado.
 * @param {string} text
 * @returns {string}
 */
export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

/**
 * sha256 (hex) del contenido con finales de linea LF.
 * @param {string} text
 * @returns {string}
 */
export function checksum(text) {
  return createHash("sha256").update(normalizeLineEndings(text), "utf8").digest("hex");
}

/**
 * Acepta `0014_app_role`, `0014_app_role.sql` o `drizzle/0014_app_role.sql`.
 * @param {string} input
 * @returns {string}
 */
export function normalizeMigrationName(input) {
  const base = input.trim().split(/[\\/]/).pop() ?? "";
  return base.endsWith(".sql") ? base : `${base}.sql`;
}

/**
 * Clasifica los nombres de fichero de drizzle/: migraciones (ordenadas por nombre,
 * con huecos permitidos: no existe 0009) y ficheros de rollback `.down.sql`.
 * @param {string[]} names
 * @returns {{ migrations: string[], downs: Map<string, string> }}
 */
export function classifyFiles(names) {
  const migrations = [];
  const downNames = [];
  for (const name of names) {
    if (!name.endsWith(".sql")) continue;
    if (DOWN_RE.test(name)) downNames.push(name);
    else if (MIGRATION_RE.test(name)) migrations.push(name);
    else {
      throw new MigrationError(
        `Fichero con nombre no valido en drizzle/: ${name}. Debe ser NNNN_nombre.sql o NNNN_nombre.down.sql.`,
      );
    }
  }
  migrations.sort();

  const seen = new Map();
  for (const name of migrations) {
    const prefix = name.slice(0, 4);
    if (seen.has(prefix)) {
      throw new MigrationError(
        `Dos migraciones con el mismo numero ${prefix}: ${seen.get(prefix)} y ${name}. Renumerar la mas nueva.`,
      );
    }
    seen.set(prefix, name);
  }

  const downs = new Map();
  for (const down of downNames) {
    const target = `${down.match(DOWN_RE)[1]}.sql`;
    if (!migrations.includes(target)) {
      throw new MigrationError(`${down} no tiene migracion: falta ${target}.`);
    }
    downs.set(target, down);
  }
  return { migrations, downs };
}

/**
 * @typedef {{ name: string, checksum: string }} FileInfo
 * @typedef {{ name: string, checksum: string, baseline: boolean }} AppliedRow
 * @typedef {"applied" | "baseline" | "pending" | "modified" | "missing"} State
 * @typedef {{ name: string, state: State, outOfOrder: boolean }} PlanEntry
 */

/**
 * Cruza los ficheros con las filas de la tabla de control.
 * @param {FileInfo[]} files
 * @param {AppliedRow[]} rows
 * @returns {PlanEntry[]}
 */
export function computePlan(files, rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const fileNames = new Set(files.map((f) => f.name));
  const lastRecorded = rows.map((r) => r.name).sort().at(-1);

  /** @type {PlanEntry[]} */
  const entries = files.map((f) => {
    const r = byName.get(f.name);
    /** @type {State} */
    let state = "pending";
    if (r) state = r.checksum !== f.checksum ? "modified" : r.baseline ? "baseline" : "applied";
    const outOfOrder = state === "pending" && lastRecorded !== undefined && f.name < lastRecorded;
    return { name: f.name, state, outOfOrder };
  });
  for (const r of rows) {
    if (!fileNames.has(r.name)) entries.push({ name: r.name, state: "missing", outOfOrder: false });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * @param {PlanEntry[]} plan
 */
export function summarizePlan(plan) {
  const names = (/** @type {State} */ s) => plan.filter((e) => e.state === s).map((e) => e.name);
  return {
    pending: names("pending"),
    modified: names("modified"),
    missing: names("missing"),
    outOfOrder: plan.filter((e) => e.outOfOrder).map((e) => e.name),
  };
}

/**
 * Para cualquier comando que escribe: las modificadas y las filas sin fichero
 * significan que el checkout no es el que se aplico (o que alguien edito una
 * migracion ya aplicada). Hay que resolverlo antes de tocar nada.
 * @param {PlanEntry[]} plan
 */
function assertConsistent(plan) {
  const { modified, missing } = summarizePlan(plan);
  if (modified.length > 0) {
    throw new MigrationError(
      `Migraciones MODIFICADAS desde que se aplicaron: ${modified.join(", ")}. ` +
        "Una migracion aplicada no se edita: restaurar el fichero original y crear una nueva.",
    );
  }
  if (missing.length > 0) {
    throw new MigrationError(
      `Migraciones registradas en ${CONTROL_TABLE} sin fichero: ${missing.join(", ")}. ` +
        "Comprobar que se esta en la rama correcta (main al dia).",
    );
  }
}

/**
 * Migraciones a marcar como aplicadas sin ejecutarlas (alta inicial en una BD que
 * ya las tiene puestas a mano).
 * @param {PlanEntry[]} plan
 * @param {string} through
 * @returns {string[]}
 */
export function planBaseline(plan, through) {
  assertConsistent(plan);
  if (!plan.some((e) => e.name === through)) {
    throw new MigrationError(`--through ${through} no existe en drizzle/.`);
  }
  const later = plan.filter((e) => e.name > through && e.state !== "pending").map((e) => e.name);
  if (later.length > 0) {
    throw new MigrationError(
      `Ya hay migraciones registradas posteriores a ${through}: ${later.join(", ")}. ` +
        "El baseline solo puede marcar el tramo inicial.",
    );
  }
  return plan.filter((e) => e.name <= through && e.state === "pending").map((e) => e.name);
}

/**
 * Migraciones a aplicar con `up`, en orden.
 * @param {PlanEntry[]} plan
 * @returns {string[]}
 */
export function planUp(plan) {
  assertConsistent(plan);
  const { pending, outOfOrder } = summarizePlan(plan);
  if (outOfOrder.length > 0) {
    throw new MigrationError(
      `Migraciones pendientes anteriores a otras ya registradas: ${outOfOrder.join(", ")}. ` +
        "Probablemente llegaron de otra rama: renumerarlas por encima de la ultima aplicada.",
    );
  }
  return pending;
}

/**
 * Migraciones a revertir con `down --to`, de la mas nueva a la mas vieja. Todas
 * necesitan su `.down.sql`: si falta uno, no se revierte ninguna.
 * @param {PlanEntry[]} plan
 * @param {string} to
 * @param {Map<string, string>} downs
 * @returns {{ name: string, down: string }[]}
 */
export function planDown(plan, to, downs) {
  assertConsistent(plan);
  const target = plan.find((e) => e.name === to);
  if (!target || (target.state !== "applied" && target.state !== "baseline")) {
    throw new MigrationError(`--to ${to} no esta registrada como aplicada.`);
  }
  const toRevert = plan
    .filter((e) => e.name > to && (e.state === "applied" || e.state === "baseline"))
    .map((e) => e.name)
    .reverse();
  const withoutDown = toRevert.filter((name) => !downs.has(name));
  if (withoutDown.length > 0) {
    throw new MigrationError(
      `Sin fichero .down.sql: ${withoutDown.join(", ")}. No se revierte ninguna: ` +
        "para esas, el rollback es restaurar el backup (pg_dump) tomado antes de `up`.",
    );
  }
  return toRevert.map((name) => ({ name, down: /** @type {string} */ (downs.get(name)) }));
}

/**
 * ¿Lleva el fichero BEGIN/COMMIT/ROLLBACK propios? Se ignoran los comentarios `--`.
 * @param {string} sql
 * @returns {boolean}
 */
export function hasTransactionControl(sql) {
  const sinComentarios = normalizeLineEndings(sql)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return TX_CONTROL_RE.test(sinComentarios);
}

/**
 * Como se ejecuta un fichero:
 * - `transaction`: el runner abre una transaccion con la migracion y su fila de
 *   control; si algo falla no queda nada.
 * - `no-transaction`: la primera linea es `-- migrate:no-transaction`, para
 *   sentencias que Postgres no admite dentro de una transaccion (CREATE INDEX
 *   CONCURRENTLY, VACUUM...). Cada trozo entre `--> statement-breakpoint` va
 *   en su propia consulta.
 * - `self-managed`: el fichero ya trae su BEGIN/COMMIT (0003). Envolverlo haria
 *   que su COMMIT cerrara la transaccion del runner antes de tiempo; se ejecuta
 *   como el no-transaction y su propio BEGIN/COMMIT lo hace atomico.
 * @param {string} sql
 * @returns {"transaction" | "no-transaction" | "self-managed"}
 */
export function executionMode(sql) {
  const firstLine = normalizeLineEndings(sql).split("\n", 1)[0].replace(/^﻿/, "").trim();
  if (NO_TX_MARKER_RE.test(firstLine)) return "no-transaction";
  if (hasTransactionControl(sql)) return "self-managed";
  return "transaction";
}

/**
 * Trozos de un fichero separados por `--> statement-breakpoint` (el separador que
 * escribe drizzle-kit). No parte por `;`: romperia los bloques `DO $$ ... $$`.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitStatements(sql) {
  return normalizeLineEndings(sql)
    .split(BREAKPOINT_RE)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Identidad de una conexion: usuario, host, puerto y base. La password no cuenta.
 * @param {string} url
 */
function connectionIdentity(url) {
  try {
    const u = new URL(url);
    return [
      decodeURIComponent(u.username),
      u.hostname.toLowerCase(),
      u.port || "5432",
      decodeURIComponent(u.pathname.replace(/^\//, "")),
    ].join("|");
  } catch {
    return url.trim();
  }
}

/**
 * URL de la conexion de migraciones. Solo sale de MIGRATIONS_DATABASE_URL, y nunca
 * puede ser la del app: el DATABASE_URL usa salestracker_app, que no hace DDL.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveMigrationsUrl(env) {
  const url = env.MIGRATIONS_DATABASE_URL?.trim();
  if (!url) {
    throw new MigrationError(
      "Falta MIGRATIONS_DATABASE_URL: la URL de la BD del app con el usuario postgres. " +
        "El runner no usa DATABASE_URL a proposito.",
    );
  }
  const appUrl = env.DATABASE_URL?.trim();
  if (appUrl && (appUrl === url || connectionIdentity(appUrl) === connectionIdentity(url))) {
    throw new MigrationError(
      "MIGRATIONS_DATABASE_URL apunta a la misma conexion que DATABASE_URL. Las migraciones van " +
        "con postgres, nunca con el usuario del app.",
    );
  }
  return url;
}

/**
 * Comprueba el usuario conectado. Devuelve el motivo del rechazo o null.
 * @param {{ currentUser: string, isSuperuser: boolean, canCreateInDatabase: boolean, canCreateInPublic: boolean }} info
 * @returns {string | null}
 */
export function roleError(info) {
  if (info.currentUser === APP_ROLE) {
    return `Conectado como ${APP_ROLE}, el rol del app. Las migraciones van con postgres.`;
  }
  if (info.isSuperuser) return null;
  if (!info.canCreateInDatabase || !info.canCreateInPublic) {
    return (
      `El usuario ${info.currentUser} no tiene permisos para crear esquemas y tablas ` +
      "(CREATE en la base y en public). Usar postgres."
    );
  }
  return null;
}

const COMMANDS = new Set(["status", "baseline", "up", "down", "help"]);
const ALLOWED_FLAGS = {
  status: ["--strict"],
  baseline: ["--through", "--yes"],
  up: ["--dry-run"],
  down: ["--to", "--yes"],
  help: [],
};

/**
 * @param {string[]} argv argumentos tras el nombre del script
 * @returns {{ command: "status" | "baseline" | "up" | "down" | "help", through?: string, to?: string, yes: boolean, dryRun: boolean, strict: boolean }}
 */
export function parseArgs(argv) {
  const [first, ...rest] = argv;
  if (first === undefined || first === "help" || first === "--help" || first === "-h") {
    return { command: "help", yes: false, dryRun: false, strict: false };
  }
  if (!COMMANDS.has(first)) {
    throw new MigrationError(`Comando desconocido: ${first}. Usa status, baseline, up o down.`);
  }
  const command = /** @type {"status" | "baseline" | "up" | "down"} */ (first);
  const result = { command, yes: false, dryRun: false, strict: false, through: undefined, to: undefined };

  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = rest[i].split(/=(.*)/s, 2);
    if (!ALLOWED_FLAGS[command].includes(flag)) {
      throw new MigrationError(`Opcion no valida para ${command}: ${flag}.`);
    }
    if (flag === "--through" || flag === "--to") {
      const value = inline ?? rest[++i];
      if (!value || value.startsWith("--")) throw new MigrationError(`${flag} necesita el nombre de una migracion.`);
      result[flag === "--through" ? "through" : "to"] = normalizeMigrationName(value);
    } else if (flag === "--yes") result.yes = true;
    else if (flag === "--dry-run") result.dryRun = true;
    else if (flag === "--strict") result.strict = true;
  }

  if (command === "baseline" && !result.through) {
    throw new MigrationError("baseline necesita --through <migracion>.");
  }
  if (command === "down" && !result.to) {
    throw new MigrationError("down necesita --to <migracion>.");
  }
  return result;
}
