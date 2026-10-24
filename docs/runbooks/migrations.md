# Runbook — Migraciones con el runner (`npm run db:migrate`)

Hallazgo DATA-047. Hasta ahora las migraciones `drizzle/0002`–`0014` se aplicaban a mano con `psql` y nada registraba cuáles estaban puestas en cada base. El runner `scripts/migrate/cli.mjs` lleva ese registro en la tabla `migrations.applied` y solo aplica lo que falta, en orden.

- **Quién lo ejecuta:** el operador, a mano, como `postgres`. Nunca el app, nunca con `DATABASE_URL`.
- **Primera vez en producción:** sección 3 (baseline). Tiempo estimado: 20 minutos. No cambia datos ni esquema del app: solo crea el esquema `migrations`.
- **Reversible:** el baseline sí (sección 3.5). Lo que aplique `up`, con el backup (sección 5).

Marcadores de este documento (no hay datos reales a propósito):

| Marcador | Qué es |
|---|---|
| `<VPS>` | Acceso SSH al servidor |
| `<contenedor-db>` | Nombre del contenedor Postgres de `sales-tracker-db` (`docker ps`) |
| `<ip-contenedor-db>` | IP del contenedor en la red de Docker (sección 2) |
| `<password-postgres>` | Password de `postgres`. Solo vive en el gestor de contraseñas |

---

## 1. Qué hace el runner

```bash
npm run db:migrate -- status [--strict]
npm run db:migrate -- baseline --through <migracion> [--yes]
npm run db:migrate -- up [--dry-run]
npm run db:migrate -- down --to <migracion> [--yes]
```

`<migracion>` vale con o sin `.sql`: `0014_app_role` o `0014_app_role.sql`.

| Comando | Qué hace |
|---|---|
| `status` | Lista cada `drizzle/*.sql` (por nombre: el hueco de `0009` no importa) como `aplicada`, `baseline`, `pendiente`, `MODIFICADA` (el fichero cambió desde que se registró) o `SIN FICHERO` (fila sin fichero: rama equivocada). Sale con error si hay `MODIFICADA`, `SIN FICHERO` o pendientes fuera de orden; con `--strict`, también si queda alguna pendiente. Solo lee: no crea nada. |
| `baseline --through X` | Registra como aplicadas **sin ejecutarlas** todas las migraciones hasta `X` incluida. Rechaza si `X` no existe o si ya hay filas de migraciones posteriores. Sin `--yes` solo lista lo que marcaría. |
| `up` | Aplica las pendientes en orden. Cada una va en **su propia transacción junto con su fila de control**: si falla, no queda nada de ella y el runner para. Rechaza si hay alguna `MODIFICADA`, `SIN FICHERO` o fuera de orden. `--dry-run` solo lista. |
| `down --to X` | Revierte las posteriores a `X`, de la más nueva a la más vieja, con sus `NNNN_nombre.down.sql`, y borra sus filas. Si a alguna le falta el `.down.sql`, no revierte ninguna. Sin `--yes` solo lista. |

Guardas:

- La conexión sale **solo** de `MIGRATIONS_DATABASE_URL`. Si falta, o si es la misma conexión que `DATABASE_URL` (mismo usuario, host, puerto y base), el runner no arranca.
- Tras conectar comprueba el usuario: rechaza `salestracker_app` y cualquier rol que no sea superusuario ni tenga `CREATE` en la base y en `public`.
- Un *advisory lock* impide dos runners a la vez sobre la misma base.

Detalles que importan:

