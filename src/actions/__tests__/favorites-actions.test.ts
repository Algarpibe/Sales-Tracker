import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * toggleFavorite: alta/baja de un favorito sin carreras (doble clic) y con límites
 * de entrada. La BD es un doble en memoria que, como Postgres, rechaza un INSERT
 * duplicado salvo que lleve ON CONFLICT DO NOTHING. eq/and se sustituyen por
 * versiones que dejan leer la condición para saber a qué cliente apunta.
 */

const state = vi.hoisted(() => ({
  names: [] as string[],
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
  const { favorites } = await import("@/db/schema");
  type Cond = { op: string; col?: unknown; val?: unknown; conds?: Cond[] };
  const nameIn = (c: Cond): string | undefined =>
    c.op === "and" ? c.conds!.map(nameIn).find((v) => v !== undefined) : c.col === favorites.customer_name ? (c.val as string) : undefined;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: Cond) => {
          const name = nameIn(cond);
          const res = async () => {
            state.calls++;
            await tick();
            return name === undefined ? [{ total: state.names.length }] : state.names.filter((n) => n === name).map((n) => ({ id: n }));
          };
          return { limit: res, then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => res().then(ok, ko) };
        },
      }),
    }),
    insert: () => ({
      values: (v: { customer_name: string }) => {
        const plain = async () => {
          state.calls++;
          await tick();
          if (state.names.includes(v.customer_name)) throw new Error('duplicate key value violates unique constraint "favorites_user_customer_unique"');
          state.names.push(v.customer_name);
        };
        return {
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => plain().then(ok, ko),
          onConflictDoNothing: () => ({
            returning: async () => {
              state.calls++;
              await tick();
              if (state.names.includes(v.customer_name)) return [];
              state.names.push(v.customer_name);
              return [{ id: v.customer_name }];
            },
          }),
        };
      },
    }),
    delete: () => ({
      where: (cond: Cond) => {
        const name = nameIn(cond);
        const run = async () => {
          state.calls++;
          await tick();
          const had = state.names.filter((n) => n === name);
          state.names = state.names.filter((n) => n !== name);
          return had.map((n) => ({ id: n }));
        };
        return {
          returning: run,
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko),
        };
      },
    }),
  };
  return { db };
});

import { toggleFavorite } from "@/actions/favorites-actions";

beforeEach(() => {
  state.names = [];
  state.calls = 0;
});

describe("toggleFavorite", () => {
  it("marca y desmarca un cliente", async () => {
    await toggleFavorite("ACME");
    expect(state.names).toEqual(["ACME"]);
    await toggleFavorite("ACME");
    expect(state.names).toEqual([]);
  });

  it("un doble clic (dos toggles simultáneos) no revienta por la restricción única", async () => {
    await expect(Promise.all([toggleFavorite("ACME"), toggleFavorite("ACME")])).resolves.toBeDefined();
    expect(state.names.filter((n) => n === "ACME").length).toBeLessThanOrEqual(1);
  });

  it("rechaza un nombre de cliente de más de 300 caracteres sin tocar la BD", async () => {
    await expect(toggleFavorite("x".repeat(301))).rejects.toMatchObject({ name: "AppError", code: "VALIDATION" });
    expect(state.calls).toBe(0);
  });

  it("rechaza un nombre vacío sin tocar la BD", async () => {
    await expect(toggleFavorite("")).rejects.toMatchObject({ name: "AppError", code: "VALIDATION" });
    expect(state.calls).toBe(0);
  });

  it("con 500 favoritos no deja añadir otro", async () => {
    state.names = Array.from({ length: 500 }, (_, i) => `C${i}`);
    await expect(toggleFavorite("NUEVO")).rejects.toMatchObject({ name: "AppError", code: "LIMIT" });
    expect(state.names).toHaveLength(500);
    expect(state.names).not.toContain("NUEVO");
  });

  it("con 500 favoritos sí deja quitar uno", async () => {
    state.names = Array.from({ length: 500 }, (_, i) => `C${i}`);
    await toggleFavorite("C7");
    expect(state.names).toHaveLength(499);
    expect(state.names).not.toContain("C7");
  });
});
