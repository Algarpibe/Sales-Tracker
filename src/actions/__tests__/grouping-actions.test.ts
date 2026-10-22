import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * updateCategoryGrouping (SEC-034): el UPDATE del grupo va filtrado por empresa, pero
 * las asignaciones se insertaban con el id recibido aunque el UPDATE no tocara nada.
 * Un admin podía colgar sus categorías de un grupo de OTRA empresa. La BD es un
 * doble en memoria que registra cada escritura de la transacción.
 */

const state = vi.hoisted(() => ({
  // Filas que devuelve el UPDATE ... RETURNING del grupo (vacío = no es de la empresa).
  updatedGroups: [] as { id: string }[],
  // Categorías de la empresa que encuentra assertCategoriesOwned.
  ownedCategories: [] as { id: string }[],
  deletes: 0,
  inserted: [] as Record<string, unknown>[][],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireRole: async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "admin" } }),
  requireApproved: async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "admin" } }),
}));
vi.mock("@/db", () => {
  const db = {
    select: () => ({ from: () => ({ where: async () => state.ownedCategories }) }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => state.updatedGroups,
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve([]).then(ok, ko),
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deletes += 1;
      },
    }),
    insert: () => ({
      values: async (rows: Record<string, unknown>[]) => {
        state.inserted.push(rows);
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

import { updateCategoryGrouping } from "@/actions/grouping-actions";

const GROUP = "11111111-1111-4111-8111-111111111111";
const CAT_A = "22222222-2222-4222-8222-222222222222";
const CAT_B = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  state.updatedGroups = [];
  state.ownedCategories = [{ id: CAT_A }, { id: CAT_B }];
  state.deletes = 0;
  state.inserted = [];
});

describe("updateCategoryGrouping", () => {
  it("rechaza un grupo que no es de la empresa sin tocar sus asignaciones", async () => {
    state.updatedGroups = []; // el UPDATE filtrado por company_id no encontró el grupo
    state.ownedCategories = [{ id: CAT_A }];
    const res = await updateCategoryGrouping(GROUP, "Grupo", [CAT_A]);
    expect(res).toEqual({ ok: false, error: "Agrupación no encontrada.", code: "NOT_FOUND" });
    expect(state.deletes).toBe(0);
    expect(state.inserted).toEqual([]);
  });

  it("reemplaza las asignaciones de un grupo propio", async () => {
    state.updatedGroups = [{ id: GROUP }];
    const res = await updateCategoryGrouping(GROUP, "Grupo", [CAT_A, CAT_B]);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.deletes).toBe(1);
    expect(state.inserted).toEqual([
      [
        { group_id: GROUP, category_id: CAT_A, company_id: "c1" },
        { group_id: GROUP, category_id: CAT_B, company_id: "c1" },
      ],
    ]);
  });

  it("no inserta dos veces la misma categoría si llega repetida", async () => {
    state.updatedGroups = [{ id: GROUP }];
    state.ownedCategories = [{ id: CAT_A }];
    const res = await updateCategoryGrouping(GROUP, "Grupo", [CAT_A, CAT_A]);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.inserted).toEqual([[{ group_id: GROUP, category_id: CAT_A, company_id: "c1" }]]);
  });
});
