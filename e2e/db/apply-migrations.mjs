import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(HERE, "../../drizzle");

/**
 * Aplica los .sql de /drizzle en orden numerico sobre la base indicada.
 * Cada fichero va en su propia transaccion: si uno falla, se ve cual.
 */
export async function applyMigrations(connectionString) {
  const entries = await readdir(DRIZZLE_DIR);
  const files = entries.filter((f) => f.endsWith(".sql")).sort();

  if (files.length === 0) {
    throw new Error(`No se encontro ninguna migracion en ${DRIZZLE_DIR}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(DRIZZLE_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`  migracion aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Fallo la migracion ${file}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
  return files;
}
