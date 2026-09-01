# Tests E2E con Playwright — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suite E2E de humo que ejerza las rutas reales en Chromium contra una BD efímera determinista, corra igual en local y en CI, y bloquee el merge cuando algo se rompe.

**Architecture:** Un Postgres efímero aloja dos bases (la del app y un "hub falso" con las 5 tablas `books.*` que la app consulta). Scripts `.mjs` crean las bases, aplican las migraciones reales de `/drizzle` y siembran datos deterministas. Playwright levanta la app en modo producción, hace login una vez por la UI y reutiliza el `storageState`.

**Tech Stack:** `@playwright/test` (solo Chromium), Postgres 16 (Docker en local / service container en CI), `pg` y `bcryptjs` (ya son dependencias), Next 16 en `build` + `start`.

**Spec:** [`docs/superpowers/specs/2026-09-01-tests-e2e-playwright-design.md`](../specs/2026-09-01-tests-e2e-playwright-design.md)

---

## Restricciones que NO se pueden ignorar

Léelas antes de tocar nada. Cada una nace de un hecho verificado en el código, no de una preferencia.

### R1 — Presupuesto de logins: máximo 5 por minuto

`src/lib/auth/auth.ts` aplica rate limiting: `"/sign-in/email": { window: 60, max: 5 }`. Es por IP y está activo también fuera de producción (`enabled: true`).

La suite consume **3** de esos 5:
- 2 en `auth.setup.ts` (usuario aprobado + usuario pendiente)
- 1 en `auth.spec.ts` (el test de credenciales inválidas)

**Consecuencias operativas:**
- Si añades un cuarto login, quedas a uno del límite. Si añades un quinto, la suite empieza a fallar con 429 de forma intermitente.
- Los proyectos `setup` y `auth` van con **`retries: 0`**. Con reintentos, un fallo real dispararía logins extra, se toparía con el 429 y el reintento fallaría por una razón distinta a la original — enmascarando el bug.
- **No se modifica `auth.ts` para relajar el límite.** Meter un env var que debilite un control de seguridad para que pasen los tests es exactamente el tipo de atajo que acaba activado en producción. Se diseña dentro del presupuesto.

### R2 — La contraseña de la semilla debe tener 10+ caracteres

`auth.ts` fija `minPasswordLength: 10`. Una contraseña más corta hace fallar el login con un error de validación confuso.

### R3 — `account.password` lleva un hash bcrypt real de cost 12

Es el campo que tumbó el login en producción por contener texto plano. La semilla lo genera con `bcrypt.hashSync(password, 12)`. Nunca texto plano, nunca un hash pegado a mano.

### R4 — La empresa de la semilla debe llamarse `Ambientalia S.A.S.`

`auth.ts` define `DEFAULT_COMPANY = "Ambientalia S.A.S."` y su hook `databaseHooks.user.create.after` crea la empresa si no existe. Si la semilla usa otro nombre, cualquier registro futuro durante los tests crearía una segunda empresa y los datos quedarían partidos entre dos `company_id`.

### R5 — El paso de vitest en CI no debe ver `DATABASE_URL`

`src/lib/auth/__tests__/auth.smoke.test.ts` se salta cuando no hay `DATABASE_URL`. Estado actual verificado: **117 pasan + 1 saltado**. Si el job de E2E exporta `DATABASE_URL` al entorno del paso de vitest, ese test dejaría de saltarse y correría contra la BD de E2E sin que nadie lo haya pedido. Mantener los pasos con entornos separados.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `e2e/docker-compose.e2e.yml` | Levanta el motor Postgres en local. Nada más. |
| `e2e/fixtures/users.json` | Credenciales de los dos usuarios semilla. **Única fuente**: la leen los scripts `.mjs` y los specs `.ts`. |
| `e2e/db/config.mjs` | Cadenas de conexión derivadas de un único host/puerto. |
| `e2e/db/hub-schema.sql` | Las 5 tablas `books.*` del hub falso. |
| `e2e/db/apply-migrations.mjs` | Aplica `/drizzle/*.sql` en orden numérico. |
| `e2e/db/seed-app.mjs` | Empresa, categorías, grupos, usuarios + profiles. |
| `e2e/db/seed-hub.mjs` | Ítems, pedidos, facturas y sus líneas. |
| `e2e/db/reset.mjs` | Orquestador: recrea ambas bases desde cero y siembra. |
| `e2e/constants.ts` | Rutas de `storageState` y re-export tipado de `users.json`. |
| `e2e/auth.setup.ts` | Login por UI de ambos usuarios; guarda los `storageState`. |
| `e2e/specs/*.spec.ts` | Los tests. Uno por área. |
| `playwright.config.ts` | Configuración: proyectos, `webServer`, viewport, retries. |

Los `.mjs` quedan **fuera** de `npm run typecheck` por construcción: el `include` de `tsconfig.json` sólo cubre `**/*.ts`, `**/*.tsx` y `**/*.mts`. Los `.ts` de `e2e/` entran automáticamente, que es lo que queremos.

---

### Task 1: Motor Postgres efímero y creación de las dos bases

**Files:**
- Create: `e2e/docker-compose.e2e.yml`
- Create: `e2e/db/config.mjs`
- Modify: `package.json` (bloque `scripts`)

- [ ] **Step 1: Escribir el Compose**

`e2e/docker-compose.e2e.yml`:

```yaml
# Motor Postgres para los tests E2E. Solo levanta el servidor: las dos bases
# (salestracker_e2e y zoho_hub_e2e) las crea e2e/db/reset.mjs, para que el mismo
# script sirva aqui y en el service container de CI, sin logica duplicada.
services:
  postgres-e2e:
    image: postgres:16-alpine
    container_name: salestracker-postgres-e2e
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      # Puerto no estandar a proposito: no debe chocar con un Postgres local.
      - "55432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 3s
      retries: 30
```

