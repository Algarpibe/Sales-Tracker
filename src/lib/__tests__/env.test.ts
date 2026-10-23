import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertRuntimeEnv, enforceRuntimeEnv, RATE_LIMIT_DEFAULTS, rateLimitConfig } from "@/lib/env";

const PROD_OK = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app:secreto-db@db-interno:5432/app",
  BETTER_AUTH_URL: "https://salestracker.example.com",
  HUB_DB_URL: "postgres://hub_reader:secreto-hub@hub-interno:5432/zoho_hub",
};

describe("assertRuntimeEnv", () => {
  it("no exige nada fuera de producción (dev/test)", () => {
    expect(assertRuntimeEnv({ NODE_ENV: "development" })).toEqual({ warnings: [] });
    expect(assertRuntimeEnv({ NODE_ENV: "test" })).toEqual({ warnings: [] });
    expect(assertRuntimeEnv({})).toEqual({ warnings: [] });
  });

  it("no exige nada durante next build (sin envs)", () => {
    expect(
      assertRuntimeEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })
    ).toEqual({ warnings: [] });
  });

  it("acepta un entorno de producción completo sin avisos", () => {
    expect(assertRuntimeEnv(PROD_OK)).toEqual({ warnings: [] });
  });

  it.each(["DATABASE_URL", "BETTER_AUTH_URL"])(
    "lanza en producción si falta %s, nombrando la variable",
    (name) => {
      const env = { ...PROD_OK, [name]: undefined };
      expect(() => assertRuntimeEnv(env)).toThrow(name);
    }
  );

  it("trata un valor vacío o solo espacios como ausente", () => {
    expect(() => assertRuntimeEnv({ ...PROD_OK, DATABASE_URL: "  " })).toThrow("DATABASE_URL");
  });

  it("nombra todas las que faltan a la vez", () => {
    expect(() => assertRuntimeEnv({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL.*BETTER_AUTH_URL/
    );
  });

  it("el mensaje nunca incluye valores de otras variables", () => {
    let message = "";
    try {
      assertRuntimeEnv({ ...PROD_OK, BETTER_AUTH_URL: undefined });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain("secreto-db");
    expect(message).not.toContain("db-interno");
    expect(message).not.toContain("secreto-hub");
  });

  it("HUB_DB_URL es opcional: no lanza, solo avisa (sin valores)", () => {
    const { warnings } = assertRuntimeEnv({ ...PROD_OK, HUB_DB_URL: undefined });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("HUB_DB_URL");
  });
});

describe("enforceRuntimeEnv", () => {
  beforeEach(() => {
    delete (globalThis as { __runtimeEnvWarned?: boolean }).__runtimeEnvWarned;
  });

  it("emite el aviso de HUB_DB_URL una sola vez por proceso", () => {
    const warn = vi.fn();
    const env = { ...PROD_OK, HUB_DB_URL: undefined };
    enforceRuntimeEnv(env, warn);
    enforceRuntimeEnv(env, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("HUB_DB_URL");
  });

  it("propaga el error si falta una obligatoria", () => {
    expect(() => enforceRuntimeEnv({ NODE_ENV: "production" }, vi.fn())).toThrow("DATABASE_URL");
  });
});

// SEC-006: los límites por usuario se pueden ajustar por entorno, pero producción no
// necesita configurar nada: sin variables (o con valores inválidos) valen los defaults.
describe("rateLimitConfig", () => {
  it("sin variables usa los valores por defecto", () => {
    expect(rateLimitConfig({})).toEqual(RATE_LIMIT_DEFAULTS);
    expect(RATE_LIMIT_DEFAULTS).toEqual({ read: 600, mutation: 120, export: 30 });
  });

  it("lee cada límite (peticiones por minuto) de su variable", () => {
    expect(
      rateLimitConfig({
        RATE_LIMIT_READS_PER_MINUTE: "5000",
        RATE_LIMIT_MUTATIONS_PER_MINUTE: " 300 ",
        RATE_LIMIT_EXPORTS_PER_MINUTE: "10",
      })
    ).toEqual({ read: 5000, mutation: 300, export: 10 });
  });

  it.each(["", "  ", "0", "-5", "abc", "1.5", "10abc", "1e3"])(
    "un valor inválido (%j) cae al valor por defecto, nunca deja la app sin límite",
    (v) => {
      expect(rateLimitConfig({ RATE_LIMIT_READS_PER_MINUTE: v }).read).toBe(RATE_LIMIT_DEFAULTS.read);
    }
  );
});
