import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MAINTENANCE_URL, APP_URL, HUB_URL, APP_DB_NAME, HUB_DB_NAME } from "./config.mjs";
import { applyMigrations } from "./apply-migrations.mjs";
import { seedApp } from "./seed-app.mjs";
import { seedHub } from "./seed-hub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

async function main() {
  console.log("Reiniciando las bases de E2E...");
  await recreateDatabases();
  await applyMigrations(APP_URL);
  await applyHubSchema();
  await seedApp(APP_URL);
  await seedHub(HUB_URL);
  console.log("Listo.");
}

main().catch((err) => {
  console.error("Fallo el reset de E2E:", err.message);
  process.exit(1);
});