- [ ] **Step 2: Escribir la configuración de conexión**

`e2e/db/config.mjs`:

```js
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
```

- [ ] **Step 3: Añadir los scripts de npm**

En `package.json`, dentro de `"scripts"`, añadir tras `"test:watch"`:

```json
    "e2e:db:up": "docker compose -f e2e/docker-compose.e2e.yml up -d --wait",
    "e2e:db:down": "docker compose -f e2e/docker-compose.e2e.yml down -v",
```

- [ ] **Step 4: Verificar que el motor levanta y acepta conexiones**

```bash
npm run e2e:db:up
docker exec salestracker-postgres-e2e psql -U postgres -c "SELECT 1;"
```

Esperado: `--with-wait` retorna sin error y el `SELECT 1` imprime una fila con `1`.

- [ ] **Step 5: Commit**

```bash
git add e2e/docker-compose.e2e.yml e2e/db/config.mjs package.json
git commit -m "test(e2e): motor Postgres efimero y configuracion de conexion"
```

---

### Task 2: Aplicar las migraciones reales desde cero

Este script no copia el esquema: aplica los mismos ficheros que ejecuta el operador en producción. Efecto lateral valioso: cada corrida comprueba que `/drizzle` es aplicable sobre una base vacía.

**Files:**
- Create: `e2e/db/apply-migrations.mjs`

- [ ] **Step 1: Escribir el script**

`e2e/db/apply-migrations.mjs`:

```js
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
```

- [ ] **Step 2: Verificar en una base desechable que las 13 tablas quedan creadas**

```bash
docker exec salestracker-postgres-e2e psql -U postgres -c "DROP DATABASE IF EXISTS tmp_check; CREATE DATABASE tmp_check;"
node --input-type=module -e "import('./e2e/db/apply-migrations.mjs').then(m => m.applyMigrations('postgres://postgres:postgres@127.0.0.1:55432/tmp_check')).then(f => console.log('OK', f.length, 'migraciones'))"
docker exec salestracker-postgres-e2e psql -U postgres -d tmp_check -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
```

Esperado: `OK 7 migraciones` y un `count` de **13** tablas (`user`, `session`, `account`, `verification`, `companies`, `profiles`, `categories`, `category_groups`, `category_group_mappings`, `sales_records`, `subscriptions`, `favorites`, `saved_views`).

- [ ] **Step 3: Limpiar la base desechable**

```bash
docker exec salestracker-postgres-e2e psql -U postgres -c "DROP DATABASE tmp_check;"
```

- [ ] **Step 4: Commit**

```bash
git add e2e/db/apply-migrations.mjs
git commit -m "test(e2e): aplicar las migraciones de /drizzle desde cero"
```

---

### Task 3: Esquema del hub falso

Sólo se replican las columnas que la app lee de verdad. Salieron de leer `src/db/hub-sales.ts`, `hub-customer-sales.ts` y `hub-margin.ts`.

**Files:**
- Create: `e2e/db/hub-schema.sql`

- [ ] **Step 1: Escribir el esquema**

`e2e/db/hub-schema.sql`:

```sql
-- Replica minima del zoho-hub: SOLO las columnas que consultan src/db/hub-*.ts.
-- No es el esquema real del hub, es la superficie que la app usa.
CREATE SCHEMA IF NOT EXISTS books;

CREATE TABLE books.items (
  item_id       text PRIMARY KEY,
  name          text NOT NULL,
  sku           text,
  category_name text,
  -- raw->>'purchase_rate' es el costo estandar que usa la pestana Margen.
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.sales_orders (
  salesorder_id text PRIMARY KEY,
  date          date,
  status        text NOT NULL,
  customer_name text,
  bcy_sub_total numeric,
  -- raw->>'invoiced_status' alimenta el calculo de BACKLOG.
  -- raw->>'bcy_discount_total' es el descuento de cabecera.
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.salesorder_line_items (
  line_item_id  text PRIMARY KEY,
  salesorder_id text NOT NULL REFERENCES books.sales_orders(salesorder_id),
  item_id       text REFERENCES books.items(item_id),
  bcy_rate      numeric,
  quantity      numeric
);

CREATE TABLE books.invoices (
  invoice_id    text PRIMARY KEY,
  salesorder_id text,
  date          date,
  status        text NOT NULL,
  customer_name text,
  bcy_sub_total numeric,
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.invoice_line_items (
  line_item_id text PRIMARY KEY,
  invoice_id   text NOT NULL REFERENCES books.invoices(invoice_id),
  item_id      text REFERENCES books.items(item_id),
  bcy_rate     numeric,
  quantity     numeric
);
```

- [ ] **Step 2: Verificar que el SQL es válido**

```bash
docker exec salestracker-postgres-e2e psql -U postgres -c "DROP DATABASE IF EXISTS tmp_hub; CREATE DATABASE tmp_hub;"
docker exec -i salestracker-postgres-e2e psql -U postgres -d tmp_hub -v ON_ERROR_STOP=1 < e2e/db/hub-schema.sql
docker exec salestracker-postgres-e2e psql -U postgres -d tmp_hub -c "SELECT table_name FROM information_schema.tables WHERE table_schema='books' ORDER BY 1;"
docker exec salestracker-postgres-e2e psql -U postgres -c "DROP DATABASE tmp_hub;"
```

Esperado: las 5 tablas listadas — `invoice_line_items`, `invoices`, `items`, `sales_orders`, `salesorder_line_items`.