- **Tabla de control:** `migrations.applied (name, checksum, applied_at, applied_by, baseline)`, en un esquema propio del usuario que migra. No va en `public` a propósito: 0014 da a `salestracker_app` permisos por defecto sobre todo lo que se crea en `public`. El rol del app no tiene `USAGE` en `migrations`.
- **Checksum:** sha256 del fichero con los finales de línea pasados a LF. El repo guarda LF, pero un checkout en Windows (`core.autocrlf=true`) los convierte a CRLF; sin normalizar, el mismo fichero daría otro hash en Windows que en el VPS o en CI y saldría como `MODIFICADA`.
- **Transacciones:** por defecto el runner envuelve cada fichero en `BEGIN`/`COMMIT`. Dos excepciones:
  - Primera línea `-- migrate:no-transaction`: para sentencias que Postgres no admite en una transacción (`CREATE INDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `VACUUM`). Cada trozo entre `--> statement-breakpoint` va en su propia consulta y la fila de control se escribe al final. Si falla a medias, **puede quedar aplicada en parte**: el runner lo avisa y hay que revisar la base antes de reintentar. Vale también para los `.down.sql`.
  - Ficheros con su propio `BEGIN;`/`COMMIT;` (hoy solo `0003_unify_roles.sql`): el runner los detecta y no los envuelve, porque su `COMMIT` cerraría la transacción del runner antes de tiempo. Su `BEGIN`/`COMMIT` ya los hace atómicos. **No se ha editado ninguna migración existente** para el runner: los checksums son los de los ficheros tal como están en `main`.
  - `0004_backlog_enum.sql` (`ALTER TYPE ... ADD VALUE`) no necesita marcador: desde Postgres 12 va dentro de una transacción mientras el valor nuevo no se use en ella, y 0004 no lo usa.
- **Envío:** cada fichero se manda entero en una sola consulta (protocolo simple de `pg`), sin partir por `;`, para no romper los bloques `DO $$ ... $$`.

## 2. Conectar con la base de producción

El runner necesita Node 24, una copia del repo en `main` (`npm ci` hecho) y llegar al puerto de Postgres. Desde la máquina del operador, con un túnel SSH al contenedor:

```bash
ssh <VPS> "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <contenedor-db>"
# Anotar la IP como <ip-contenedor-db>. Si salen varias, cualquiera alcanzable desde el host.

ssh -N -L 55433:<ip-contenedor-db>:5432 <VPS>     # dejar esta terminal abierta
```

En otra terminal, en la raíz del repo. La password se lee por teclado para que no quede en el historial; si lleva caracteres especiales, `encodeURIComponent` la codifica para la URL:

```bash
git switch main && git pull && npm ci
unset DATABASE_URL
read -rs -p "Password de postgres: " PGPW; echo
export MIGRATIONS_DATABASE_URL="postgres://postgres:$(PGPW="$PGPW" node -e 'process.stdout.write(encodeURIComponent(process.env.PGPW))')@127.0.0.1:55433/sales_tracker"
unset PGPW

npm run db:migrate -- status
# Primera línea esperada: "Base: sales_tracker · usuario: postgres"
```

Si falla con `no pg_hba.conf entry`, el contenedor no admite conexiones por TCP con password desde la red de Docker: revisarlo antes de seguir (la imagen oficial las admite). Al terminar: `unset MIGRATIONS_DATABASE_URL` y cerrar el túnel.

## 3. Baseline en producción (una sola vez)

La base de producción ya tiene puestas a mano las migraciones hasta algún punto. El baseline registra ese tramo **sin ejecutarlo**; a partir de ahí, `up` aplica solo lo nuevo.

### 3.1 Backup

Aunque el baseline no toca datos del app, se toma un volcado antes (como en [db-least-privilege.md](db-least-privilege.md)):

```bash
ssh <VPS>
docker exec <contenedor-db> pg_dump -U postgres -d sales_tracker -Fc \
  > ~/backups/sales_tracker_$(date +%Y%m%d_%H%M)_pre_baseline.dump
ls -lh ~/backups/ | tail -1   # que no pese 0 bytes
```

### 3.2 Decidir el `--through`: qué migraciones están puestas

Consulta de **solo lectura**, como `postgres` (por `docker exec -it <contenedor-db> psql -U postgres -d sales_tracker` o por el túnel). Cada fila comprueba un objeto que crea esa migración:

```sql
SELECT * FROM (VALUES
  ('0000_init',            to_regclass('public.sales_records') IS NOT NULL
                           AND to_regtype('public.record_type') IS NOT NULL),
  ('0001_constraints',     EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_records_unique_period')
                           AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_company_name_unique')),
  ('0002_indexes',         to_regclass('public.idx_sales_company_year_month') IS NOT NULL
                           AND to_regclass('public.idx_account_user') IS NOT NULL),
  ('0003_unify_roles',     to_regtype('public.user_role') IS NOT NULL
                           AND to_regtype('public.user_role_old') IS NULL
                           AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                                            WHERE t.typname = 'user_role' AND e.enumlabel = 'viewer')),
  ('0004_backlog_enum',    EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                                    WHERE t.typname = 'record_type' AND e.enumlabel = 'BACKLOG')),
  ('0005_favorites',       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_user_id_user_id_fk')),
  ('0006_saved_views',     EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_views_user_id_user_id_fk')),
  ('0007_historical_customer_sales', to_regclass('public.idx_hist_customer_company_year') IS NOT NULL),
  ('0008_kpi_targets',     EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kpi_targets_weight_check')),
  ('0010_kpi_project_orders', to_regclass('public.kpi_project_orders') IS NOT NULL),
  ('0011_tech_service_bucket', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_tech_service_bucket_check')),
  ('0012_kpi_plazo_horas', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kpi_targets_plazo_horas_check')),
  ('0013_macro_categoria', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_macro_categoria_check')),
  ('0014_app_role',        EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salestracker_app')
                           AND EXISTS (SELECT 1 FROM pg_default_acl d
                                         JOIN pg_namespace n ON n.oid = d.defaclnamespace
                                        WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
                                          AND d.defaclrole = 'postgres'::regrole
                                          AND d.defaclacl::text LIKE '%salestracker_app=arwd/%'))
) AS t(migracion, aplicada)
ORDER BY 1;
```

Qué mira cada fila:

| Migración | Aplicada si… |
|---|---|
| `0000_init` | existen la tabla `sales_records` y el enum `record_type`. |
| `0001_constraints` | existen las restricciones `sales_records_unique_period` y `categories_company_name_unique`. |
| `0002_indexes` | existen los índices `idx_sales_company_year_month` e `idx_account_user`. |
| `0003_unify_roles` | existe `user_role`, sin el valor `viewer`, y ya no existe `user_role_old`. |
| `0004_backlog_enum` | `record_type` tiene el valor `BACKLOG`. |
| `0005_favorites` | existe la FK `favorites_user_id_user_id_fk`. |
| `0006_saved_views` | existe la FK `saved_views_user_id_user_id_fk`. |
| `0007_historical_customer_sales` | existe el índice `idx_hist_customer_company_year`. |
| `0008_kpi_targets` | existe la restricción `kpi_targets_weight_check`. |
| `0010_kpi_project_orders` | existe la tabla `kpi_project_orders`. |
| `0011_tech_service_bucket` | existe la restricción `categories_tech_service_bucket_check`. |
| `0012_kpi_plazo_horas` | existe la restricción `kpi_targets_plazo_horas_check`. |
| `0013_macro_categoria` | existe la restricción `categories_macro_categoria_check`. |
| `0014_app_role` | existe el rol `salestracker_app` y `postgres` tiene *default privileges* en `public` que le dan `arwd` (SELECT, INSERT, UPDATE, DELETE). |

Para 0014 conviene repasar además la sección 5 de [db-least-privilege.md](db-least-privilege.md) (permisos tabla a tabla).

Decisión:

- **Todas `t`:** `--through 0014_app_role`. Es lo esperado si 0014 ya se aplicó.
- **Un tramo inicial de `t` y luego todas `f`** (p. ej. `t` hasta 0013 y `f` en 0014): `--through` la última `t`. Las `f` se aplicarán con `up` en la sección 4.
- **Una `f` en medio de `t`** (p. ej. 0012 `f` y 0013 `t`): **parar**. El baseline solo marca un tramo inicial y `up` volvería a ejecutar las posteriores. Revisar a mano qué falta antes de seguir. Ojo con `0011`: no se puede volver a ejecutar (sus `UPDATE` deshacen la clasificación hecha desde Configuración).
- **Cualquier `ERROR`** en la consulta: parar y revisarlo.

### 3.3 Baseline

```bash
npm run db:migrate -- status          # todas "pendiente": aún no hay tabla de control
npm run db:migrate -- baseline --through 0014_app_role
# Lista lo que marcaría y no escribe nada. Comprobar que la lista acaba donde se decidió.
npm run db:migrate -- baseline --through 0014_app_role --yes
# Esperado: "Registradas N migraciones como baseline."
```

### 3.4 Verificar

```bash
npm run db:migrate -- status --strict
# Esperado: cada migración del tramo como "baseline", "Pendientes: 0 · modificadas: 0 · sin fichero: 0"
# y salida 0. Si el --through no fue la última, --strict sale con error hasta aplicar las pendientes.
```

Y que el rol del app no ve la tabla de control (como `postgres`):

```sql
SELECT has_schema_privilege('salestracker_app', 'migrations', 'USAGE');   -- Esperado: f
```

### 3.5 Deshacer el baseline

Solo si se marcó un tramo equivocado. No toca nada del app:

```sql
DROP SCHEMA migrations CASCADE;
```

y repetir desde 3.2.

## 4. Aplicar migraciones nuevas (`up`)

Cada vez que llegue a `main` una migración nueva, **antes** de desplegar el código que la necesita:

1. Backup (como en 3.1, con el sufijo `_pre_<migracion>`). Es el único rollback de las migraciones sin `.down.sql`.
2. Conectar (sección 2) y revisar:

   ```bash
   npm run db:migrate -- status
   npm run db:migrate -- up --dry-run     # qué aplicaría, en qué orden y en qué modo
   ```

3. Aplicar y comprobar:

   ```bash
   npm run db:migrate -- up
   npm run db:migrate -- status --strict
   ```

Si `up` falla en una migración normal, esa queda revertida entera y las anteriores del mismo `up` quedan aplicadas y registradas: corregir con una migración nueva (o arreglando el fichero si **nunca** llegó a aplicarse en ninguna base) y repetir. Si falla una `no-transaction`, revisar a mano qué llegó a ejecutarse.

## 5. Rollback

- **0000 a 0014 no tienen `.down.sql`, ni se van a escribir.** Su rollback es restaurar el backup:

  ```bash
  ssh <VPS>
  docker exec -i <contenedor-db> pg_restore -U postgres -d sales_tracker --clean --if-exists \
    < ~/backups/<fichero>.dump
  ```

  `--clean` borra y recrea los objetos del volcado: se pierde lo escrito en la base después del backup. Restaurar también recupera las filas de `migrations.applied` de ese momento.
- **Migraciones nuevas con `.down.sql`:** `npm run db:migrate -- down --to <ultima-que-se-queda>` lista lo que revertiría; con `--yes` lo hace, cada una en su transacción con el borrado de su fila. Si a alguna del tramo le falta el `.down.sql`, no revierte ninguna.

## 6. Añadir una migración

- **A mano**, como 0002–0014: `drizzle/NNNN_descripcion.sql` con el número siguiente al más alto (los huecos dan igual; un número repetido hace fallar al runner). En el mismo PR, el cambio equivalente en `src/db/schema.ts`.
- **`drizzle-kit` no está instalado y no se reinstala** (se retiró: no tenía ningún uso y arrastraba un esbuild vulnerable). `drizzle/meta/_journal.json` y los snapshots se quedaron en 0001: su `generate` volvería a generar todo lo hecho a mano desde entonces, y `migrate`/`push` no saben nada de `migrations.applied`.
- **Sin `BEGIN`/`COMMIT`:** la transacción la pone el runner. Para `CONCURRENTLY` o `VACUUM`, primera línea `-- migrate:no-transaction` y cada sentencia separada con `--> statement-breakpoint`.
- **Idempotente cuando sea barato** (`IF NOT EXISTS`, bloques `DO ... EXCEPTION WHEN duplicate_object`): ayuda si una base quedó a medias.
- **Sin secretos ni datos de clientes** (AGENTS.md).
- **Rollback opcional:** `drizzle/NNNN_descripcion.down.sql`, que deshace exactamente esa migración. Admite el mismo marcador `-- migrate:no-transaction`.
- **Probarla:** `npm run test:e2e` (o CI) la aplica con el runner sobre una base vacía; el paso de CI comprueba además que una segunda pasada no reaplica nada.

## 7. Nunca editar una migración aplicada

Una vez aplicada (o marcada por baseline) en cualquier base, el fichero no se toca: su checksum cambiaría, `status` la mostraría `MODIFICADA` y `up`, `baseline` y `down` se negarían a seguir. Si hace falta cambiar algo, se escribe una migración nueva. Si `status` muestra `MODIFICADA` por error, restaurar el fichero (`git checkout main -- drizzle/<fichero>`).

Las cabeceras antiguas (`psql "$DATABASE_URL" -f ...`) se quedan como están por esta misma regla: están obsoletas. El procedimiento vigente es este runbook.

## Riesgos y comprobaciones abiertas

- **Túnel y `pg_hba.conf`:** el runner entra por TCP con password, no por el socket de `docker exec`. Si el contenedor no lo admite, no se puede usar sin tocar su configuración.
- **Migraciones sin transacción:** si fallan a medias no hay rollback automático; tomar siempre el backup antes de `up`.
- **Objetos creados a mano en producción** (las vistas `v_monthly_totals` y `v_annual_by_category`): el runner no los conoce ni los toca.
