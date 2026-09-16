import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USERS = JSON.parse(await readFile(path.resolve(HERE, "../fixtures/users.json"), "utf8"));

// Historico ficticio previo al hub (tabla de la migracion 0007). Solo lo leen
// /clientes y la ficha de cliente. Importes sinteticos.
const HISTORICAL = JSON.parse(await readFile(path.resolve(HERE, "../fixtures/historical.json"), "utf8"));

// Debe coincidir con DEFAULT_COMPANY de src/lib/auth/auth.ts: si no, el hook
// databaseHooks.user.create.after crearia una SEGUNDA empresa y los datos
// quedarian partidos entre dos company_id.
const COMPANY_NAME = "Ambientalia S.A.S.";

const CATEGORIES = [
  { name: "Aguas", color: "#2563eb", sort_order: 1 },
  { name: "Aire", color: "#16a34a", sort_order: 2 },
  { name: "Suelos", color: "#ca8a04", sort_order: 3 },
];

const GROUPS = [
  { name: "Ambiental", categories: ["Aguas", "Aire"], sort_order: 1 },
  { name: "Consultoria", categories: ["Suelos"], sort_order: 2 },
];

async function seedUser(client, companyId, user, { approved }) {
  // bcrypt cost 12, igual que auth.ts. NUNCA texto plano: ese fue el bug que
  // tumbo el login en produccion (13 caracteres planos donde iba un hash de 60).
  const hash = bcrypt.hashSync(user.password, 12);

  const { rows: [row] } = await client.query(
    `INSERT INTO "user" (name, email, "emailVerified") VALUES ($1, $2, true) RETURNING id`,
    [user.name, user.email],
  );

  // accountId y userId van como parametros separados aunque compartan valor:
  // reusar $1 en columnas de tipos distintos (text vs uuid) hace que Postgres
  // no pueda inferir un tipo unico para ese parametro y falla con
  // "inconsistent types deduced for parameter $1".
  await client.query(
    `INSERT INTO account ("accountId", "providerId", "userId", password)
     VALUES ($1, 'credential', $2, $3)`,
    [row.id, row.id, hash],
  );

  await client.query(
    `INSERT INTO profiles (id, company_id, role, is_active, is_approved, is_rejected)
     VALUES ($1, $2, $3, true, $4, false)`,
    [row.id, companyId, approved ? "admin" : "lector", approved],
  );

  return row.id;
}

export async function seedApp(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");

    const { rows: [company] } = await client.query(
      `INSERT INTO companies (name, country) VALUES ($1, 'CO') RETURNING id`,
      [COMPANY_NAME],
    );

    const categoryIds = new Map();
    for (const cat of CATEGORIES) {
      const { rows: [row] } = await client.query(
        `INSERT INTO categories (company_id, name, color, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [company.id, cat.name, cat.color, cat.sort_order],
      );
      categoryIds.set(cat.name, row.id);
    }

    for (const group of GROUPS) {
      const { rows: [row] } = await client.query(
        `INSERT INTO category_groups (company_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [company.id, group.name, group.sort_order],
      );
      for (const catName of group.categories) {
        await client.query(
          `INSERT INTO category_group_mappings (group_id, category_id, company_id) VALUES ($1, $2, $3)`,
          [row.id, categoryIds.get(catName), company.id],
        );
      }
    }

    for (const row of HISTORICAL.rows) {
      await client.query(
        `INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd)
         VALUES ($1, $2, $3, $4)`,
        [company.id, HISTORICAL.customer, row.year, row.amount],
      );
    }

    // Metas sinteticas del total de compania para el anio en curso: dos KPIs con
    // pesos que suman 100. Los ambitos por vendedor se dejan vacios a proposito.
    const anio = new Date().getFullYear();
    const METAS = [
      { key: "ventas_nuevos", target: 1000, weight: 60 },
      { key: "ventas_existentes", target: 2000, weight: 40 },
    ];
    for (const m of METAS) {
      await client.query(
        `INSERT INTO kpi_targets (company_id, record_year, kpi_key, target_value, weight_pct)
         VALUES ($1, $2, $3, $4, $5)`,
        [company.id, anio, m.key, m.target, m.weight],
      );
    }

    await seedUser(client, company.id, USERS.approved, { approved: true });
    await seedUser(client, company.id, USERS.pending, { approved: false });

    await client.query("COMMIT");
    console.log(`  app sembrada: 1 empresa, ${CATEGORIES.length} categorias, ${GROUPS.length} grupos, 2 usuarios, ${HISTORICAL.rows.length} filas de historico`);
    return { companyId: company.id, categoryIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
