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
  -- raw->>'zcrm_potential_id' es el trato de CRM de la orden: alimenta el KPI de
  -- tratos cerrados ganados.
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
  created_time timestamptz,
  -- Fecha de negocio del cierre. El KPI de tratos ganados ya no la usa (cuenta por la
  -- primera orden de venta del trato); se conserva porque la semilla la rellena.
  closing_date date
);

-- El hub real replica tambien Zoho Desk. Aqui solo va el historial de tickets, con
-- los tipos del esquema real (packages/zoho-sync/src/db/schema.sql de
-- ambientalia-desk) y solo las columnas que consulta src/db/hub-kpi.ts.
CREATE SCHEMA IF NOT EXISTS desk;

CREATE TABLE desk.ticket_history (
  id         text PRIMARY KEY,
  ticket_id  text NOT NULL,
  event_name text,
  event_time timestamptz,
  -- Evento de Zoho entero. Un cambio de fase es un TicketUpdated con un elemento
  -- { propertyName: 'Status', propertyValue: { previousValue, updatedValue } } en eventInfo.
  raw        jsonb
);

-- Tickets y cuentas de Desk: solo las columnas que une src/db/hub-kpi.ts para poner
-- numero y cliente al detalle del KPI de tickets en plazo. Tipos del esquema real.
-- Sin FOREIGN KEY a proposito: en el hub real un ticket puede apuntar a una cuenta
-- que todavia no se ha replicado, y la consulta usa LEFT JOIN por eso mismo.
CREATE TABLE desk.accounts (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE desk.tickets (
  id         text PRIMARY KEY,
  number     integer UNIQUE NOT NULL,
  account_id text
);
