-- Metas y pesos de los KPIs comerciales, por empresa, anio y ambito. El catalogo
-- de KPIs (clave, etiqueta, periodicidad) vive en src/lib/commercial-kpis.ts.
-- salesperson nulo = meta del total de la compania; con nombre, la de ese
-- comercial. NULLS NOT DISTINCT (Postgres 15+) impide dos filas del total.
CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_year integer NOT NULL,
  kpi_key text NOT NULL,
  salesperson text,
  target_value numeric(15,2) NOT NULL,
  weight_pct numeric(5,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_targets_unique UNIQUE NULLS NOT DISTINCT (company_id, record_year, kpi_key, salesperson),
  CONSTRAINT kpi_targets_target_check CHECK (target_value > 0),
  CONSTRAINT kpi_targets_weight_check CHECK (weight_pct >= 0 AND weight_pct <= 100)
);
