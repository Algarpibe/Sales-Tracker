# SalesTracker: migración de Supabase self-hosted → PostgreSQL plano

**Fecha:** 2026-06-14
**Estado:** Diseño aprobado (pendiente revisión del spec)
**Autor:** Claude (Opus 4.8) + Algarpibe

## 1. Contexto y objetivo

SalesTracker corre hoy sobre un stack **Supabase self-hosted** (db + kong + auth/GoTrue + rest/PostgREST) en el VPS Hostinger/Easypanel, dominio API `https://salestracker-supabase.842ean.easypanel.host`. La app (`ambientalia_project/sales-tracker`, dominio `sales-tracker.ambientalia.cloud`) usa `@supabase/ssr` para auth y datos.

**Objetivo:** reescribir las capas de **auth** y **datos** para que la app hable **directamente con un PostgreSQL plano** nuevo llamado **`sales-tracker-db`**, eliminando toda dependencia de Supabase (GoTrue, PostgREST, Kong). Esto alinea SalesTracker con el estándar del ecosistema Ambientalia (`desk-db`, `landing-studio-db`) y reduce la huella en el VPS.

**Motivación:** consistencia de stack (todas las apps nuevas sobre Postgres plano) y capacidad del servidor.

## 2. No-objetivos (YAGNI)

- No se añade verificación de email ni SMTP (el gate de aprobación de admin cubre el alta).
- No se mantiene Realtime (la única suscripción —refresco de profile— se elimina; degrada bien).
- No se mantiene RLS en base de datos (la autorización pasa a la capa de aplicación).
- No se rediseña la UI ni se añaden features; es una migración funcionalmente equivalente.
- No se interconecta con otras BD (desk-db, etc.); si hiciera falta en el futuro → `postgres_fdw` o app-level.

## 3. Arquitectura

- **`sales-tracker-db`**: servicio Postgres plano nuevo en Easypanel, proyecto `ambientalia_project` (mismo patrón que `desk-db`/`landing-studio-db`).
- La app `sales-tracker` se conecta **directo** por la **red interna** de Easypanel vía `DATABASE_URL` (verificado que App→servicio Postgres interno funciona: `ambientalia-desk`→`desk-db`).
- **Todo el acceso a datos es server-side** (server actions, RSC, route handlers) con **Drizzle ORM**. El navegador NUNCA habla con la BD: los componentes cliente llaman a server actions / route handlers.
- **Auth con better-auth** (email/password, sesión por cookie), montado en route handler `/api/auth/[...all]`. El middleware protege rutas con la sesión de better-auth + gate de aprobación.
- Tras el cutover se **decomisa** el stack `salestracker_supabase`.

## 4. Stack técnico

Alineado con `landing-studio` (app más reciente del ecosistema):

- `drizzle-orm` + `drizzle-kit` (schema-as-code, migraciones)
- `better-auth` (auth email/password, sesiones)
- `pg` (driver node-postgres)
- `bcryptjs` (verificación de hashes migrados + hashing de nuevas contraseñas)
- Se **eliminan**: `@supabase/ssr`, `@supabase/supabase-js`.
- Se conservan: `@tanstack/react-query` (fetching cliente vía server actions/route handlers), `react-hook-form`, etc.

## 5. Modelo de datos (Drizzle)

### 5.1 Tablas de better-auth (gestionadas por su schema)
- `user` (id, email, name, image?, emailVerified, createdAt, updatedAt)
- `session` (id, userId, token, expiresAt, ipAddress, userAgent, ...)
- `account` (id, userId, providerId, password [hash], ...)
- `verification` (id, identifier, value, expiresAt, ...)

### 5.2 `profiles` (1:1 con `user.id`)
Campos de dominio que hoy viven en `public.profiles` (la identidad email/nombre pasa a `user`):
- `id` uuid PK → FK `user.id` (igual que hoy `profiles.id = auth.users.id`)
- `company_id` uuid FK → `companies.id`
- `role` enum `user_role` (admin | editor | lector)
- `is_active` bool, `is_approved` bool, `is_rejected` bool, `rejection_reason` text
- `avatar` bytea (nullable), `avatar_mime` text (nullable)
- `created_at`, `updated_at`

