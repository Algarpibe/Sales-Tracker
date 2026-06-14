# SalesTracker → Postgres — Plan 1: Fundación (DB + schema + datos)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el Postgres plano `sales-tracker-db`, definir el schema Drizzle equivalente al actual (+ tablas better-auth), y migrar todos los datos verificando conteos — dejando la base lista para reescribir auth y la capa de datos.

**Architecture:** Schema obtenido por **introspección** (`drizzle-kit pull`) del Postgres Supabase actual (fuente de verdad), más las tablas de **better-auth** generadas por su CLI, reconciliando `profiles` (1:1 con `user`). Migración de datos por copia directa (dominio) + transformación auth (`auth.users`→`user`+`account`).

**Tech Stack:** Next.js 16, `drizzle-orm` + `drizzle-kit`, `pg`, `better-auth`, `bcryptjs`. Infra: Easypanel (Postgres), SSH al VPS `72.60.166.93` (clave `~/.ssh/salestracker_migration_ed25519`).

**Referencia de la verdad (ya en el VPS):** `/opt/salestracker-supabase/cloud_public_schema.sql` (esquema) y conteos esperados: companies 4, categories 66, category_groups 6, category_group_mappings 62, sales_records 1527, subscriptions 0, usuarios 2.

---

### Task 1: Crear el servicio `sales-tracker-db` (Postgres) en Easypanel

**Acción manual del usuario (UI) — no automatizable (estado LMDB de Easypanel):**

- [ ] **Step 1:** En `ambientalia_project` → **+ Create** → **Postgres** → nombre `sales-tracker-db`. Versión: **16** (o la misma que usan desk-db/landing-studio-db). Deploy.
- [ ] **Step 2:** Copiar de la pestaña del servicio: **host interno**, **puerto** (5432), **usuario**, **password**, **database**. (Easypanel los muestra en "Credentials" / "Connection".)
- [ ] **Step 3 (verificación, por SSH):** confirmar que el contenedor existe y acepta conexiones.

Run:
```bash
ssh -i ~/.ssh/salestracker_migration_ed25519 root@72.60.166.93 \
  "docker ps --filter name=sales-tracker-db --format '{{.Names}} {{.Status}}'"
```
Expected: una línea con el contenedor `...sales-tracker-db...` en `Up`.

- [ ] **Step 4:** Guardar la `DATABASE_URL` resultante en un archivo local NO versionado para los pasos siguientes:
`postgres://<user>:<pw>@<host-interno>:5432/<db>` (uso interno por SSH; para drizzle-kit local se usa el túnel del Step de abajo).

---

### Task 2: Acceso a `sales-tracker-db` desde la máquina local (túnel SSH)

`drizzle-kit` corre en local; el Postgres nuevo solo es accesible por la red interna del VPS. Abrimos un túnel.

- [ ] **Step 1:** Obtener la IP interna del contenedor Postgres nuevo.

Run:
```bash
ssh -i ~/.ssh/salestracker_migration_ed25519 root@72.60.166.93 \
  "docker inspect \$(docker ps -q -f name=sales-tracker-db|head -1) \
   --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'"
```
Expected: una IP tipo `172.x.x.x`.

- [ ] **Step 2:** Abrir túnel local 5544 → Postgres nuevo (dejar corriendo en background).

Run:
```bash
ssh -i ~/.ssh/salestracker_migration_ed25519 -N -L 5544:<IP-interna>:5432 root@72.60.166.93 &
```

- [ ] **Step 3:** Verificar conexión por el túnel.

Run:
```bash
PGPASSWORD=<pw> psql -h localhost -p 5544 -U <user> -d <db> -tAc "select version();"
```
Expected: `PostgreSQL 16.x ...`

---

### Task 3: Dependencias del proyecto

**Files:**
- Modify: `package.json`

- [ ] **Step 1:** Instalar deps de runtime y dev.

Run (en `salestracker-pro/`):
```bash
npm install drizzle-orm pg better-auth bcryptjs
npm install -D drizzle-kit @types/pg @types/bcryptjs vitest dotenv
```
Expected: instala sin errores; `package.json` lista `drizzle-orm`, `pg`, `better-auth`, `bcryptjs`, `drizzle-kit`, `vitest`.

- [ ] **Step 2:** Añadir scripts a `package.json`:
```json
"scripts": {
  "db:pull": "drizzle-kit pull",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "test": "vitest run"
}
```

- [ ] **Step 3:** Commit.
```bash
git add package.json package-lock.json && git commit -m "chore: add drizzle, better-auth, pg, vitest deps"
```

---

### Task 4: Config de Drizzle e introspección del esquema actual

**Files:**
- Create: `drizzle.config.ts`
- Create: `.env.drizzle.local` (NO versionar — añadir a `.gitignore`)

- [ ] **Step 1:** Crear `drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DRIZZLE_DATABASE_URL! },
  schemaFilter: ["public"],
});
```

