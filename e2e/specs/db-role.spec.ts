import { test, expect } from "@playwright/test";
import pg from "pg";
import { APP_SERVER_URL } from "../db/config.mjs";

/**
 * El servidor Next de E2E se conecta con APP_SERVER_URL (playwright.config.ts la
 * pasa como DATABASE_URL). Si esa conexion es superusuario, el resto de specs no
 * prueba nada sobre permisos: un GRANT olvidado en una migracion pasaria en E2E y
 * romperia en produccion. Aqui se fija que es el rol de minimo privilegio de la
 * migracion 0014.
 */
async function query<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: APP_SERVER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql);
    return rows;
  } finally {
    await client.end();
  }
}

test("el servidor se conecta con el rol de la app, sin superusuario ni BYPASSRLS", async () => {
  const [rol] = await query<{ usuario: string; rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT current_user AS usuario, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
  );

  expect(rol).toEqual({ usuario: "salestracker_app", rolsuper: false, rolbypassrls: false });
});

test("el rol de la app no puede crear objetos ni vaciar tablas", async () => {
  const [p] = await query<{ crear_en_public: boolean; crear_en_bd: boolean; truncate: boolean }>(
    `SELECT has_schema_privilege('public', 'CREATE') AS crear_en_public,
            has_database_privilege(current_database(), 'CREATE') AS crear_en_bd,
            has_table_privilege('public.kpi_targets', 'TRUNCATE') AS truncate`,
  );

  expect(p).toEqual({ crear_en_public: false, crear_en_bd: false, truncate: false });
});
