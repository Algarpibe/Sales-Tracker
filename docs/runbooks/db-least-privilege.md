# Runbook — App con rol de mínimo privilegio (`salestracker_app`)

Hallazgo DATA-042. Hoy el app se conecta a `sales_tracker` como `postgres`, que es superusuario. Este runbook crea el rol `salestracker_app` (sin superusuario, sin `BYPASSRLS`, sin DDL ni `TRUNCATE`), le da `LOGIN` y cambia el `DATABASE_URL` del app para que lo use.

- **Tiempo estimado:** 20–30 minutos, más el redeploy.
- **Corte de servicio:** solo el del redeploy. Los pasos 1 a 5 no afectan al app en marcha.
- **Reversible:** sí, volviendo a poner el `DATABASE_URL` anterior (paso 9).

Marcadores de este documento (no hay datos reales a propósito):

| Marcador | Qué es |
|---|---|
| `<VPS>` | Acceso SSH al servidor |
| `<contenedor-db>` | Nombre del contenedor Postgres de `sales-tracker-db` (`docker ps`) |
| `<host-interno>` | Host interno del servicio Postgres en EasyPanel |
| `<password-app>` | Password nueva de `salestracker_app`. Solo vive en el gestor de contraseñas y en EasyPanel |

---

## 1. Prerrequisitos

- [ ] La rama con `drizzle/0014_app_role.sql` está fusionada en `main` y el CI (incluido E2E) está en verde. E2E ya corre el app entero con `salestracker_app`: si falta algún permiso, falla ahí y no en producción.
- [ ] Acceso SSH a `<VPS>` y a EasyPanel.
- [ ] Una password fuerte generada para `salestracker_app` (gestor de contraseñas, 32+ caracteres). Si lleva caracteres especiales (`@ : / ? # %`), hay que codificarlos en la URL del paso 6.
- [ ] Una ventana de cambio en la que se pueda redeployar el app.

Comprobar versión y dueños de los objetos (como `postgres`):

```bash
ssh <VPS>
docker exec -it <contenedor-db> psql -U postgres -d sales_tracker
```

```sql
SHOW server_version;   -- 15 o más: el esquema public ya no da CREATE a PUBLIC

-- Tablas y vistas de public y su dueño. Lo esperado es postgres en todas.
SELECT tablename AS objeto, 'tabla' AS tipo, tableowner AS dueno
  FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT viewname, 'vista', viewowner
  FROM pg_views WHERE schemaname = 'public'
ORDER BY 2, 1;
```

Lo esperado: 16 tablas (las de `drizzle/`) y las vistas `v_monthly_totals` y `v_annual_by_category`, todas de `postgres`. Si aparece algo que no se reconoce, o un dueño distinto, parar y revisarlo antes de seguir (ver "Riesgos" al final).

## 2. Backup

Antes de tocar nada, un volcado completo de `sales_tracker`:

```bash
ssh <VPS>
docker exec <contenedor-db> pg_dump -U postgres -d sales_tracker -Fc \
  > ~/backups/sales_tracker_$(date +%Y%m%d_%H%M)_pre_0014.dump
ls -lh ~/backups/ | tail -1   # que no pese 0 bytes
```

## 3. Aplicar la migración 0014 como `postgres`

Desde la copia local del repo, ya en `main`:

```bash
scp drizzle/0014_app_role.sql <VPS>:/tmp/0014_app_role.sql
ssh <VPS>
docker exec -i <contenedor-db> psql -U postgres -d sales_tracker -v ON_ERROR_STOP=1 \
  < /tmp/0014_app_role.sql
rm /tmp/0014_app_role.sql
```

Salida esperada: `DO`, `ALTER ROLE`, `DO`, `GRANT` (x3) y `ALTER DEFAULT PRIVILEGES` (x2), sin `ERROR`. Se puede volver a ejecutar sin efectos.

El rol queda creado pero **sin LOGIN y sin password**: la migración está versionada y no puede llevar secretos.

## 4. Dar LOGIN y password a `salestracker_app`

Con `\password` la password se pide por teclado y se cifra en el cliente: no queda en el historial de la shell, ni en el de psql, ni en los logs de Postgres.

```bash
ssh <VPS>
docker exec -it <contenedor-db> psql -U postgres -d sales_tracker
```

```sql
\password salestracker_app
-- (pegar <password-app> dos veces)
ALTER ROLE salestracker_app LOGIN;
```

No usar `ALTER ROLE ... PASSWORD '...'` con la password en claro: queda en `~/.psql_history` y puede salir en los logs.

## 5. Verificar el rol y sus permisos

En la misma sesión de `psql` como `postgres`:

```sql
\du salestracker_app
-- Esperado: sin "Superuser", "Create role", "Create DB", "Bypass RLS" ni "Replication".
-- Puede mostrar "No inheritance".

SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
  FROM pg_roles WHERE rolname = 'salestracker_app';
-- Esperado: f | f | f | f | t   (rolcanlogin = t)

-- Tablas o vistas de public a las que el rol NO podría leer o escribir.
SELECT c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
   AND NOT has_table_privilege('salestracker_app', c.oid, 'SELECT');
-- Esperado: 0 filas.

SELECT c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   AND NOT (has_table_privilege('salestracker_app', c.oid, 'INSERT')
        AND has_table_privilege('salestracker_app', c.oid, 'UPDATE')
        AND has_table_privilege('salestracker_app', c.oid, 'DELETE'));
-- Esperado: 0 filas.

-- Lo que NO debe tener.
SELECT has_table_privilege('salestracker_app', 'public.kpi_targets', 'TRUNCATE') AS truncate,
       has_schema_privilege('salestracker_app', 'public', 'CREATE')            AS crear_en_public,
       has_database_privilege('salestracker_app', 'sales_tracker', 'CREATE')   AS crear_en_bd;
-- Esperado: f | f | f

-- Detalle por tabla (lectura rápida de una sola vez).
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos
  FROM information_schema.role_table_grants
 WHERE grantee = 'salestracker_app' AND table_schema = 'public'
 GROUP BY 1 ORDER BY 1;
-- Esperado: DELETE, INSERT, SELECT, UPDATE en cada tabla y vista. Nada más.
```

