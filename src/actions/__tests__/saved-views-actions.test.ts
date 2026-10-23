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
