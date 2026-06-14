-- Índices secundarios de rendimiento (Tanda 1 de optimización).
-- Postgres no crea índice automático para columnas FK; estas consultas
-- multi-tenant filtran por company_id y otras FKs.
-- Seguro de aplicar en producción (aditivo). En bases con tráfico, usar
-- CREATE INDEX CONCURRENTLY (no permitido dentro de transacción).

CREATE INDEX IF NOT EXISTS idx_sales_company_year_month ON sales_records (company_id, record_year, record_month);
CREATE INDEX IF NOT EXISTS idx_sales_company_type       ON sales_records (company_id, record_type);
CREATE INDEX IF NOT EXISTS idx_sales_category           ON sales_records (category_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_by         ON sales_records (created_by);
CREATE INDEX IF NOT EXISTS idx_sales_updated_by         ON sales_records (updated_by);
CREATE INDEX IF NOT EXISTS idx_profiles_company         ON profiles (company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_created ON subscriptions (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cgm_company_group        ON category_group_mappings (company_id, group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_category             ON category_group_mappings (category_id);
CREATE INDEX IF NOT EXISTS idx_session_user             ON session ("userId");
CREATE INDEX IF NOT EXISTS idx_account_user             ON account ("userId");
