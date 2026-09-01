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