- [ ] **Step 2:** Añadir `.env.drizzle.local` con la URL del túnel y a `.gitignore`:
```
DRIZZLE_DATABASE_URL=postgres://<user>:<pw>@localhost:5544/<db>
```
```bash
grep -qxF '.env.drizzle.local' .gitignore || echo '.env.drizzle.local' >> .gitignore
```

- [ ] **Step 3:** Introspectar el **Postgres Supabase ACTUAL** (fuente de verdad) para obtener el schema de dominio. Apuntar temporalmente la URL al túnel del Supabase actual (abrir un segundo túnel 5545→`salestracker_supabase-db-1`), correr pull, y guardar el resultado como base de `src/db/schema.ts`.

Run:
```bash
# túnel al Supabase actual
ssh -i ~/.ssh/salestracker_migration_ed25519 -N -L 5545:<IP-supabase-db>:5432 root@72.60.166.93 &
DRIZZLE_DATABASE_URL=postgres://postgres:<pw-supabase>@localhost:5545/postgres npx drizzle-kit pull
```
Expected: genera `drizzle/schema.ts` (o `src/db/schema.ts`) con las 7 tablas + enums + vistas del dominio.

- [ ] **Step 4:** Mover/renombrar el schema introspectado a `src/db/schema.ts` y revisarlo (tablas: companies, categories, sales_records, subscriptions, category_groups, category_group_mappings; enums; vistas). Commit.
```bash
git add src/db/schema.ts drizzle.config.ts .gitignore && git commit -m "feat(db): drizzle config + domain schema via introspection"
```

---

