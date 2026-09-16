-- Replica minima del zoho-hub: SOLO las columnas que consultan src/db/hub-*.ts.
-- No es el esquema real del hub, es la superficie que la app usa.
CREATE SCHEMA IF NOT EXISTS books;

CREATE TABLE books.items (
  item_id       text PRIMARY KEY,
  name          text NOT NULL,
  sku           text,
  category_name text,
  -- raw->>'purchase_rate' es el costo estandar que usa la pestana Margen.
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.sales_orders (
  salesorder_id text PRIMARY KEY,
  date          date,
  status        text NOT NULL,
  customer_name text,
  bcy_sub_total numeric,
  -- raw->>'invoiced_status' alimenta el calculo de BACKLOG.
  -- raw->>'bcy_discount_total' es el descuento de cabecera.
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.salesorder_line_items (
  line_item_id  text PRIMARY KEY,
  salesorder_id text NOT NULL REFERENCES books.sales_orders(salesorder_id),
  item_id       text REFERENCES books.items(item_id),
  bcy_rate      numeric,
  quantity      numeric
);

CREATE TABLE books.invoices (
  invoice_id    text PRIMARY KEY,
  salesorder_id text,
  date          date,
  status        text NOT NULL,
  customer_name text,
  bcy_sub_total numeric,
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE books.invoice_line_items (
  line_item_id text PRIMARY KEY,
  invoice_id   text NOT NULL REFERENCES books.invoices(invoice_id),
  item_id      text REFERENCES books.items(item_id),
  bcy_rate     numeric,
  quantity     numeric
);

-- El hub real replica tambien Zoho CRM. Aqui solo van las columnas que consulta
-- src/db/hub-kpi.ts, igual que con books.
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE crm.deals (
  id           text PRIMARY KEY,
  deal_name    text,
  account_name text,
  owner_name   text,
  stage        text,
  amount       numeric,
  created_time timestamptz
);
