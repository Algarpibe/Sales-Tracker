import type { PoolConfig } from "pg";

// Configuración PURA del pool de solo lectura al zoho-hub. Vive aparte de hub.ts (que
// lleva `import "server-only"`) porque e2e/specs/hub-pool.spec.ts la importa desde
// Playwright, un Node sin la condición react-server donde server-only lanza (DEP-027).

// Tope por sentencia. Conservador: la agregación completa de hub-sales recorre todo
// el histórico y su duración real en producción no está medida. Se ajusta con
// HUB_STATEMENT_TIMEOUT_MS sin tocar código.
export const HUB_STATEMENT_TIMEOUT_DEFAULT_MS = 30_000;

function statementTimeoutMs(raw: string | undefined): number {
  // Solo enteros positivos escritos tal cual; cualquier otra cosa (vacío, "30s",
  // "1e4", negativo) cae al valor por defecto en vez de desactivar el tope.
  if (!raw || !/^\d+$/.test(raw)) return HUB_STATEMENT_TIMEOUT_DEFAULT_MS;
  const ms = Number(raw);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : HUB_STATEMENT_TIMEOUT_DEFAULT_MS;
}

// Configuración del pool, pura para poder probarla sin BD (y reutilizarla en E2E).
// `options` viaja en el arranque de cada sesión:
//  - statement_timeout: una consulta lenta se cancela en vez de retener una de las
//    pocas conexiones del pool indefinidamente.
//  - default_transaction_read_only: el hub es de solo lectura también en la sesión,
//    no solo por convención; cualquier escritura falla con "read-only transaction".
export function hubPoolConfig(env: Record<string, string | undefined>): PoolConfig {
  const timeout = statementTimeoutMs(env.HUB_STATEMENT_TIMEOUT_MS);
  return {
    connectionString: env.HUB_DB_URL,
    max: Number(env.HUB_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    options: `-c statement_timeout=${timeout} -c default_transaction_read_only=on`,
  };
}
