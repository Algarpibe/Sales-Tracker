import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ARQ-077: las mutaciones del layout del dashboard devuelven ActionResult (runAction) y
 * las lecturas que degradan (→ null / []) dejan rastro en el logger en vez de tragarse
 * el error. La BD es un doble que puede fallar a voluntad.
 */

const state = vi.hoisted(() => ({
  fail: false,
  writes: 0,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApproved: async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "vendedor" } }),
}));
vi.mock("@/db", () => {
  const maybeFail = async <T>(value: T): Promise<T> => {
    if (state.fail) throw new Error("relation \"saved_views\" does not exist");
    return value;
  };
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where"]) c[m] = () => c;
    c.limit = () => maybeFail([]);
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => maybeFail([]).then(ok, ko);
    return c;
  };
  const db = {
    select: () => chain(),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => {
          await maybeFail(null);
          state.writes++;
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        await maybeFail(null);
        state.writes++;
      },
    }),
  };
  return { db };
});

import { getDashboardLayout, resetDashboardLayout, saveDashboardLayout } from "@/actions/dashboard-layout-actions";
import { getFavorites } from "@/actions/favorites-actions";

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.fail = false;
  state.writes = 0;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedMessages(): string[] {
  return errorLog.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])).message as string);
}

describe("saveDashboardLayout / resetDashboardLayout", () => {
  it("guardar devuelve ok", async () => {
    await expect(saveDashboardLayout([])).resolves.toEqual({ ok: true, data: undefined });
    expect(state.writes).toBe(1);
  });

  it("un fallo de BD llega como { ok: false } con mensaje genérico, no como excepción", async () => {
    state.fail = true;
    const res = await saveDashboardLayout([]);
    expect(res).toEqual({ ok: false, error: "Ocurrió un error interno. Inténtalo de nuevo.", code: "INTERNAL" });
    expect(JSON.stringify(res)).not.toMatch(/saved_views/);
  });

  it("restablecer devuelve ok y, si falla, { ok: false }", async () => {
    await expect(resetDashboardLayout()).resolves.toEqual({ ok: true, data: undefined });
    state.fail = true;
    await expect(resetDashboardLayout()).resolves.toMatchObject({ ok: false, code: "INTERNAL" });
  });
});

describe("lecturas que degradan con gracia", () => {
  it("getDashboardLayout devuelve null y registra el fallo", async () => {
    state.fail = true;
    await expect(getDashboardLayout()).resolves.toBeNull();
    expect(loggedMessages()).toContain("getDashboardLayout falló; degradando a null");
  });

  it("getFavorites devuelve [] y registra el fallo", async () => {
    state.fail = true;
    await expect(getFavorites()).resolves.toEqual([]);
    expect(loggedMessages()).toContain("getFavorites falló; degradando a []");
  });

  it("sin fallo no se registra nada", async () => {
    await expect(getDashboardLayout()).resolves.toBeNull();
    await expect(getFavorites()).resolves.toEqual([]);
    expect(errorLog).not.toHaveBeenCalled();
  });
});
