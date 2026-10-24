import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * saveView: límites de entrada (clave de vista acotada) y tope de vistas por
 * usuario y clave. La BD es un doble en memoria; eq/ne/and se sustituyen por
 * versiones legibles para que el doble sepa qué filas cuenta.
 */

const state = vi.hoisted(() => ({
  views: [] as { view_key: string; name: string }[],
  calls: 0,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...orig,
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    and: (...conds: unknown[]) => ({ op: "and", conds }),
  };
});
vi.mock("@/lib/auth/guards", () => ({
  requireApproved: async () => ({ profile: { id: "u1", company_id: "c1", role: "vendedor" } }),
}));
vi.mock("@/db", async () => {
  const { savedViews } = await import("@/db/schema");
  type Cond = { op: string; col?: unknown; val?: unknown; conds?: Cond[] };
  const matches = (c: Cond, v: { view_key: string; name: string }): boolean => {
    if (c.op === "and") return c.conds!.every((x) => matches(x, v));
    const field = c.col === savedViews.view_key ? v.view_key : c.col === savedViews.name ? v.name : undefined;
    if (field === undefined) return true; // user_id: todas las filas del doble son de u1
    return c.op === "eq" ? field === c.val : field !== c.val;
  };
  const db = {
    select: () => ({
      from: () => ({
        where: async (cond: Cond) => {
          state.calls++;
          return [{ total: state.views.filter((v) => matches(cond, v)).length }];
        },
      }),
    }),
    insert: () => ({
      values: (v: { view_key: string; name: string }) => ({
        onConflictDoUpdate: async () => {
          state.calls++;
          if (!state.views.some((x) => x.view_key === v.view_key && x.name === v.name)) {
            state.views.push({ view_key: v.view_key, name: v.name });
          }
        },
      }),
    }),
  };
  return { db };
});

import { saveView } from "@/actions/saved-views-actions";

beforeEach(() => {
  state.views = [];
  state.calls = 0;
});

const llenar = (viewKey: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ view_key: viewKey, name: `v${i}` }));

describe("saveView", () => {
  it("guarda una vista nueva", async () => {
    await expect(saveView("clientes", "Mi vista", { a: 1 })).resolves.toEqual({ ok: true, data: undefined });
    expect(state.views).toEqual([{ view_key: "clientes", name: "Mi vista" }]);
  });

  it("rechaza una clave de vista de más de 64 caracteres sin tocar la BD", async () => {
    await expect(saveView("k".repeat(65), "x", {})).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.calls).toBe(0);
  });

  it("rechaza una clave de vista vacía sin tocar la BD", async () => {
    await expect(saveView("", "x", {})).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.calls).toBe(0);
  });

  it("con 50 vistas en esa clave no deja crear otra", async () => {
    state.views = llenar("clientes", 50);
    await expect(saveView("clientes", "otra", {})).resolves.toMatchObject({ ok: false, code: "LIMIT" });
    expect(state.views).toHaveLength(50);
  });

  it("con 50 vistas sí deja sobrescribir una existente", async () => {
    state.views = llenar("clientes", 50);
    await expect(saveView("clientes", "v3", { b: 2 })).resolves.toEqual({ ok: true, data: undefined });
    expect(state.views).toHaveLength(50);
  });

  it("el tope es por clave: 50 vistas en otra clave no bloquean", async () => {
    state.views = llenar("otra-tabla", 50);
    await saveView("clientes", "nueva", {});
    expect(state.views).toHaveLength(51);
  });
});

/**
 * SEC-005: tamaño máximo del nombre (120 caracteres, ya recortado) y del estado
 * (32 000 caracteres de JSON). Lo que se pasa del límite no llega a la BD.
 */
describe("saveView: límites de tamaño (SEC-005)", () => {
  // JSON.stringify({ s: "x".repeat(n) }) mide n + 8 caracteres: {"s":"…"}.
  const estadoDe = (longitudJson: number) => ({ s: "x".repeat(longitudJson - 8) });

  it("acepta un nombre de 120 caracteres", async () => {
    await expect(saveView("clientes", "n".repeat(120), {})).resolves.toEqual({ ok: true, data: undefined });
    expect(state.views).toEqual([{ view_key: "clientes", name: "n".repeat(120) }]);
  });

  it("el límite cuenta el nombre ya recortado", async () => {
    await expect(saveView("clientes", `  ${"n".repeat(120)}  `, {})).resolves.toEqual({ ok: true, data: undefined });
  });

  it("rechaza un nombre de 121 caracteres sin tocar la BD", async () => {
    await expect(saveView("clientes", "n".repeat(121), {})).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.calls).toBe(0);
  });

  it("acepta un estado de justo 32 000 caracteres de JSON", async () => {
    const estado = estadoDe(32_000);
    expect(JSON.stringify(estado)).toHaveLength(32_000);
    await expect(saveView("clientes", "grande", estado)).resolves.toEqual({ ok: true, data: undefined });
    expect(state.views).toHaveLength(1);
  });

  it("rechaza un estado de 32 001 caracteres sin tocar la BD", async () => {
    const estado = estadoDe(32_001);
    expect(JSON.stringify(estado)).toHaveLength(32_001);
    await expect(saveView("clientes", "grande", estado)).resolves.toMatchObject({ ok: false, code: "PAYLOAD_TOO_LARGE" });
    expect(state.calls).toBe(0);
  });
});
