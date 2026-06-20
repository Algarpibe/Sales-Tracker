import { Pool } from "pg";

// Pool de SOLO LECTURA al zoho-hub (hub_reader). Independiente del pool principal
// (sales-tracker-db). Solo se usa si HUB_DB_URL está definido; si no, la app sigue
// leyendo sales_records (fallback). Host interno: ambientalia_project_zoho-hub-db:5432.
const globalForHub = globalThis as unknown as { __hubPool?: Pool };

export function hubEnabled(): boolean {
  return !!process.env.HUB_DB_URL;
}

export function getHubPool(): Pool {
  if (!process.env.HUB_DB_URL) {
    throw new Error("HUB_DB_URL no está configurado (lectura del zoho-hub deshabilitada).");
  }
  const pool =
    globalForHub.__hubPool ??
    new Pool({
      connectionString: process.env.HUB_DB_URL,
      max: Number(process.env.HUB_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  globalForHub.__hubPool = pool;
  return pool;
}
