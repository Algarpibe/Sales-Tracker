import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";

/**
 * PRIV-093: la IP y el user-agent de cada sesión no se guardan para siempre. Al crear
 * una sesión se borran las sesiones caducadas (y las verificaciones caducadas). Es
 * best-effort: un fallo de la BD nunca rompe ni retrasa el login, solo deja un aviso
 * sin datos personales.
 */

const state = vi.hoisted(() => ({
  deletes: [] as { table: string; where: SQL }[],
  fail: null as Error | null,
}));

vi.mock("@/db", () => ({
  db: {
    delete: (table: PgTable) => ({
      where: async (where: SQL) => {
        state.deletes.push({ table: getTableName(table), where });
        if (state.fail) throw state.fail;
      },
    }),
  },
}));

import { purgeExpiredAuthRows } from "@/lib/auth/session-purge";

const dialect = new PgDialect();
const NOW = new Date("2026-10-23T12:00:00.000Z");

beforeEach(() => {
  state.deletes = [];
  state.fail = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("purgeExpiredAuthRows", () => {
  it("borra las sesiones y verificaciones caducadas (expiresAt < ahora), parametrizado", async () => {
    await purgeExpiredAuthRows(NOW);
    expect(state.deletes.map((d) => d.table).sort()).toEqual(["session", "verification"]);
    for (const d of state.deletes) {
      const q = dialect.sqlToQuery(d.where);
      expect(q.sql).toBe(`"${d.table}"."expiresAt" < $1`);
      expect(q.params).toHaveLength(1);
      expect(new Date(q.params[0] as string).toISOString()).toBe(NOW.toISOString());
    }
  });

  it("un fallo de la BD no se propaga: deja un aviso sin detalles ni datos personales", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.fail = Object.assign(new Error("connect ECONNREFUSED host-interno:5432 usuario@example.test"), {
      code: "ECONNREFUSED",
    });
    await expect(purgeExpiredAuthRows(NOW)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const lineas = warn.mock.calls.map((c) => String(c[0]));
    for (const l of lineas) {
      expect(JSON.parse(l)).toMatchObject({ level: "warn", code: "ECONNREFUSED" });
      expect(l).not.toContain("host-interno");
      expect(l).not.toContain("example.test");
    }
  });

  it("si falla una tabla, intenta igualmente la otra", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.fail = new Error("x");
    await purgeExpiredAuthRows(NOW);
    expect(state.deletes).toHaveLength(2);
  });
});
