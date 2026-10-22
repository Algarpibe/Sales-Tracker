import { test, expect } from "@playwright/test";
import pg from "pg";
import { HUB_URL } from "../db/config.mjs";
import { hubPoolConfig } from "../../src/db/hub";

/**
 * El pool del zoho-hub abre cada sesión con statement_timeout y en solo lectura
 * (src/db/hub.ts). Aquí se comprueba contra un Postgres real con la MISMA
 * configuración que usa la app (hubPoolConfig), no con una copia: si alguien
 * cambia las opciones, este spec lo detecta.
 *
 * Se conecta como postgres (como el resto de E2E con el hub): que aun así no pueda
 * escribir prueba que el freno es la sesión, no los permisos del rol. Nada de lo que
 * se intenta llega a ejecutarse, así que no deja estado.
 */
async function withHubPool<T>(
  env: Record<string, string | undefined>,
  fn: (pool: pg.Pool) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool(hubPoolConfig({ HUB_DB_URL: HUB_URL, ...env }));
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function show(pool: pg.Pool, setting: string): Promise<string> {
  const { rows } = await pool.query<Record<string, string>>(`SHOW ${setting}`);
  return rows[0][setting];
}

test("cada sesión del hub arranca en solo lectura y con el statement_timeout por defecto", async () => {
  await withHubPool({}, async (pool) => {
    expect(await show(pool, "default_transaction_read_only")).toBe("on");
    expect(await show(pool, "statement_timeout")).toBe("30s");
  });
});

test("HUB_STATEMENT_TIMEOUT_MS cambia el tope por sentencia", async () => {
  await withHubPool({ HUB_STATEMENT_TIMEOUT_MS: "1234" }, async (pool) => {
    expect(await show(pool, "statement_timeout")).toBe("1234ms");
  });
});

test("el pool del hub no puede escribir: crear o actualizar falla por solo lectura", async () => {
  await withHubPool({}, async (pool) => {
    await expect(pool.query("CREATE TABLE public.hub_pool_probe (id int)")).rejects.toThrow(
      /read-only transaction/,
    );
    await expect(pool.query("UPDATE books.items SET name = name WHERE false")).rejects.toThrow(
      /read-only transaction/,
    );
  });
});

test("una consulta más larga que el tope se cancela", async () => {
  await withHubPool({ HUB_STATEMENT_TIMEOUT_MS: "200" }, async (pool) => {
    await expect(pool.query("SELECT pg_sleep(2)")).rejects.toThrow(/statement timeout/);
  });
});