- [ ] **Step 3: Commit**

```bash
git add e2e/db/hub-schema.sql
git commit -m "test(e2e): esquema del hub falso (5 tablas books.*)"
```

---

### Task 4: Credenciales compartidas de los usuarios semilla

Un único fichero JSON, leído tanto por los scripts `.mjs` como por los specs `.ts`. Duplicar las credenciales en dos sitios es una fuente garantizada de bugs cuando alguien cambie una.

**Files:**
- Create: `e2e/fixtures/users.json`
- Create: `e2e/constants.ts`

- [ ] **Step 1: Escribir el fixture**

`e2e/fixtures/users.json`:

```json
{
  "approved": {
    "email": "e2e-aprobado@example.test",
    "password": "E2ePassw0rd!2026",
    "name": "E2E Aprobado"
  },
  "pending": {
    "email": "e2e-pendiente@example.test",
    "password": "E2ePassw0rd!2026",
    "name": "E2E Pendiente"
  }
}
```

La contraseña tiene 16 caracteres: cumple el `minPasswordLength: 10` de R2. El dominio `.test` está reservado por RFC 2606 y no resuelve a ningún sitio real.

- [ ] **Step 2: Escribir las constantes tipadas**

`e2e/constants.ts`:

```ts
import users from "./fixtures/users.json";

export const APPROVED_USER = users.approved;
export const PENDING_USER = users.pending;

/** storageState del usuario aprobado. Contiene cookies de sesion reales: va en .gitignore. */
export const APPROVED_STATE = "e2e/.auth/approved.json";
/** storageState del usuario pendiente de aprobacion. */
export const PENDING_STATE = "e2e/.auth/pending.json";

/** Empresa por defecto. Debe coincidir con DEFAULT_COMPANY de src/lib/auth/auth.ts. */
export const COMPANY_NAME = "Ambientalia S.A.S.";

/** Categorias sembradas. El nombre mapea 1:1 con books.items.category_name del hub falso. */
export const CATEGORIES = ["Aguas", "Aire", "Suelos"] as const;

/**
 * 2021 solo tiene datos de 'Aguas'. Ese hueco deliberado es lo que reproduce
 * el bug del bucket de anio inexistente (commit 9dc66ee).
 */
export const YEAR_WITH_GAPS = 2021;
export const CATEGORY_MISSING_IN_GAP_YEAR = "Aire";
```

- [ ] **Step 3: Verificar que typecheck acepta el import de JSON**

```bash
npm run typecheck
```

Esperado: sin errores. (`resolveJsonModule: true` ya está en `tsconfig.json`, y el `include` de `**/*.ts` recoge `e2e/` automáticamente.)

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/users.json e2e/constants.ts
git commit -m "test(e2e): credenciales y constantes compartidas de la semilla"
```

---

### Task 5: Semilla de la base del app

**Files:**
- Create: `e2e/db/seed-app.mjs`

- [ ] **Step 1: Escribir la semilla**

`e2e/db/seed-app.mjs`:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USERS = JSON.parse(await readFile(path.resolve(HERE, "../fixtures/users.json"), "utf8"));

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

  // accountId es text y userId es uuid: NO se puede reutilizar $1 para ambos.
  // Postgres no logra inferir un tipo unico y falla con
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

    await seedUser(client, company.id, USERS.approved, { approved: true });
    await seedUser(client, company.id, USERS.pending, { approved: false });

    await client.query("COMMIT");
    console.log(`  app sembrada: 1 empresa, ${CATEGORIES.length} categorias, ${GROUPS.length} grupos, 2 usuarios`);
    return { companyId: company.id, categoryIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
```

Nota deliberada: **no se siembra `sales_records`.** Con `HUB_DB_URL` presente, `getSalesData` toma siempre la rama del hub (`src/actions/sales-actions.ts:41`) y `sales_records` queda muerto. Sembrarlo daría una falsa sensación de cobertura. La rama de fallback queda registrada como hueco conocido en la sección "Huecos conocidos" al final de este plan.

- [ ] **Step 2: Commit** (se verifica junto al orquestador en la Task 7)

```bash
git add e2e/db/seed-app.mjs
git commit -m "test(e2e): semilla de la base del app (empresa, categorias, grupos, usuarios)"
```

---

### Task 6: Semilla del hub falso

**Files:**
- Create: `e2e/db/seed-hub.mjs`

- [ ] **Step 1: Escribir la semilla**

`e2e/db/seed-hub.mjs`:

