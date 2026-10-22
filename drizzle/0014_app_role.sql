-- Rol de minimo privilegio para la app (DATA-042). Hasta ahora el app se conectaba
-- como postgres, superusuario: cualquier inyeccion SQL tendria el cluster entero y
-- las politicas RLS no se aplicarian (el superusuario y BYPASSRLS las saltan).
-- salestracker_app solo lee y escribe filas: sin DDL, sin TRUNCATE, sin propiedad
-- de ningun objeto. Las migraciones siguen corriendo como postgres.
--
-- El rol nace NOLOGIN y sin password a proposito: este fichero esta versionado y
-- no puede llevar secretos. LOGIN y password se ponen fuera de banda, a mano en
-- produccion (\password salestracker_app, ver docs/runbooks/db-least-privilege.md)
-- y con una password de test en e2e/db/reset.mjs.
--
-- Cambio aditivo. Aplicar a mano en la BD del app (sales_tracker) como postgres
-- ANTES de cambiar el DATABASE_URL del app:
--   psql -U postgres -d sales_tracker -v ON_ERROR_STOP=1 -f drizzle/0014_app_role.sql
-- Despues del cambio, el DATABASE_URL del app ya no sirve para migrar: las
-- migraciones (esta y las siguientes) van siempre con el usuario postgres.
--
-- Se puede volver a ejecutar sin efectos: crea el rol solo si falta, los GRANT son
-- idempotentes y el ALTER ROLE no toca LOGIN ni password. Volver a ejecutarla tras
-- crear tablas o vistas a mano les da los mismos permisos. Los roles son de todo el
-- cluster: en E2E el rol sobrevive al DROP DATABASE entre ejecuciones.
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salestracker_app') THEN
		CREATE ROLE salestracker_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
	END IF;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Si el rol ya existia (creado a mano o por otra via), se le quitan los atributos
-- peligrosos. No menciona LOGIN: no deshace el LOGIN puesto fuera de banda.
ALTER ROLE salestracker_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
--> statement-breakpoint
-- El nombre de la base cambia entre produccion (sales_tracker) y E2E
-- (salestracker_e2e): por eso el GRANT va con EXECUTE sobre current_database().
DO $$ BEGIN
	EXECUTE format('GRANT CONNECT ON DATABASE %I TO salestracker_app', current_database());
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO salestracker_app;
--> statement-breakpoint
-- ALL TABLES incluye las vistas que existan en public (en produccion,
-- v_monthly_totals y v_annual_by_category, que no crea ninguna migracion de aqui).
-- Hoy no hay secuencias (todos los id son uuid con gen_random_uuid()); el GRANT
-- queda por si una tabla futura usa serial o identity. Sin EXECUTE extra: el
-- esquema no define funciones propias y las del sistema ya son de PUBLIC.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salestracker_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO salestracker_app;
--> statement-breakpoint
-- Las tablas que creen las migraciones futuras (como postgres) nacen ya con estos
-- permisos. Solo cubre objetos creados por postgres: si otra cuenta crea tablas,
-- hay que volver a ejecutar este fichero.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salestracker_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
	GRANT USAGE, SELECT ON SEQUENCES TO salestracker_app;
