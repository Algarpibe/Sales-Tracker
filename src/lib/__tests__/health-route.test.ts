import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Pools simulados: el handler solo debe hacer SELECT 1 y nunca exponer el error.
const dbExecute = vi.fn();
const hubQuery = vi.fn();
const hubEnabled = vi.fn();
const logError = vi.fn();

vi.mock("@/db", () => ({ db: { execute: (...a: unknown[]) => dbExecute(...a) } }));
vi.mock("@/db/hub", () => ({
  hubEnabled: () => hubEnabled(),
  getHubPool: () => ({ query: (...a: unknown[]) => hubQuery(...a) }),
}));
vi.mock("@/lib/logger", () => ({ logError: (...a: unknown[]) => logError(...a) }));

import { GET, dynamic } from "@/app/api/health/route";

const LEAK = "connect ECONNREFUSED db-interno:5432 password=secreto";

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  dbExecute.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  hubQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  hubEnabled.mockReturnValue(true);
});

describe("GET /api/health", () => {
  it("es dinámico (nunca se cachea en build)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("liveness: 200 {status:ok} sin tocar la BD", async () => {
    const res = await GET(req("/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(dbExecute).not.toHaveBeenCalled();
    expect(hubQuery).not.toHaveBeenCalled();
  });

  it("liveness sigue en 200 aunque la BD esté caída", async () => {
    dbExecute.mockRejectedValue(new Error(LEAK));
    const res = await GET(req("/api/health"));
    expect(res.status).toBe(200);
  });

  it("readiness: 200 con db y hub ok", async () => {
    const res = await GET(req("/api/health?ready=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", hub: "ok" });
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(hubQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("readiness: hub 'disabled' si HUB_DB_URL no está configurado (sigue en 200)", async () => {
    hubEnabled.mockReturnValue(false);
    const res = await GET(req("/api/health?ready=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", hub: "disabled" });
    expect(hubQuery).not.toHaveBeenCalled();
  });

  it("readiness: 503 degraded si la BD principal falla, sin filtrar el error", async () => {
    dbExecute.mockRejectedValue(new Error(LEAK));
    const res = await GET(req("/api/health?ready=1"));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "degraded", db: "error", hub: "ok" });
    expect(text).not.toContain("db-interno");
    expect(text).not.toContain("secreto");
    expect(text).not.toContain("ECONNREFUSED");
    expect(logError).toHaveBeenCalled();
  });

  it("readiness: 503 degraded si el hub falla", async () => {
    hubQuery.mockRejectedValue(new Error(LEAK));
    const res = await GET(req("/api/health?ready=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "ok", hub: "error" });
  });

  it("readiness: una BD colgada cuenta como 'timeout' en ~2s, no bloquea", async () => {
    vi.useFakeTimers();
    dbExecute.mockReturnValue(new Promise(() => {}));
    const pending = GET(req("/api/health?ready=1"));
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await pending;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "timeout", hub: "ok" });
  });
});
