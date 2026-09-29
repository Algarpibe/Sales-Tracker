-- Macro-categoria de cada categoria: 'mano_obra', 'cr' (consumos y repuestos),
-- 'equipos' u 'operacion'. NULL cuenta como Equipos. Sustituye a las reglas de
-- nombre de bucketForCategory (src/lib/customer-item.ts). Es independiente de
-- tech_service_bucket (0011): las dos clasificaciones pueden no coincidir.
--
-- Cambio aditivo. Aplicar a mano en la BD del app (sales_tracker) ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0013_macro_categoria.sql
--
-- Ejecutar UNA SOLA VEZ en produccion. Los UPDATE copian las reglas de nombre de hoy
-- y solo tocan filas con macro_categoria IS NULL: volver a ejecutarla no pisa lo
-- marcado desde Configuracion. Ojo: "sin marcar" tambien es NULL. Una categoria que
-- alguien saco de su grupo y cuyo nombre casa con una regla SI se volveria a marcar.
-- Para sacarla de verdad, marcarla como Equipos en Configuracion.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS macro_categoria text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE categories ADD CONSTRAINT categories_macro_categoria_check
		CHECK (macro_categoria IS NULL OR macro_categoria IN ('mano_obra', 'cr', 'equipos', 'operacion'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'cr'
	WHERE macro_categoria IS NULL AND name LIKE 'C&R %';
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'mano_obra'
	WHERE macro_categoria IS NULL
		AND (name LIKE 'CAL %' OR name = 'ST' OR name LIKE 'ST %' OR name = 'Alquileres');
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'operacion'
	WHERE macro_categoria IS NULL AND name IN ('Operación de Redes', 'Consultoría');