### Task 5: Añadir tablas de better-auth + reconciliar `profiles`

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/auth/auth.ts` (config mínima para que el CLI genere el schema)

- [ ] **Step 1:** Crear config mínima de better-auth en `src/lib/auth/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {}, // los campos de dominio van en profiles (tabla aparte)
  },
});
```

- [ ] **Step 2:** Generar el schema de better-auth (tablas user/session/account/verification) e integrarlo en `src/db/schema.ts`.

Run:
```bash
npx @better-auth/cli generate --output src/db/auth-schema.ts
```
Expected: crea `src/db/auth-schema.ts` con `user`, `session`, `account`, `verification` en Drizzle. Re-exportar desde `src/db/schema.ts`.

- [ ] **Step 3:** Ajustar `profiles` en el schema: `id uuid PK` con FK a `user.id`, columnas `company_id`, `role` (enum user_role), `is_active`, `is_approved`, `is_rejected`, `rejection_reason`, `avatar` (bytea/`customType`), `avatar_mime`, `created_at`, `updated_at`. (La tabla `profiles` introspectada de Supabase ya trae casi todo; añadir `avatar`/`avatar_mime`, quitar `email`/`full_name` que ahora viven en `user`.)

- [ ] **Step 4:** Commit.
```bash
git add src/db/ src/lib/auth/auth.ts && git commit -m "feat(db): better-auth tables + reconcile profiles"
```

---

### Task 6: Cliente Drizzle (`src/db/index.ts`)

**Files:**
- Create: `src/db/index.ts`

- [ ] **Step 1:** Crear el cliente (pool singleton):
```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
```

- [ ] **Step 2:** Commit.
```bash
git add src/db/index.ts && git commit -m "feat(db): drizzle client (pg pool)"
```

---

### Task 7: Generar y aplicar migración a `sales-tracker-db`

**Files:**
- Create: `drizzle/*` (SQL de migración)

- [ ] **Step 1:** Generar la migración desde el schema.

Run:
```bash
npm run db:generate
```
Expected: crea `drizzle/0000_*.sql` con todas las tablas/enums.

- [ ] **Step 2:** Aplicar al `sales-tracker-db` (vía túnel 5544).

Run:
```bash
DRIZZLE_DATABASE_URL=postgres://<user>:<pw>@localhost:5544/<db> npm run db:migrate
```
Expected: aplica sin errores.

- [ ] **Step 3:** Crear las **vistas** (drizzle no las genera). Añadir `drizzle/0001_views.sql` con las definiciones de `cloud_public_schema.sql`:
```sql
CREATE VIEW v_monthly_totals AS
 SELECT company_id, record_type, record_year, record_month, sum(amount_usd) AS total_usd
   FROM sales_records GROUP BY company_id, record_type, record_year, record_month;
CREATE VIEW v_annual_by_category AS
 SELECT sr.company_id, sr.record_type, sr.record_year, sr.category_id,
        c.name AS category_name, c.color AS category_color, sum(sr.amount_usd) AS total_usd
   FROM sales_records sr JOIN categories c ON sr.category_id = c.id
  GROUP BY sr.company_id, sr.record_type, sr.record_year, sr.category_id, c.name, c.color;
```
Aplicar:
```bash
PGPASSWORD=<pw> psql -h localhost -p 5544 -U <user> -d <db> -f drizzle/0001_views.sql
```

- [ ] **Step 4:** Verificar objetos creados.

Run:
```bash
PGPASSWORD=<pw> psql -h localhost -p 5544 -U <user> -d <db> -tAc \
 "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
```
Expected: tablas de dominio (6) + profiles + tablas better-auth (4) = **11**.

- [ ] **Step 5:** Commit.
```bash
git add drizzle/ && git commit -m "feat(db): initial migration + views applied to sales-tracker-db"
```

---

### Task 8: Migrar los datos (dominio + auth)

**Files:**
- Create: `scripts/migrate-data.cjs` (temporal, borrar al final)

- [ ] **Step 1:** Copiar tablas de **dominio** (mismas columnas) desde el Supabase actual → `sales-tracker-db`, por SSH, con `pg_dump --data-only` por tabla y `session_replication_role=replica`. Para cada tabla (companies, categories, category_groups, category_group_mappings, sales_records, subscriptions):

Run (ejemplo companies; repetir por tabla en orden FK: companies → categories → category_groups → category_group_mappings → sales_records → subscriptions):
```bash
ssh -i ~/.ssh/salestracker_migration_ed25519 root@72.60.166.93 '
 docker run --rm postgres:17-alpine pg_dump --data-only -t public.companies \
   "postgres://postgres:<pw-supabase>@<IP-supabase>:5432/postgres" \
 | sed -e "/^\\\\restrict /d" -e "/^\\\\unrestrict /d" -e "/^SET transaction_timeout/d" \
 | (echo "SET session_replication_role=replica;"; cat) \
 | docker exec -i <sales-tracker-db-container> psql -U <user> -d <db> -v ON_ERROR_STOP=1'
```

- [ ] **Step 2:** Migrar **auth**: por cada `auth.users` → insertar en `user` (id, email, name=profiles.full_name, emailVerified=true) + `account` (userId, providerId='credential', password=encrypted_password). Y `public.profiles`→`profiles` (sin email/full_name). Script SQL `scripts/migrate-auth.sql` ejecutado contra el Supabase actual leyendo y contra el nuevo escribiendo (o vía `postgres_fdw`/dump intermedio). Implementación concreta: generar INSERTs desde el origen:
```bash
ssh ... 'docker exec -i salestracker_supabase-db-1 psql -U supabase_admin -d postgres -tAc "
 SELECT format($f$INSERT INTO \"user\"(id,email,name,\"emailVerified\",\"createdAt\",\"updatedAt\") VALUES (%L,%L,%L,true,%L,%L);$f$,
   u.id, u.email, p.full_name, u.created_at, u.updated_at)
 FROM auth.users u JOIN public.profiles p ON p.id=u.id;"' > /tmp/users.sql
# similar para account (password=encrypted_password, providerId=credential) y profiles
```
Aplicar los .sql resultantes al `sales-tracker-db`.

- [ ] **Step 3 (verificación):** conteos == origen.

Run:
```bash
PGPASSWORD=<pw> psql -h localhost -p 5544 -U <user> -d <db> -tAc "
 SELECT 'companies',count(*) FROM companies UNION ALL
 SELECT 'categories',count(*) FROM categories UNION ALL
 SELECT 'category_groups',count(*) FROM category_groups UNION ALL
 SELECT 'category_group_mappings',count(*) FROM category_group_mappings UNION ALL
 SELECT 'sales_records',count(*) FROM sales_records UNION ALL
 SELECT 'subscriptions',count(*) FROM subscriptions UNION ALL
 SELECT 'user',count(*) FROM \"user\" UNION ALL
 SELECT 'account',count(*) FROM account UNION ALL
 SELECT 'profiles',count(*) FROM profiles;"
```
Expected: companies 4, categories 66, category_groups 6, category_group_mappings 62, sales_records 1527, subscriptions 0, user 2, account 2, profiles 2.

- [ ] **Step 4 (verificación FKs):** sin huérfanos.

Run:
```bash
PGPASSWORD=<pw> psql -h localhost -p 5544 -U <user> -d <db> -tAc "
 SELECT count(*) FROM profiles p LEFT JOIN \"user\" u ON u.id=p.id WHERE u.id IS NULL;"
```
Expected: `0`.

- [ ] **Step 5:** Borrar scripts temporales con secretos y cerrar túneles.
```bash
rm -f scripts/migrate-data.cjs /tmp/users.sql
```

---

## Self-review

- **Cobertura del spec (secciones 5, 11):** Tasks 4-7 cubren modelo de datos (5) por introspección + better-auth + profiles + vistas + enums. Task 8 cubre migración de datos (11) con verificación de conteos y FKs. ✅
- **Placeholders:** los `<pw>`, `<user>`, `<host>`, `<IP-...>`, `<...container>` son credenciales/identificadores de runtime que se obtienen en Task 1-2 (no son decisiones de diseño pendientes). ✅
- **Consistencia de tipos:** `profiles.id` = `user.id` (uuid) coherente en Tasks 5 y 8; `account.password` = hash bcrypt coherente con el plan de auth (Plan 2). ✅
- **Pendiente para planes siguientes:** Plan 2 (better-auth runtime + middleware), Plan 3 (capa de datos: actions + componentes cliente + avatares/admin), Plan 4 (cutover + decomiso). Este Plan 1 deja `sales-tracker-db` con schema y datos verificados.
