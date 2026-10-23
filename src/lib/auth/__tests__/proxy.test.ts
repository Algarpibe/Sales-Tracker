import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Proxy (src/proxy.ts). Las páginas sin sesión o sin aprobar se redirigen como
 * siempre; las lecturas JSON de /api/data (DATA-043) reciben 401/403 en JSON, porque
 * fetch() seguiría la redirección y acabaría con el HTML de /login y un 200.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  profile: null as null | { approved: boolean; rejected: boolean; active: boolean },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = async () => (state.profile ? [state.profile] : []);
  return { db: { select: () => chain } };
});

import { proxy, config } from "@/proxy";

const APROBADO = { approved: true, rejected: false, active: true };

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  state.session = null;
  state.profile = null;
});

function loginAs(profile: typeof APROBADO) {
  state.session = { user: { id: "u1" } };
  state.profile = profile;
}

describe("/api/data: JSON en vez de redirecciones", () => {
  it("401 JSON sin sesión", async () => {
    const res = await proxy(req("/api/data/sales?year=2025"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "Debes iniciar sesión.", code: "UNAUTHORIZED" });
  });

  it.each([
    ["pendiente", { approved: false, rejected: false, active: true }],
    ["rechazada", { approved: true, rejected: true, active: true }],
    ["inactiva", { approved: true, rejected: false, active: false }],
  ])("403 JSON a una cuenta %s", async (_n, profile) => {
    loginAs(profile);
    const res = await proxy(req("/api/data/categories"));
    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "Tu cuenta está pendiente de aprobación.", code: "NOT_APPROVED" });
  });

  it("deja pasar a una cuenta aprobada (la ruta vuelve a autorizar)", async () => {
    loginAs(APROBADO);
    const res = await proxy(req("/api/data/categories"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("el resto de rutas no cambia", () => {
  it("una página sin sesión redirige a /login", async () => {
    const res = await proxy(req("/home"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("una página de una cuenta pendiente redirige a /waiting-approval", async () => {
    loginAs({ approved: false, rejected: false, active: true });
    const res = await proxy(req("/analytics"));
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/waiting-approval");
  });

  it("/login con sesión aprobada redirige a /home", async () => {
    loginAs(APROBADO);
    const res = await proxy(req("/login"));
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/home");
  });

  it.each(["/api/avatar/x", "/api/database", "/api/datax/sales"])("%s sin sesión sigue redirigiendo", async (path) => {
    const res = await proxy(req(path));
    expect(res.status).toBe(307);
  });

  it("/api/data sigue dentro del matcher del proxy", () => {
    const [matcher] = config.matcher;
    const re = new RegExp(`^${matcher}$`);
    expect(re.test("/api/data/sales")).toBe(true);
    expect(re.test("/api/health")).toBe(false);
  });
});