### 5.3 Tablas de dominio (portadas 1:1 desde el esquema actual)
`companies`, `categories`, `sales_records`, `subscriptions`, `category_groups`, `category_group_mappings` — mismas columnas, tipos y FKs que el esquema actual (ver dump `cloud_public_schema.sql`).

### 5.4 Vistas
`v_monthly_totals`, `v_annual_by_category` — recreadas idénticas (definidas en SQL de migración; Drizzle las consulta como vistas).

### 5.5 Enums (`pgEnum`)
`user_role`, `record_type`, `billing_cycle`, `subscription_status`, `subscription_category` — con los mismos valores actuales.

## 6. Auth (better-auth)

- **Provider**: email/password. Sesión en cookie (better-auth gestiona el ciclo).
- **Migración de contraseñas**: los usuarios existentes traen hash **bcrypt** (`$2a$...`). Se configura better-auth con verificación/`hash` personalizada usando `bcryptjs`, de modo que (a) los usuarios migrados entran con su contraseña actual y (b) las nuevas altas se hashean con bcrypt. Se carga el hash en `account.password`.
- **Registro**: crea `user` + `profile` con `is_approved=false` → redirige a `/waiting-approval`. Un admin aprueba (`is_approved=true`). Sin email.
- **Cambio de password** (settings/security-form) → API better-auth `changePassword`.
- **Cambio de email** (settings/profile + account forms) → update directo del email en `user` (sin verificación).
- **Logout** → better-auth `signOut`.
- **`exchangeCodeForSession`** (callback OAuth) → se elimina (no hay OAuth; era el callback de Supabase).

## 7. Modelo de autorización (capa de aplicación)

- Helpers en `src/lib/auth/guards.ts`:
  - `requireUser()` → devuelve la sesión + profile o lanza/redirige.
  - `requireApproved()` → exige `is_approved`.
  - `requireRole(...roles)` → exige rol.
  - `scopeToCompany(userProfile)` → toda query de dominio filtra por `company_id` del usuario.
- **Toda** server action valida usuario + rol + company antes de tocar datos. Se corrige la debilidad actual (queries cliente que confiaban en RLS) moviendo todo a servidor con checks explícitos.

## 8. Reescritura del acceso a datos

### 8.1 Infraestructura
- `src/db/index.ts`: pool `pg` + cliente Drizzle (singleton).
- `src/db/schema.ts`: schema Drizzle completo (sección 5).
- `drizzle.config.ts` + carpeta `drizzle/` (migraciones).

### 8.2 Conversión cliente → servidor (12 componentes)
Los componentes cliente que hoy hacen `supabase.from()` pasan a llamar **server actions** (o route handlers con React Query). Afecta: `home`, `sales`, `categories`, `analytics`, `kpis`, `tablas`, `subscriptions`, `import`, `settings/company-form`, `settings/account-settings-form`, `auth-provider`, `charts/premium/forecast-sales-category` (+ `historical-sales-category`).

### 8.3 Server actions (reescritas con Drizzle, authz estándar)
- `sales-actions`: getSalesData, upsertSalesRecord, deleteSalesRecord, getMonthlyTotals, getAnnualByCategory.
- `category-actions`: getCategories, createCategory, updateCategory, deleteCategory.
- `grouping-actions`: 8 funciones (grupos + mappings + análisis).
- `subscription-actions`: CRUD.
- `admin-actions`: approveUser, updateUserRole, deactivateUser, deleteUser.
- **Nuevas** actions para lo que hoy es lectura cliente: home/sales/categories/analytics/kpis/tablas/subscriptions/import/company/profile.

### 8.4 Casos especiales
- `rpc('delete_user_entirely')` → transacción Drizzle (borra mappings/records/profile/account/session/user en orden FK).
- **Avatares**: route handler `POST /api/avatar` (guarda bytea+mime en `profiles`) y `GET /api/avatar/[userId]` (sirve la imagen). `avatar_url` pasa a apuntar a esa ruta.
- **Realtime**: se elimina el canal de profile; `auth-provider` carga el profile vía server action; los cambios (p.ej. aprobación) se reflejan al navegar/refrescar.

## 9. Middleware

