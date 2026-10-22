import "server-only";
import { Pool } from "pg";
import { hubPoolConfig } from "./hub-config";

// Reexportado para no romper a quien ya la importaba desde aquí.
export { hubPoolConfig, HUB_STATEMENT_TIMEOUT_DEFAULT_MS } from "./hub-config";

// Pool de SOLO LECTURA al zoho-hub (hub_reader). Independiente del pool principal
// (sales-tracker-db). Solo se crea si HUB_DB_URL está definido.
// Sin HUB_DB_URL, solo tienen fallback a sales_records las lecturas agregadas que
// comprueban hubEnabled(): getSalesData
// (sales-actions) y el loader de agrupaciones (grouping-actions). Los módulos
// hub-* de clientes, artículos, márgenes y KPIs no tienen fallback: getHubPool()
// lanza y la vista cae a su error boundary.
// Host: el interno de la BD del hub (red Docker de EasyPanel), dentro de HUB_DB_URL.
const globalForHub = globalThis as unknown as { __hubPool?: Pool };

export function hubEnabled(): boolean {
  return !!process.env.HUB_DB_URL;
}

export function getHubPool(): Pool {
  if (!process.env.HUB_DB_URL) {
    throw new Error("HUB_DB_URL no está configurado (lectura del zoho-hub deshabilitada).");
  }
  const pool = globalForHub.__hubPool ?? new Pool(hubPoolConfig(process.env));
  globalForHub.__hubPool = pool;
  return pool;
}
