-- Ordenes de venta marcadas a mano como ingresos de proyecto. Solo la referencia:
-- el importe y la fecha se calculan siempre en vivo contra el hub, nunca se duplican
-- aqui, para que una orden editada en Zoho despues de marcarla siga reflejando su
-- valor actual.
CREATE TABLE IF NOT EXISTS kpi_project_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hub_order_id text NOT NULL,
  tagged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tagged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_project_orders_unique UNIQUE (company_id, hub_order_id)
);