`src/middleware.ts` reemplaza la sesión Supabase por la de **better-auth**:
- No sesión → `/login`.
- Sesión sin aprobar → `/waiting-approval`.
- Aprobado en `/waiting-approval` → `/home`.

## 10. Infraestructura y variables

- Crear servicio `sales-tracker-db` (Postgres) en `ambientalia_project` con su `POSTGRES_PASSWORD`.
- Env de la app (servicio `sales-tracker`):
  - `DATABASE_URL=postgres://postgres:<pw>@<host-interno-sales-tracker-db>:5432/postgres`
  - `BETTER_AUTH_SECRET=<generado>`
  - `BETTER_AUTH_URL=https://sales-tracker.ambientalia.cloud`
  - **Quitar** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `DATABASE_URL` ya no es build-time (es server-side runtime), así que cambiarla no exige rebuild — pero `BETTER_AUTH_URL`/secret se inyectan en runtime también.

## 11. Migración de datos

Fuente: Postgres del stack Supabase actual (`salestracker_supabase-db-1`). Destino: `sales-tracker-db`.

1. Crear `sales-tracker-db` y aplicar el schema Drizzle (`drizzle-kit migrate`) + crear vistas.
2. Copiar dominio (copia directa, mismas columnas): `companies` (4), `categories` (66), `category_groups` (6), `category_group_mappings` (62), `sales_records` (1527), `subscriptions` (0).
3. Auth: por cada fila de `auth.users` (2) → insertar en `user` (id, email, name=profiles.full_name, emailVerified=true, timestamps) + `account` (userId, providerId='credential', password=encrypted_password bcrypt).
4. `public.profiles` (2) → `profiles` (id=user.id, company_id, role, is_active, is_approved, is_rejected, rejection_reason; avatar: migrar desde Storage si existe, si no null).
5. Verificar conteos == origen y FKs sin huérfanos.

## 12. Cutover y rollback

- **Cutover**: deploy de la app con env nuevo (sección 10) → probar login real + datos → OK.
- **Rollback** (si falla): revertir env de la app a las 2 `NEXT_PUBLIC_SUPABASE_*` del stack Supabase (que sigue vivo hasta el decomiso) + redeploy. El stack Supabase no se borra hasta confirmar estabilidad.

## 13. Decomiso

Tras período de estabilidad: bajar/borrar el stack `salestracker_supabase` (compose en `/opt/salestracker-supabase/`) y su ruta Traefik (`/etc/easypanel/traefik/config/salestracker-supabase.yaml`). Liberar su RAM. Mantener backups.

## 14. Estrategia de pruebas (TDD)

Por fase, con tests antes del código (skill test-driven-development):
- Auth: login con hash bcrypt migrado, registro→no aprobado, guards (requireRole/scopeToCompany).
- Data layer: cada server action (filtrado por company, checks de rol, CRUD).
- Migración: script idempotente + verificación de conteos.
- DB de test: `pg-mem` o un Postgres efímero.

## 15. Orden de implementación (fases verificables)

1. **DB + schema**: deps, `src/db`, schema Drizzle, drizzle.config, migración inicial + vistas.
2. **Auth**: better-auth config (bcrypt), route handler, client de sesión, reemplazo de auth-provider.
3. **Middleware**: protección de rutas con better-auth + gate de aprobación.
4. **Data layer**: reescribir las 5 actions + nuevas actions con Drizzle + guards.
5. **Componentes cliente**: convertir las 12 lecturas cliente a server actions/route handlers.
6. **Avatares + admin**: rutas de avatar (bytea), `delete_user_entirely` como transacción.
7. **Migración de datos**: crear `sales-tracker-db`, aplicar schema, copiar y verificar.
8. **Cutover**: env nuevo, deploy, verificación (login real + datos), luego decomiso.

## 16. Riesgos

- **bcrypt en better-auth**: confirmar el punto de extensión para verificación bcrypt; si no encaja limpio, alternativa = resetear las 2 contraseñas (solo 2 usuarios).
- **Conectividad interna App→Postgres en Easypanel**: validar el hostname interno del servicio (desk lo hace, así que es viable).
- **Superficie amplia (30 archivos)**: mitigado con fases + TDD; la app sigue corriendo en Supabase hasta el cutover (rollback disponible).
