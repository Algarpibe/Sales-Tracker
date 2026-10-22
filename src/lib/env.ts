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
