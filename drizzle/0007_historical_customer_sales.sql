-- Historico de ventas por cliente 2015-2020, anterior a la cobertura del zoho-hub.
-- Solo lo consume la vista /clientes; ninguna otra pantalla lee esta tabla.
CREATE TABLE IF NOT EXISTS historical_customer_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  record_year integer NOT NULL,
  amount_usd numeric(15,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_customer_sales_unique UNIQUE (company_id, customer_name, record_year)
);

CREATE INDEX IF NOT EXISTS idx_hist_customer_company_year
  ON historical_customer_sales (company_id, record_year);
