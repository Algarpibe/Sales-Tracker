// Credenciales triviales de un contenedor efimero y local. NUNCA apuntan al VPS.
// En CI, E2E_PG_HOST/E2E_PG_PORT los fija el workflow para el service container.
const HOST = process.env.E2E_PG_HOST ?? "127.0.0.1";
const PORT = process.env.E2E_PG_PORT ?? "55432";
const USER = "postgres";
const PASSWORD = "postgres";

const base = `postgres://${USER}:${PASSWORD}@${HOST}:${PORT}`;

export const APP_DB_NAME = "salestracker_e2e";
export const HUB_DB_NAME = "zoho_hub_e2e";

/** Base de mantenimiento: solo para CREATE/DROP DATABASE. */
export const MAINTENANCE_URL = `${base}/postgres`;
export const APP_URL = `${base}/${APP_DB_NAME}`;
export const HUB_URL = `${base}/${HUB_DB_NAME}`;

// Rol de minimo privilegio que crea la migracion 0014 (NOLOGIN y sin password).
// reset.mjs le da LOGIN con esta password, tan trivial como la de postgres: solo
// vale en este contenedor efimero. En produccion la password se pone a mano.
export const APP_ROLE = "salestracker_app";
export const APP_ROLE_PASSWORD = "salestracker_app";

/**
 * Conexion del servidor Next (DATABASE_URL en playwright.config.ts). Va con el rol
 * de la app y no con postgres para que E2E falle si una migracion olvida un
 * permiso. Migraciones, semillas y el hub siguen usando postgres.
 */
export const APP_SERVER_URL = `postgres://${APP_ROLE}:${APP_ROLE_PASSWORD}@${HOST}:${PORT}/${APP_DB_NAME}`;
