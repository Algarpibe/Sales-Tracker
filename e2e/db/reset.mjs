import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MAINTENANCE_URL, APP_URL, HUB_URL, APP_DB_NAME, HUB_DB_NAME, APP_ROLE, APP_ROLE_PASSWORD } from "./config.mjs";
import { seedApp } from "./seed-app.mjs";
import { seedHub } from "./seed-hub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATE_CLI = path.resolve(HERE, "../../scripts/migrate/cli.mjs");

async function recreateDatabases() {
  const client = new pg.Client({ connectionString: MAINTENANCE_URL });
  await client.connect();
  try {
    for (const name of [APP_DB_NAME, HUB_DB_NAME]) {
      // FORCE cierra conexiones vivas: sin esto, un dev server olvidado bloquea el DROP.
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.query(`CREATE DATABASE ${name}`);
      console.log(`  base recreada: ${name}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Migra la base del app con el mismo runner que se usa en produccion (DATA-047),
 * como proceso aparte y por MIGRATIONS_DATABASE_URL, igual que lo lanza el
 * operador. Asi cada ejecucion de E2E (y cada PR en CI) prueba `up` sobre una base
 * vacia y `status --strict` confirma que no queda nada pendiente.
 */
function migrateApp() {
  const env = { ...process.env, MIGRATIONS_DATABASE_URL: APP_URL };
  for (const args of [["up"], ["status", "--strict"]]) {
    execFileSync(process.execPath, [MIGRATE_CLI, ...args], { env, stdio: "inherit" });
  }
}

async function applyHubSchema() {
  const sql = await readFile(path.join(HERE, "hub-schema.sql"), "utf8");
  const client = new pg.Client({ connectionString: HUB_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("  esquema del hub falso aplicado");
  } finally {
    await client.end();
  }
}

/**
 * La migracion 0014 crea el rol de la app NOLOGIN y sin password, porque esta
 * versionada. Aqui, solo en E2E, se le da LOGIN con la password de test. El rol es
 * de todo el cluster y sobrevive al DROP DATABASE: el ALTER se repite sin efectos.
 */
async function enableAppRoleLogin() {
  const client = new pg.Client({ connectionString: MAINTENANCE_URL });
  await client.connect();
  try {
    await client.query(
      `ALTER ROLE ${client.escapeIdentifier(APP_ROLE)} LOGIN PASSWORD ${client.escapeLiteral(APP_ROLE_PASSWORD)}`,
    );
    console.log(`  rol ${APP_ROLE} con LOGIN`);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("Reiniciando las bases de E2E...");
  await recreateDatabases();
  migrateApp();
  await enableAppRoleLogin();
  await applyHubSchema();
  await seedApp(APP_URL);
  await seedHub(HUB_URL);
  console.log("Listo.");
}

main().catch((err) => {
  console.error("Fallo el reset de E2E:", err.message);
  process.exit(1);
});
