-- Plazo, en horas laborables, del KPI "Tickets de Servicio Tecnico en plazo".
-- Sustituye a la constante PLAZO_HORAS = 12 de src/lib/kpi-tickets.ts. Solo se
-- rellena en la fila tickets_st del total de la compania (salesperson nulo) de
-- cada anio: ese KPI solo se mide a nivel compania. Nulo = 12 horas, el valor de
-- antes, asi que las cifras no cambian al desplegar.
--
-- Cambio aditivo. Aplicar a mano en la BD del app ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0012_kpi_plazo_horas.sql
--
-- No lleva ningun UPDATE: se puede volver a ejecutar sin efectos.
ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS plazo_horas numeric(6,2);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE kpi_targets ADD CONSTRAINT kpi_targets_plazo_horas_check
		CHECK (plazo_horas IS NULL OR plazo_horas > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