```js
import pg from "pg";

// Los category_name mapean por NOMBRE a las categorias del app (asi lo hace
// src/actions/sales-actions.ts). purchase_rate > 0 = bien con costo; 0 = servicio.
const ITEMS = [
  { item_id: "IT-001", name: "Analisis de agua residual", sku: "AGU-01", category_name: "Aguas", purchase_rate: 120 },
  { item_id: "IT-002", name: "Muestreo de agua potable", sku: "AGU-02", category_name: "Aguas", purchase_rate: 80 },
  { item_id: "IT-003", name: "Monitoreo de emisiones", sku: "AIR-01", category_name: "Aire", purchase_rate: 200 },
  { item_id: "IT-004", name: "Caracterizacion de suelo", sku: "SUE-01", category_name: "Suelos", purchase_rate: 0 },
  { item_id: "IT-005", name: "Asesoria ambiental", sku: "SUE-02", category_name: "Suelos", purchase_rate: 0 },
];

const CUSTOMERS = [
  "Alfa Industrial",
  "Beta Minera",
  "Gamma Agro",
  "Delta Textil",
  "Epsilon Energia",
];

const YEARS = [2021, 2022, 2023, 2024];

/**
 * 2021 solo tiene ventas de 'Aguas'. Ese hueco es DELIBERADO: reproduce la
 * condicion del bug 9dc66ee (bucket de anio inexistente) — un anio que si
 * aparece en el selector, pero que para una categoria concreta no tiene datos.
 */
function itemsForYear(year) {
  return year === 2021 ? ITEMS.filter((i) => i.category_name === "Aguas") : ITEMS;
}

// Importes deterministas: sin RNG, para que dos corridas den exactamente lo mismo.
function amountFor(year, month, itemIndex) {
  return 100 + (year - 2021) * 50 + month * 10 + itemIndex * 7;
}

export async function seedHub(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");

    for (const item of ITEMS) {
      await client.query(
        `INSERT INTO books.items (item_id, name, sku, category_name, raw)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [item.item_id, item.name, item.sku, item.category_name,
         JSON.stringify({ purchase_rate: String(item.purchase_rate) })],
      );
    }

    let orders = 0;
    let invoices = 0;

    for (const year of YEARS) {
      const items = itemsForYear(year);
      for (let month = 1; month <= 12; month++) {
        const customer = CUSTOMERS[(month - 1) % CUSTOMERS.length];
        const date = `${year}-${String(month).padStart(2, "0")}-15`;
        const soId = `SO-${year}-${String(month).padStart(2, "0")}`;
        // Meses pares llevan factura; los impares quedan sin facturar (alimenta BACKLOG).
        const hasInvoice = month % 2 === 0;

        const lines = items.map((item, idx) => ({
          line_item_id: `${soId}-L${idx}`,
          item_id: item.item_id,
          bcy_rate: amountFor(year, month, idx),
          quantity: 2,
        }));
        const subTotal = lines.reduce((acc, l) => acc + l.bcy_rate * l.quantity, 0);

        await client.query(
          `INSERT INTO books.sales_orders (salesorder_id, date, status, customer_name, bcy_sub_total, raw)
           VALUES ($1, $2, 'confirmed', $3, $4, $5::jsonb)`,
          [soId, date, customer, subTotal,
           JSON.stringify({
             invoiced_status: hasInvoice ? "invoiced" : "not_invoiced",
             bcy_discount_total: "0",
           })],
        );
        orders++;

        for (const line of lines) {
          await client.query(
            `INSERT INTO books.salesorder_line_items (line_item_id, salesorder_id, item_id, bcy_rate, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [line.line_item_id, soId, line.item_id, line.bcy_rate, line.quantity],
          );
        }

        if (!hasInvoice) continue;

        const invId = `INV-${year}-${String(month).padStart(2, "0")}`;
        await client.query(
          `INSERT INTO books.invoices (invoice_id, salesorder_id, date, status, customer_name, bcy_sub_total, raw)
           VALUES ($1, $2, $3, 'paid', $4, $5, $6::jsonb)`,
          [invId, soId, date, customer, subTotal, JSON.stringify({ bcy_discount_total: "0" })],
        );
        invoices++;

        for (const [idx, line] of lines.entries()) {
          await client.query(
            `INSERT INTO books.invoice_line_items (line_item_id, invoice_id, item_id, bcy_rate, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [`${invId}-L${idx}`, invId, line.item_id, line.bcy_rate, line.quantity],
          );
        }
      }
    }

    await client.query("COMMIT");
    console.log(`  hub sembrado: ${ITEMS.length} items, ${orders} pedidos, ${invoices} facturas`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 2: Commit** (se verifica junto al orquestador en la Task 7)

```bash
git add e2e/db/seed-hub.mjs
git commit -m "test(e2e): semilla del hub falso con hueco deliberado en 2021"
```

---

### Task 7: Orquestador de reset y verificación de la semilla

**Files:**
- Create: `e2e/db/reset.mjs`
- Modify: `package.json` (bloque `scripts`)

- [ ] **Step 1: Escribir el orquestador**

`e2e/db/reset.mjs`:

```js
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
```

- [ ] **Step 2: Añadir el script de npm**

En `package.json`, junto a los de la Task 1:

```json
    "e2e:db:reset": "node e2e/db/reset.mjs",
```

- [ ] **Step 3: Ejecutarlo y verificar los datos sembrados**

```bash
npm run e2e:db:up
npm run e2e:db:reset
```

Esperado en la salida: `7 migraciones`, `app sembrada: 1 empresa, 3 categorias, 2 grupos, 2 usuarios`, `hub sembrado: 5 items, 48 pedidos, 24 facturas`, `Listo.`

- [ ] **Step 4: Verificar el hash bcrypt (R3) y el hueco de 2021**

```bash
docker exec salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -c "SELECT length(password) AS largo, left(password,3) AS prefijo FROM account;"
docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT extract(year from s.date)::int AS anio, it.category_name, count(*) FROM books.salesorder_line_items l JOIN books.sales_orders s ON s.salesorder_id=l.salesorder_id JOIN books.items it ON it.item_id=l.item_id GROUP BY 1,2 ORDER BY 1,2;"
```

Esperado:
- Las dos filas de `account` con `largo = 60` y `prefijo = $2b` (o `$2a`). Si sale otra cosa, la semilla está guardando algo que no es un hash bcrypt y el login fallará igual que falló en producción.
- Para `anio = 2021` aparece **solo** `Aguas`. Para 2022, 2023 y 2024 aparecen `Aguas`, `Aire` y `Suelos`. Ese hueco es el que reproduce el bug #3.

- [ ] **Step 5: Commit**

```bash
git add e2e/db/reset.mjs package.json
git commit -m "test(e2e): orquestador de reset de las bases de E2E"
```

---

### Task 8: Instalar Playwright y configurarlo

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar la dependencia y el navegador**

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Ignorar los artefactos y, sobre todo, el storageState**

Añadir al final de `.gitignore`:

```gitignore
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/

# storageState de los tests E2E: contiene cookies de sesion reales. Nunca versionar.
/e2e/.auth/
```

- [ ] **Step 3: Escribir la configuración**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const PG_HOST = process.env.E2E_PG_HOST ?? "127.0.0.1";
const PG_PORT = process.env.E2E_PG_PORT ?? "55432";
const PG_BASE = `postgres://postgres:postgres@${PG_HOST}:${PG_PORT}`;

export default defineConfig({
  testDir: "./e2e/specs",
  // Serie estricta: las pruebas comparten una unica BD y el login tiene un
  // presupuesto de 5 intentos por minuto (ver R1 del plan). El paralelismo
  // convertiria ambas cosas en carreras.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Fijo: Recharts y react-grid-layout dependen del ancho disponible.
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testDir: "./e2e",
      testMatch: /auth\.setup\.ts/,
      // Sin reintentos: cada reintento gastaria logins del presupuesto de R1.
      retries: 0,
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      retries: 0,
    },
    {
      name: "chromium",
      testIgnore: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      retries: process.env.CI ? 2 : 0,
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: `${PG_BASE}/salestracker_e2e`,
      HUB_DB_URL: `${PG_BASE}/zoho_hub_e2e`,
      // Secreto de un entorno efimero: no se usa en ningun sitio real.
      BETTER_AUTH_SECRET: "e2e-secret-solo-para-tests-0123456789abcdef",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
```

- [ ] **Step 4: Verificar que la configuración carga**

```bash
npx playwright test --list
```

Esperado: `Listing tests: ... Total: 0 tests in 0 files` (aún no hay specs) y **ningún error de configuración**.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json package-lock.json .gitignore
git commit -m "test(e2e): instalar Playwright y configurar Chromium contra la BD efimera"
```

---

### Task 9: Login por UI y storageState reutilizable

**Files:**
- Create: `e2e/auth.setup.ts`

- [ ] **Step 1: Escribir el setup**

`e2e/auth.setup.ts`:

```ts
import { test as setup, expect, type Page } from "@playwright/test";
import { APPROVED_USER, PENDING_USER, APPROVED_STATE, PENDING_STATE } from "./constants";

/**
 * Login real por formulario. NO se falsifica la cookie: src/middleware.ts consulta
 * la tabla profiles en cada request, asi que la sesion tiene que existir de verdad.
 *
 * Consume 1 del presupuesto de 5 logins/minuto (R1 del plan). Este fichero gasta 2.
 */
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
}

setup("autenticar al usuario aprobado", async ({ page }) => {
  await login(page, APPROVED_USER.email, APPROVED_USER.password);

  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  await page.context().storageState({ path: APPROVED_STATE });
});

setup("autenticar al usuario pendiente de aprobación", async ({ page }) => {
  await login(page, PENDING_USER.email, PENDING_USER.password);

  // El middleware manda a /waiting-approval a quien no esta aprobado.
  await page.waitForURL("**/waiting-approval");

  await page.context().storageState({ path: PENDING_STATE });
});
```

- [ ] **Step 2: Ejecutar el setup y verificar que produce los dos ficheros**

```bash
npm run e2e:db:reset
npx playwright test --project=setup
ls e2e/.auth
```

Esperado: 2 tests en verde y los ficheros `approved.json` y `pending.json` presentes.

Si el login falla con un error de credenciales, comprobar primero el hash con la consulta del Step 4 de la Task 7: es el fallo más probable.

- [ ] **Step 3: Commit**

```bash
git add e2e/auth.setup.ts
git commit -m "test(e2e): login por UI y storageState de ambos usuarios"
```

---

### Task 10: Spec de autenticación

**Files:**
- Create: `e2e/specs/auth.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/auth.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_USER, APPROVED_STATE, PENDING_STATE } from "../constants";

test.describe("autenticación", () => {
  test("un visitante anónimo es redirigido a /login", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  });

  // Este test gasta el tercer y ultimo login del presupuesto de R1.
  // NO anadir mas intentos de sign-in a la suite sin releer esa restriccion.
  test("unas credenciales inválidas muestran error y no dejan entrar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(APPROVED_USER.email);
    await page.getByLabel("Contraseña").fill("ContrasenaIncorrecta!99");
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();

    await expect(page.getByText("Error al iniciar sesión")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("con sesión aprobada", () => {
    test.use({ storageState: APPROVED_STATE });

    test("entra a /home y ve el dashboard", async ({ page }) => {
      await page.goto("/home");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();
    });

    test("visitar /login redirige a /home", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/home$/);
    });
  });

  test.describe("con sesión pendiente de aprobación", () => {
    test.use({ storageState: PENDING_STATE });

    test("cualquier ruta del dashboard redirige a /waiting-approval", async ({ page }) => {
      await page.goto("/analytics");
      await expect(page).toHaveURL(/\/waiting-approval$/);
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que pasa**

```bash
npm run e2e:db:reset
npx playwright test --project=auth
```

Esperado: 5 tests en verde.

- [ ] **Step 3: Verificar que el test detecta una regresión real**

Comentar temporalmente el redirect de no-autenticado en `src/middleware.ts:14`, sustituyéndolo por `return NextResponse.next();`, y volver a lanzar:

```bash
npx playwright test --project=auth
```

Esperado: **falla** el test "un visitante anónimo es redirigido a /login". Si pasa, el test no está probando nada. Restaurar el fichero después:

```bash
git checkout src/middleware.ts
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/auth.spec.ts
git commit -m "test(e2e): spec de autenticacion (login, credenciales invalidas, redirects)"
```

---

### Task 11: Spec de navegación por las 9 rutas

Todas las páginas del dashboard renderizan un `<h1>`, lo que permite una comprobación uniforme sin depender de selectores frágiles por página.

**Files:**
- Create: `e2e/specs/navigation.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/navigation.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/** Ruta + el texto exacto de su <h1>, leido de cada page.tsx. */
const ROUTES = [
  { path: "/home", heading: "Dashboard General" },
  { path: "/analytics", heading: /Análisis/i },
  { path: "/clientes", heading: "Ventas por cliente" },
  { path: "/clientes/Alfa%20Industrial", heading: "Alfa Industrial" },
  { path: "/articulos", heading: "Ventas por artículo" },
  { path: "/cliente-articulo", heading: "Ventas por cliente × artículo" },
  { path: "/categories", heading: "Categorías" },
  { path: "/tablas", heading: "Tablas de Datos" },
  { path: "/settings", heading: /Ajustes|Configuración/i },
] as const;

/**
 * Errores de consola que NO cuentan como fallo. La lista se mantiene CORTA y
 * cada entrada lleva su motivo: una lista larga vacia el valor de la assertion.
 */
const IGNORED_CONSOLE = [
  // El favicon no existe en el entorno de test y su 404 no es un defecto del app.
  /favicon\.ico/,
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((rx) => rx.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

for (const route of ROUTES) {
  test(`${route.path} carga sin errores`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(route.path);

    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

    // El error boundary de Next se anuncia con este texto; si aparece, la pagina reventó.
    await expect(page.getByText("Application error")).toHaveCount(0);

    expect(errors, `Errores de consola en ${route.path}:\n${errors.join("\n")}`).toEqual([]);
  });
}
```

- [ ] **Step 2: Ejecutar**

```bash
npm run e2e:db:reset
npx playwright test --project=chromium e2e/specs/navigation.spec.ts
```

Esperado: 9 tests en verde.

Si `/analytics` o `/settings` fallan por el texto del `<h1>`, abrir el `page.tsx` correspondiente y ajustar la expresión regular al texto real. Son los dos únicos `<h1>` con contenido dinámico o interpolado.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/navigation.spec.ts
git commit -m "test(e2e): smoke de navegacion por las 9 rutas del dashboard"
```

---

### Task 12: Regresión del command palette (bug #1, commit e63dbb3)

Causa raíz del bug: el diálogo no iba envuelto en `<Command>`, y cmdk necesita ese root. El síntoma era `Cannot read properties of undefined (reading 'subscribe')` al abrirlo.

**Files:**
- Create: `e2e/specs/command-palette.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/command-palette.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

// Se abre desde varias rutas porque el bug original era de montaje del provider:
// funcionaba en unas paginas y reventaba en otras.
const ROUTES = ["/home", "/analytics", "/clientes", "/articulos", "/tablas"];

for (const route of ROUTES) {
  test(`el command palette abre desde ${route} sin reventar`, async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (err) => crashes.push(err.message));

    await page.goto(route);
    await page.getByRole("heading", { level: 1 }).first().waitFor();

    await page.keyboard.press("ControlOrMeta+k");

    // El dialogo debe montarse: si falta el root <Command>, cmdk lanza al abrir
    // y este dialogo nunca aparece.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    expect(crashes, `El palette lanzó en ${route}:\n${crashes.join("\n")}`).toEqual([]);
  });
}

test("buscar en el palette y navegar al resultado", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("heading", { level: 1 }).waitFor();

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.type("Alfa");

  const option = dialog.getByText("Alfa Industrial").first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/clientes\//);
});
```

- [ ] **Step 2: Ejecutar y verificar que pasa**

```bash
npx playwright test --project=chromium e2e/specs/command-palette.spec.ts
```

Esperado: 6 tests en verde.

- [ ] **Step 3: Verificar que el test atrapa el bug original**

El arreglo ya está en `main`. Revertirlo para comprobar que el test lo detecta:

```bash
git revert --no-commit e63dbb3
npx playwright test --project=chromium e2e/specs/command-palette.spec.ts
```

Esperado: **falla**. Si pasa, el test no reproduce el bug y hay que rehacerlo.

Restaurar:

```bash
git revert --abort || git checkout -- src
git status --short
```

Esperado: árbol limpio.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/command-palette.spec.ts
git commit -m "test(e2e): regresion del command palette (bug e63dbb3)"
```

---

### Task 13: Regresión del ancho de la rejilla (bug #2, commit 1af997a)

Causa raíz: el contenedor medido no estaba montado **durante la carga**, así que react-grid-layout calculaba un ancho equivocado. El detalle que importa: el bug se manifiesta en el momento de la carga, no en el estado final. Un test que solo mire la rejilla ya asentada no lo atrapa.

**Files:**
- Create: `e2e/specs/dashboard.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/dashboard.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const VIEWPORT_WIDTH = 1440;

test("la rejilla ocupa el ancho completo desde la primera carga", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  const grid = page.locator(".react-grid-layout").first();
  await expect(grid).toBeVisible();

  // El bug daba una rejilla estrecha (el contenedor medido no estaba montado al
  // calcular el ancho). Se exige que ocupe la mayor parte del viewport, con
  // margen para el sidebar y los paddings del layout.
  await expect(async () => {
    const box = await grid.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(VIEWPORT_WIDTH * 0.6);
  }).toPass();
});

test("recargar no encoge la rejilla", async ({ page }) => {
  await page.goto("/home");
  const grid = page.locator(".react-grid-layout").first();
  await expect(grid).toBeVisible();

  const before = await grid.boundingBox();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();
  await expect(grid).toBeVisible();

  await expect(async () => {
    const after = await grid.boundingBox();
    expect(after).not.toBeNull();
    // Mismo ancho tras recargar, con 2px de tolerancia por redondeo de layout.
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(2);
  }).toPass();
});

test("el layout personalizado sobrevive a una recarga", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  await page.getByRole("button", { name: /Personalizar/i }).click();

  const widgets = page.locator(".react-grid-item");
  const countBefore = await widgets.count();
  expect(countBefore).toBeGreaterThan(0);

  // Arrastrar el primer widget hacia la derecha.
  const first = widgets.first();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 1.5, box!.y + 20, { steps: 12 });
  await page.mouse.up();

  await page.getByRole("button", { name: /Guardar|Listo|Terminar/i }).click();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  // El numero de widgets persiste: el layout se guardo y se releyo desde saved_views.
  await expect(page.locator(".react-grid-item")).toHaveCount(countBefore);
});
```

Si el nombre del botón de salir del modo edición no coincide, abrir `src/app/(dashboard)/home/page.tsx` y el componente de la rejilla, y ajustar la expresión regular al texto real. La alternativa (seleccionar por clase de Tailwind) está prohibida por la sección 5 del spec.

- [ ] **Step 2: Ejecutar**

```bash
npx playwright test --project=chromium e2e/specs/dashboard.spec.ts
```

Esperado: 3 tests en verde.

- [ ] **Step 3: Verificar que el test atrapa el bug original**

```bash
git revert --no-commit 1af997a
npx playwright test --project=chromium e2e/specs/dashboard.spec.ts
```

Esperado: **falla** "la rejilla ocupa el ancho completo desde la primera carga".

Restaurar:

```bash
git revert --abort || git checkout -- src
git status --short
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/dashboard.spec.ts
git commit -m "test(e2e): regresion del ancho de la rejilla y persistencia del layout (bug 1af997a)"
```

---

### Task 14: Regresión del bucket de año inexistente (bug #3, commit 9dc66ee)

Causa raíz: al filtrar un año que existe en el selector pero sin datos para la agrupación pedida, el bucket no existía y el gráfico quedaba vacío en vez de mostrar un estado vacío legible.

La semilla reproduce exactamente esa condición: **2021 sólo tiene ventas de `Aguas`**, así que filtrar 2021 por `Aire` da un bucket ausente.

**Files:**
- Create: `e2e/specs/charts.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/charts.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE, YEAR_WITH_GAPS, CATEGORY_MISSING_IN_GAP_YEAR } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("un año con datos parciales no deja el gráfico roto", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // La semilla deja 2021 con datos SOLO de 'Aguas': filtrar ese anio por otra
  // categoria reproduce el bucket ausente del bug 9dc66ee.
  await page.getByRole("combobox", { name: /año/i }).selectOption(String(YEAR_WITH_GAPS));

  await expect(page.getByText(CATEGORY_MISSING_IN_GAP_YEAR).first()).toBeVisible();

  // La pagina sigue viva: cabecera presente y sin excepciones sin capturar.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(crashes, `La pagina lanzó al filtrar ${YEAR_WITH_GAPS}:\n${crashes.join("\n")}`).toEqual([]);
});

