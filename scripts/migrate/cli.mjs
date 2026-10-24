/**
 * Runner de migraciones de drizzle/ (DATA-047). Lo lanza a mano el operador como
 * postgres; nunca el app ni su DATABASE_URL. Procedimiento completo:
 * docs/runbooks/migrations.md.
 *
 *   npm run db:migrate -- status [--strict]
 *   npm run db:migrate -- baseline --through <migracion> [--yes]
 *   npm run db:migrate -- up [--dry-run]
 *   npm run db:migrate -- down --to <migracion> [--yes]
 *
 * La conexion sale solo de MIGRATIONS_DATABASE_URL. La logica pura (planes,
 * checksums, guardas) esta en lib.mjs, con tests.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  CONTROL_SCHEMA,
  CONTROL_TABLE,
  MigrationError,
  checksum,
  classifyFiles,
  computePlan,
  executionMode,
  parseArgs,
  planBaseline,
  planDown,
  planUp,
  resolveMigrationsUrl,
  roleError,
  splitStatements,
  summarizePlan,
} from "./lib.mjs";

// Mismo patron que e2e/db/reset.mjs: fileURLToPath en vez de import.meta.dirname.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(HERE, "../../drizzle");

// Clave fija del advisory lock: dos runners a la vez sobre la misma base se excluyen.
const LOCK_KEY = 470047;

const HELP = `Runner de migraciones (drizzle/*.sql). Conexion: MIGRATIONS_DATABASE_URL (usuario postgres).

  status [--strict]                  Estado de cada migracion. Sale con error si hay
                                     MODIFICADAS, SIN FICHERO o fuera de orden; con
                                     --strict, tambien si hay pendientes.
  baseline --through <mig> [--yes]   Registra como aplicadas, SIN ejecutarlas, todas
                                     hasta <mig> incluida. Sin --yes solo las lista.
  up [--dry-run]                     Aplica las pendientes en orden, cada una en su
                                     transaccion con su fila de control.
  down --to <mig> [--yes]            Revierte las posteriores a <mig> con sus
                                     NNNN_nombre.down.sql. Sin --yes solo las lista.

Procedimiento: docs/runbooks/migrations.md`;

const LABELS = {
  applied: "aplicada",
  baseline: "baseline",
  pending: "pendiente",
  modified: "MODIFICADA",
  missing: "SIN FICHERO",
};

async function loadFiles() {
  const { migrations, downs } = classifyFiles(await readdir(DRIZZLE_DIR));
  const contents = new Map();
  for (const name of [...migrations, ...downs.values()]) {
    contents.set(name, await readFile(path.join(DRIZZLE_DIR, name), "utf8"));
  }
  const files = migrations.map((name) => ({ name, checksum: checksum(contents.get(name)) }));
  return { files, downs, contents };
}

async function connect() {
  const client = new pg.Client({ connectionString: resolveMigrationsUrl(process.env) });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT current_user AS user_name,
              current_database() AS database,
              r.rolsuper AS is_superuser,
              has_database_privilege(current_database(), 'CREATE') AS can_create_in_database,
              has_schema_privilege('public', 'CREATE') AS can_create_in_public
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const info = rows[0];
    const error = roleError({
      currentUser: info.user_name,
      isSuperuser: info.is_superuser,
      canCreateInDatabase: info.can_create_in_database,
      canCreateInPublic: info.can_create_in_public,
    });
    if (error) throw new MigrationError(error);
    console.log(`Base: ${info.database} · usuario: ${info.user_name}`);
    return client;
  } catch (err) {
    // Con exitCode (y no process.exit) una conexion abierta mantendria vivo el proceso.
    await client.end();
    throw err;
  }
}

/** Solo lectura: si la tabla de control no existe todavia, no hay filas. */
async function readRows(client) {
  const { rows } = await client.query("SELECT to_regclass($1) IS NOT NULL AS exists", [CONTROL_TABLE]);
  if (!rows[0].exists) return [];
  const result = await client.query(`SELECT name, checksum, baseline FROM ${CONTROL_TABLE} ORDER BY name`);
  return result.rows;
}

/**
 * Crea el esquema y la tabla de control si faltan. El esquema es del usuario que
 * migra y no se le da nada a PUBLIC ni al rol del app.
 */
async function ensureControlTable(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${CONTROL_SCHEMA}`);
  await client.query(`REVOKE ALL ON SCHEMA ${CONTROL_SCHEMA} FROM PUBLIC`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
       name text PRIMARY KEY,
       checksum text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now(),
       applied_by text NOT NULL DEFAULT current_user,
       baseline boolean NOT NULL DEFAULT false
     )`,
  );
}

async function lock(client) {
  const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
  if (!rows[0].ok) throw new MigrationError("Hay otro runner de migraciones trabajando sobre esta base.");
}

function printPlan(plan) {
  for (const e of plan) {
    const extra = e.outOfOrder ? "  (fuera de orden)" : "";
    console.log(`  ${LABELS[e.state].padEnd(12)}${e.name}${extra}`);
  }
}

/**
 * Ejecuta un fichero (migracion o .down.sql) y, en la misma transaccion si se
 * puede, la escritura de su fila de control (`record`).
 */
