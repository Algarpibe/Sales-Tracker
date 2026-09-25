-- Grupo de Servicio Tecnico de cada categoria: 'st' (mano de obra), 'cr'
-- (consumibles y repuestos) o NULL si no cuenta. Sustituye a las listas fijas
-- ST_CATEGORIES y CR_CATEGORIES de src/lib/tech-service.ts. Una sola columna
-- garantiza que una categoria no este en los dos grupos, y al indexar por
-- categoria (no por nombre) renombrarla no la saca de su grupo.
--
-- Cambio aditivo. Aplicar a mano en la BD del app ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0011_tech_service_bucket.sql
--
-- Los UPDATE copian las listas fijas de hoy. Solo cambian las cifras si alguna
-- categoria inactiva lleva uno de estos nombres: antes no contaba y ahora si.
-- No volver a ejecutar despues de cambiar la clasificacion desde
-- Configuracion: los UPDATE la devolverian a las listas de partida.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tech_service_bucket text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE categories ADD CONSTRAINT categories_tech_service_bucket_check
		CHECK (tech_service_bucket IS NULL OR tech_service_bucket IN ('st', 'cr'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
UPDATE categories SET tech_service_bucket = 'st' WHERE name IN (
	'Alquileres', 'CAL CO', 'CAL NOx', 'CAL O3', 'CAL PM', 'CAL SO2', 'ST',
	'ST APMA', 'ST APNA', 'ST APOA', 'ST APSA', 'ST EDM 180'
);
--> statement-breakpoint
UPDATE categories SET tech_service_bucket = 'cr' WHERE name IN (
	'C&R AP Series', 'C&R APMA-370', 'C&R APNA-370', 'C&R APOA-370', 'C&R APSA-370',
	'C&R D-R 290', 'C&R EDM 180', 'C&R ENDA Series', 'C&R Enviro', 'C&R OCMA-500',
	'C&R PG Series', 'C&R Series 6103', 'C&R Series 7000', 'C&R Shelter', 'C&R U-50 Series'
);
