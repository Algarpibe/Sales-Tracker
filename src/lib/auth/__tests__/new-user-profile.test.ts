import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DATA-051: al registrarse un usuario se busca (o crea) la empresa por defecto y se
 * crea su perfil. Antes iban como consultas sueltas: un fallo a medias dejaba una
 * empresa huérfana y dos altas simultáneas podían crear la empresa dos veces. Ahora
 * todo va en UNA transacción, serializada con un advisory lock. El doble de la BD
 * solo expone `transaction`: si el código consultara fuera de ella, fallaría.
 */

const state = vi.hoisted(() => ({
  existingCompany: null as null | { id: string },
  ops: [] as string[],
  inserted: [] as { table: string; values: Record<string, unknown> }[],
  failProfileInsert: false,
}));

vi.mock("@/db", async () => {
  const { companies, profiles } = await import("@/db/schema");
  const tx = {
    execute: async () => {
      state.ops.push("lock");
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.ops.push("select-company");
            return state.existingCompany ? [state.existingCompany] : [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const name = table === companies ? "companies" : table === profiles ? "profiles" : "?";
        const run = async () => {
          state.ops.push(`insert-${name}`);
          if (name === "profiles" && state.failProfileInsert) throw new Error("fallo simulado");
          state.inserted.push({ table: name, values });
          return name === "companies" ? [{ id: "nueva-empresa" }] : [];
        };
        return {
          returning: run,
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko),
        };
      },
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      state.ops.push("begin");
      const r = await fn(tx);
      state.ops.push("commit");
      return r;
    },
  };
  return { db };
});

import { createProfileForNewUser, DEFAULT_COMPANY } from "@/lib/auth/new-user-profile";

beforeEach(() => {
  state.existingCompany = null;
  state.ops = [];
  state.inserted = [];
  state.failProfileInsert = false;
});

describe("createProfileForNewUser", () => {
  it("con la empresa ya creada, crea solo el perfil dentro de la transacción", async () => {
    state.existingCompany = { id: "empresa-1" };
    await createProfileForNewUser("user-1");
    expect(state.ops).toEqual(["begin", "lock", "select-company", "insert-profiles", "commit"]);
    expect(state.inserted).toEqual([
      { table: "profiles", values: { id: "user-1", company_id: "empresa-1", role: "lector", is_approved: false } },
    ]);
  });

  it("sin empresa, la crea y cuelga el perfil de ella en la misma transacción", async () => {
    await createProfileForNewUser("user-2");
    expect(state.ops).toEqual(["begin", "lock", "select-company", "insert-companies", "insert-profiles", "commit"]);
    expect(state.inserted).toEqual([
      { table: "companies", values: { name: DEFAULT_COMPANY } },
      { table: "profiles", values: { id: "user-2", company_id: "nueva-empresa", role: "lector", is_approved: false } },
    ]);
  });

  it("si falla el perfil, el error sale de la transacción (no se confirma nada)", async () => {
    state.failProfileInsert = true;
    await expect(createProfileForNewUser("user-3")).rejects.toThrow("fallo simulado");
    expect(state.ops).not.toContain("commit");
  });
});