async function runFile(client, name, sql, record) {
  const mode = executionMode(sql);
  if (mode === "transaction") {
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await record();
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new MigrationError(`Fallo ${name} (revertida, no se aplico nada): ${err.message}`);
    }
    return;
  }

  const motivo = mode === "self-managed" ? "lleva su propio BEGIN/COMMIT" : "marcada migrate:no-transaction";
  console.log(`    ${name} ${motivo}: se ejecuta fuera de la transaccion del runner.`);
  try {
    for (const chunk of splitStatements(sql)) await client.query(chunk);
    await record();
  } catch (err) {
    // Si el fallo dejo abierta una transaccion del propio fichero, se cierra.
    await client.query("ROLLBACK").catch(() => {});
    throw new MigrationError(
      `Fallo ${name}, que no va en una transaccion del runner: puede haber quedado a medias. ` +
        `Revisar la base antes de reintentar. Error: ${err.message}`,
    );
  }
}

async function cmdStatus(client, args) {
  const { files } = await loadFiles();
  const plan = computePlan(files, await readRows(client));
  printPlan(plan);
  const s = summarizePlan(plan);
  console.log(`\nPendientes: ${s.pending.length} · modificadas: ${s.modified.length} · sin fichero: ${s.missing.length}`);
  const problems = s.modified.length + s.missing.length + s.outOfOrder.length;
  if (problems > 0) return 1;
  if (args.strict && s.pending.length > 0) {
    console.error("--strict: quedan migraciones pendientes.");
    return 1;
  }
  return 0;
}

async function cmdBaseline(client, args) {
  const { files } = await loadFiles();
  const checksums = new Map(files.map((f) => [f.name, f.checksum]));
  await lock(client);
  const toMark = planBaseline(computePlan(files, await readRows(client)), args.through);
  if (toMark.length === 0) {
    console.log("Nada que marcar: todas ya estan registradas.");
    return 0;
  }
  console.log(`Se registrarian como aplicadas (baseline), SIN ejecutarlas:`);
  for (const name of toMark) console.log(`  ${name}`);
  if (!args.yes) {
    console.log("\nNo se ha escrito nada. Repetir con --yes para registrarlas.");
    return 0;
  }
  await ensureControlTable(client);
  try {
    await client.query("BEGIN");
    for (const name of toMark) {
      await client.query(`INSERT INTO ${CONTROL_TABLE} (name, checksum, baseline) VALUES ($1, $2, true)`, [
        name,
        checksums.get(name),
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
  console.log(`\nRegistradas ${toMark.length} migraciones como baseline.`);
  return 0;
}

async function cmdUp(client, args) {
  const { files, contents } = await loadFiles();
  const checksums = new Map(files.map((f) => [f.name, f.checksum]));
  if (!args.dryRun) await lock(client);
  const pending = planUp(computePlan(files, await readRows(client)));
  if (pending.length === 0) {
    console.log("Nada pendiente.");
    return 0;
  }
  if (args.dryRun) {
    console.log("--dry-run: se aplicarian, en este orden:");
    for (const name of pending) console.log(`  ${name}  (${executionMode(contents.get(name))})`);
    return 0;
  }
  await ensureControlTable(client);
  for (const name of pending) {
    await runFile(client, name, contents.get(name), () =>
      client.query(`INSERT INTO ${CONTROL_TABLE} (name, checksum) VALUES ($1, $2)`, [name, checksums.get(name)]),
    );
    console.log(`  aplicada: ${name}`);
  }
  console.log(`\nAplicadas ${pending.length} migraciones.`);
  return 0;
}

async function cmdDown(client, args) {
  const { files, downs, contents } = await loadFiles();
  await lock(client);
  const toRevert = planDown(computePlan(files, await readRows(client)), args.to, downs);
  if (toRevert.length === 0) {
    console.log(`Nada que revertir: ${args.to} es la ultima registrada.`);
    return 0;
  }
  console.log("Se revertirian, en este orden:");
  for (const { name, down } of toRevert) console.log(`  ${name}  (con ${down})`);
  if (!args.yes) {
    console.log("\nNo se ha tocado nada. Repetir con --yes para revertirlas.");
    return 0;
  }
  for (const { name, down } of toRevert) {
    await runFile(client, down, contents.get(down), () =>
      client.query(`DELETE FROM ${CONTROL_TABLE} WHERE name = $1`, [name]),
    );
    console.log(`  revertida: ${name}`);
  }
  return 0;
}

const HANDLERS = { status: cmdStatus, baseline: cmdBaseline, up: cmdUp, down: cmdDown };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    console.log(HELP);
    return 0;
  }
  const client = await connect();
  try {
    return await HANDLERS[args.command](client, args);
  } finally {
    await client.end();
  }
}

// exitCode y no process.exit(): en Windows la salida por pipe es asincrona y un
// exit inmediato podria cortarla.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    // Los errores esperados salen sin traza; los inesperados (conexion, SQL), con
    // su mensaje. Nunca se imprime la URL de conexion.
    console.error(err instanceof MigrationError ? err.message : `Error: ${err.message}`);
    process.exitCode = 1;
  },
);