test("cambiar de año no rompe el renderizado de los gráficos", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const year of [2024, 2023, 2022, 2021]) {
    await page.getByRole("combobox", { name: /año/i }).selectOption(String(year));
    // Recharts monta en un <svg>: se espera a que exista al menos uno.
    await expect(async () => {
      expect(await page.locator("svg.recharts-surface").count()).toBeGreaterThan(0);
    }).toPass();
  }

  expect(crashes, `Excepciones al cambiar de anio:\n${crashes.join("\n")}`).toEqual([]);
});
```

Si el selector de año no es un `<select>` nativo (base-ui puede renderizarlo como botón + listbox), sustituir `selectOption` por:

```ts
await page.getByRole("combobox", { name: /año/i }).click();
await page.getByRole("option", { name: String(YEAR_WITH_GAPS) }).click();
```

Comprobar cuál aplica abriendo `src/app/(dashboard)/analytics/page.tsx`.

- [ ] **Step 2: Ejecutar**

```bash
npx playwright test --project=chromium e2e/specs/charts.spec.ts
```

Esperado: 2 tests en verde.

- [ ] **Step 3: Verificar que el test atrapa el bug original**

```bash
git revert --no-commit 9dc66ee
npx playwright test --project=chromium e2e/specs/charts.spec.ts
```

Esperado: **falla**.

Restaurar:

```bash
git revert --abort || git checkout -- src
git status --short
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/charts.spec.ts
git commit -m "test(e2e): regresion del bucket de anio inexistente (bug 9dc66ee)"
```

---

### Task 15: Spec de exportación

**Files:**
- Create: `e2e/specs/export.spec.ts`

- [ ] **Step 1: Escribir el test**

`e2e/specs/export.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("exportar a Excel descarga un fichero no vacío", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Excel/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buffer = Buffer.concat(chunks);

  expect(buffer.length).toBeGreaterThan(1000);
  // Un .xlsx es un ZIP: debe empezar por la firma PK.
  expect(buffer.subarray(0, 2).toString()).toBe("PK");
});

