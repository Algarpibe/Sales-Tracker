import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

// Cachear el singleton SIEMPRE (incluido producción) para no abrir un Pool nuevo
// por cada inicialización de módulo y evitar agotar las conexiones de Postgres.
globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