Prueba de conexión real con el rol nuevo, por TCP para que use la autenticación por password:

```bash
docker exec -it <contenedor-db> psql -h 127.0.0.1 -U salestracker_app -d sales_tracker -W \
  -c "SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);"
# Esperado: salestracker_app | f
```

Si falla con `no pg_hba.conf entry`, el `pg_hba.conf` del contenedor no admite al usuario nuevo: revisarlo antes de seguir (la imagen oficial admite a todos los usuarios con password).

## 6. Cambiar el `DATABASE_URL` en EasyPanel y redeployar

En EasyPanel → servicio del app → **Environment**:

- Antes de editar, **copiar el valor actual de `DATABASE_URL`** a un sitio seguro: es el rollback.
- Cambiar solo usuario y password; host, puerto y base no cambian:

```
DATABASE_URL=postgres://salestracker_app:<password-app>@<host-interno>:5432/sales_tracker
```

- `HUB_DB_URL` **no se toca** (es otra base y ya usa su propio usuario de solo lectura).
- Guardar y **Redeploy**. Esperar a que el servicio quede en verde y revisar los logs del arranque: no debe aparecer `permission denied` ni `password authentication failed`.

## 7. Smoke test

Con un usuario administrador, en el navegador:

1. **Login** → entra y carga `/home` (lee `session`, `user`, `profiles`).
2. **Dashboard** → las tarjetas cargan sin error.
3. **Escritura** → en Clientes, marcar un cliente como favorito (estrella) y recargar: sigue marcado. Desmarcarlo después. Alternativa: en Configuración, cambiar y guardar una meta de KPI, y volver a dejarla como estaba.
4. **Logout y login de nuevo** → crea y borra filas en `session`.

Si algo falla con `permission denied for table ...`, ir al paso 9 (rollback) y revisar qué objeto falta en el paso 5.

## 8. Confirmar que el app ya no usa `postgres`

Mientras se navega por el app, como `postgres`:

```sql
SELECT usename, count(*)
  FROM pg_stat_activity
 WHERE datname = 'sales_tracker'
 GROUP BY 1;
```

Esperado: las conexiones del app aparecen como `salestracker_app`. `postgres` solo debe aparecer con la propia sesión de `psql` desde la que se lanza la consulta.

## 9. Rollback

1. En EasyPanel, volver a poner el `DATABASE_URL` copiado en el paso 6 (el de `postgres`) y redeployar.
2. Repetir el smoke test del paso 7.

El rol `salestracker_app` puede quedarse: sin uso no da acceso a nada que no tenga ya `postgres`. Si se quiere quitar el login sin borrarlo:

```sql
ALTER ROLE salestracker_app NOLOGIN;
```

Borrarlo del todo solo hace falta si se abandona el cambio (como `postgres`, en `sales_tracker`):

```sql
DROP OWNED BY salestracker_app;   -- quita sus GRANT y default privileges en esta base
DROP ROLE salestracker_app;
```

No hace falta restaurar el backup: la migración 0014 no cambia datos ni estructura.

## 10. Después del cambio

- **Migraciones futuras:** se siguen aplicando como `postgres`, nunca con el `DATABASE_URL` del app:

  ```bash
  docker exec -i <contenedor-db> psql -U postgres -d sales_tracker -v ON_ERROR_STOP=1 < drizzle/00NN_xxx.sql
  ```

  Las cabeceras de migraciones antiguas dicen `psql "$DATABASE_URL" -f ...`: con el `DATABASE_URL` nuevo fallarían con `must be owner` o `permission denied`. Lo mismo `drizzle.config.ts`, que usa `DATABASE_URL` si no hay `DRIZZLE_DATABASE_URL`: para `drizzle-kit` hay que pasar una URL de `postgres`.
- **Tablas nuevas:** los *default privileges* de 0014 dan `SELECT, INSERT, UPDATE, DELETE` a toda tabla o vista que cree `postgres` en `public`. Si una tabla la creara otro usuario, no los heredaría: volver a ejecutar 0014 la cubre.
- **RLS (DATA-006):** hasta hoy no tenía efecto, porque un superusuario ignora las políticas RLS. Con el app conectado como `salestracker_app` (sin `BYPASSRLS`, y sin ser dueño de las tablas) las políticas ya se aplicarían. Al activarlas, cada tabla con RLS necesita políticas para este rol, o el app dejará de ver filas.

## Riesgos y comprobaciones abiertas

- **Objetos que no vienen de `drizzle/`:** las vistas `v_monthly_totals` y `v_annual_by_category` se crearon a mano en la migración desde Supabase. 0014 las cubre porque `ALL TABLES` incluye vistas. Solo las lee el app cuando no hay `HUB_DB_URL`.
- **Dueños distintos de `postgres`:** el `GRANT` de 0014 funciona igual (lo lanza un superusuario), pero los *default privileges* solo cubren lo que cree `postgres` en adelante.
- **`TEMPORARY` en la base:** por defecto Postgres da `CONNECT` y `TEMPORARY` a `PUBLIC` en cada base, así que el rol puede crear tablas temporales. No es DDL sobre objetos del app; quitarlo (`REVOKE TEMPORARY ON DATABASE sales_tracker FROM PUBLIC`) queda fuera de este cambio.