test("exportar a CSV descarga un fichero con filas", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CSV/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");

  // Cabecera + al menos una fila de datos.
  expect(text.trim().split("\n").length).toBeGreaterThan(1);
});
```

Si los botones de exportación no están en `/tablas` sino en otra ruta, localizarlos con `grep -rn "Excel" src/components src/app` y ajustar la navegación.

- [ ] **Step 2: Ejecutar**

```bash
npx playwright test --project=chromium e2e/specs/export.spec.ts
```

Esperado: 2 tests en verde.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/export.spec.ts
git commit -m "test(e2e): spec de exportacion a Excel y CSV"
```

---

### Task 16: Script único de E2E y verificación completa en local

**Files:**
- Modify: `package.json` (bloque `scripts`)

- [ ] **Step 1: Añadir los scripts**

En `package.json`:

```json
    "test:e2e": "npm run e2e:db:up && npm run e2e:db:reset && playwright test",
    "test:e2e:ui": "playwright test --ui",
```

- [ ] **Step 2: Correr la suite entera desde cero**

```bash
npm run e2e:db:down
npm run test:e2e
```

Esperado: todos los tests en verde. Suma prevista: 2 (setup) + 5 (auth) + 9 (navegación) + 6 (palette) + 3 (dashboard) + 2 (charts) + 2 (export) = **29**.

