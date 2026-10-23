import { logWarn } from "@/lib/logger";

// Fail-fast de configuración (INFRA-072). Sin estas variables la app arranca "bien"
// pero falla en silencio: pg cae a localhost sin DATABASE_URL y better-auth genera
// URLs/cookies con un origen equivocado sin BETTER_AUTH_URL.
// HUB_DB_URL NO está aquí a propósito: es opcional (hubEnabled() → fallback a
// sales_records); solo se avisa.
export const REQUIRED_RUNTIME_ENV = ["DATABASE_URL", "BETTER_AUTH_URL"] as const;

type Env = Record<string, string | undefined>;

// Pura: decide a partir del entorno recibido. Solo exige en runtime de producción;
// en dev/test y durante `next build` (NEXT_PHASE, sin envs) no hace nada.
// Los mensajes nombran la variable, nunca su valor.
export function assertRuntimeEnv(env: Env): { warnings: string[] } {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") {
    return { warnings: [] };
  }
  const missing = REQUIRED_RUNTIME_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias en producción: ${missing.join(", ")}.`);
  }
  const warnings: string[] = [];
  if (!env.HUB_DB_URL?.trim()) {
    warnings.push(
      "HUB_DB_URL no está definido: la lectura del zoho-hub queda deshabilitada y se usa sales_records (fallback)."
    );
  }
  return { warnings };
}

// Aplica la comprobación y emite los avisos una sola vez por proceso (el módulo
// puede evaluarse en más de un bundle: proxy y servidor).
const globalForEnv = globalThis as unknown as { __runtimeEnvWarned?: boolean };

export function enforceRuntimeEnv(
  env: Env = process.env,
  warn: (message: string) => void = logWarn
): void {
  const { warnings } = assertRuntimeEnv(env);
  if (globalForEnv.__runtimeEnvWarned) return;
  warnings.forEach((w) => warn(w));
  globalForEnv.__runtimeEnvWarned = true;
}

// Límites por usuario (SEC-006, src/lib/rate-limit.ts), en peticiones por minuto.
// Opcionales: sin variables valen estos defaults y producción no necesita configurar
// nada. Están muy por encima del uso normal: la página más pesada (/analytics con
// todas sus pestañas) lanza unas 25 lecturas a /api/data al cargar y un cambio de
// filtro unas 15, así que 600/min cubre ~20 cargas completas por minuto.
export const RATE_LIMIT_DEFAULTS = { read: 600, mutation: 120, export: 30 } as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_DEFAULTS;
export type RateLimitConfig = Record<RateLimitBucket, number>;

const RATE_LIMIT_ENV: Record<RateLimitBucket, string> = {
  read: "RATE_LIMIT_READS_PER_MINUTE",
  mutation: "RATE_LIMIT_MUTATIONS_PER_MINUTE",
  export: "RATE_LIMIT_EXPORTS_PER_MINUTE",
};

// Un valor inválido (vacío, 0, negativo, decimal, texto) cae al default: un error de
// configuración nunca deja la app sin límite ni la bloquea.
function positiveInt(raw: string | undefined, fallback: number): number {
  const v = raw?.trim();
  if (!v || !/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function rateLimitConfig(env: Env = process.env): RateLimitConfig {
  return {
    read: positiveInt(env[RATE_LIMIT_ENV.read], RATE_LIMIT_DEFAULTS.read),
    mutation: positiveInt(env[RATE_LIMIT_ENV.mutation], RATE_LIMIT_DEFAULTS.mutation),
    export: positiveInt(env[RATE_LIMIT_ENV.export], RATE_LIMIT_DEFAULTS.export),
  };
}