- [ ] **Step 3: Correrla dos veces seguidas para descartar flakes**

```bash
npm run test:e2e && npm run test:e2e
```

Esperado: idéntico resultado las dos veces. Si algún test cambia de resultado, **arreglarlo o borrarlo** — no subir `retries`.

- [ ] **Step 4: Verificar que los gates existentes siguen intactos**

```bash
npm run typecheck
npm run lint
npm test
```

Esperado:
- `typecheck`: sin errores.
- `lint`: exactamente **10 warnings, 0 errores**. Si sube, arreglar los ficheros nuevos: no se toca el baseline.
- `test`: **117 pasan + 1 saltado**.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "test(e2e): script unico test:e2e y modo interactivo"
```

---

### Task 17: Job bloqueante en CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job**

Al final de `.github/workflows/ci.yml`, después del job `build`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: build
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      # El service container expone el 5432 estandar, no el 55432 del Compose local.
      E2E_PG_HOST: 127.0.0.1
      E2E_PG_PORT: "5432"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: "Preparar la BD de E2E (crea ambas bases, migra y siembra)"
        run: npm run e2e:db:reset

      # OJO: este paso NO debe exportar DATABASE_URL. Playwright se lo pasa al
      # servidor Next por el bloque webServer.env de playwright.config.ts. Si se
      # exportara aqui, auth.smoke.test.ts dejaria de saltarse en el job de tests.
      - name: E2E
        run: npx playwright test

      - name: Subir el reporte al fallar
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

- [ ] **Step 2: Verificar que el YAML es válido**

```bash
node --input-type=module -e "import('node:fs').then(fs => console.log(fs.readFileSync('.github/workflows/ci.yml','utf8').length + ' bytes leidos'))"
npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml', encoding='utf-8')); print('YAML valido')"
```

Esperado: `YAML valido` (o la salida equivalente del linter).

- [ ] **Step 3: Commit y push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: job E2E bloqueante con Playwright y Postgres efimero"
git push
```

- [ ] **Step 4: Verificar el job en GitHub Actions**

```bash
gh run watch
```

Esperado: el job `e2e` en verde. Si falla, descargar el artifact `playwright-report` y revisar las trazas antes de tocar nada.

---

## Huecos conocidos tras este plan

Se declaran para que nadie los confunda con cobertura:

1. **La rama de fallback a `sales_records` queda sin ejercitar.** Con `HUB_DB_URL` siempre presente en E2E, `getSalesData` toma siempre la rama del hub. Cubrir el fallback exigiría una segunda corrida con `HUB_DB_URL` ausente, y entonces la mitad de las rutas lanzaría (`/clientes`, `/articulos`, `/cliente-articulo`).
2. **El hub falso puede desincronizarse del real.** No hay test de contrato que compare columnas contra el hub de producción. Registrado en la sección 10 del spec.
3. **No se assertan cifras de negocio.** Decisión explícita del alcance v1.
4. **Solo Chromium.** Firefox y WebKit quedan fuera hasta que la suite sea estable.

---

## Autorrevisión del plan

- **Cobertura del spec:** las 11 secciones tienen tarea. §1 → Tasks 1-3, 5-7; §2 → Task 9; §3 → Task 8; §4 → Tasks 10-15; §5 → Task 8 (config) y las reglas dentro de cada spec; §6 → Task 17; §7 → Tasks 1, 7, 16; §8 → Tasks 8 y 16; §9 → sección "Huecos conocidos"; §10 → ídem; §11 → Task 16 (criterios 1, 4, 5) y Tasks 12-14 (criterio 2), Task 17 (criterio 3).
- **Desviación respecto al spec, deliberada:** el spec decía "2025 existe pero vacío" para el bug #3. Al leer el commit `9dc66ee` se ve que la condición real es *un año presente en el selector cuyo bucket falta para una agrupación concreta*. Un año totalmente vacío ni siquiera aparecería en el selector, así que no reproduciría nada. La semilla usa **2021 con datos solo de `Aguas`**, que sí reproduce el mecanismo.
- **Restricción descubierta al planificar:** el rate limit de 5 logins/minuto (R1). No estaba en el spec. Se resuelve por diseño — presupuesto de 3 logins y `retries: 0` en los proyectos que autentican — sin tocar `auth.ts`.
- **Consistencia de nombres:** `APPROVED_STATE`/`PENDING_STATE`, `APPROVED_USER`/`PENDING_USER`, `YEAR_WITH_GAPS`, `CATEGORY_MISSING_IN_GAP_YEAR` se definen en `e2e/constants.ts` (Task 4) y se usan con esos mismos nombres en las Tasks 9-15. `applyMigrations`, `seedApp` y `seedHub` se exportan en las Tasks 2, 5 y 6 y se importan con esos nombres en la Task 7.
