import { getHubPool } from "@/db/hub";
import { isExcludedSalesperson, parseExcludedSalespeople, WON_DEAL_STAGES } from "@/lib/commercial-kpis";
import type { DealMonthRow } from "@/lib/kpi-score";
import type { CustomerMonthRow, RecordType } from "@/types/database";

// Vendedores que aparecen en el hub. Zoho los guarda dentro del JSON de la
// cabecera, no en columna propia, y los mismos nombres salen en ordenes y en
// facturas: se unen las dos fuentes para no depender de una sola.
export async function getHubSalespeople(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT nombre FROM (
      SELECT s.raw->>'salesperson_name' AS nombre
      FROM books.sales_orders s
      WHERE s.status NOT IN ('void','draft')
      UNION
      SELECT i.raw->>'salesperson_name'
      FROM books.invoices i
      WHERE i.status NOT IN ('void','draft')
    ) t
    WHERE nombre IS NOT NULL AND nombre <> ''
    ORDER BY nombre`;
  const { rows } = await getHubPool().query(sql);
  // El filtro va en JavaScript y no en el SQL para poder ignorar mayúsculas y
  // tildes: el mismo nombre llega de Zoho escrito de las dos maneras. Solo se
  // quita del selector de propietario; sus ventas siguen contando en el total
  // de la compañía, que es lo que se quiere.
  const excluidos = parseExcludedSalespeople(process.env.KPI_EXCLUDED_SALESPEOPLE);
  return rows
    .map((r) => String(r.nombre))
    .filter((nombre) => !isExcludedSalesperson(nombre, excluidos));
}

// Misma agregación que getHubCustomerMonthSales, con el vendedor como filtro
// opcional. Zoho guarda el comercial en el JSON de la cabecera, no en columna
// propia, así que el filtro va sobre raw->>'salesperson_name'.
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerMonthByOwner(f: {
  tipo: RecordType;
  anio: number;
  owner: string | null;
}): Promise<CustomerMonthRow[]> {
  // La tabla se elige en servidor a partir del tipo, nunca por entrada del usuario.
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
      AND ($2::text IS NULL OR h.raw->>'salesperson_name' = $2)
    GROUP BY h.customer_name, extract(month from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    customer: String(r.customer),
    mes: Number(r.mes),
    importe: Number(r.importe),
  }));
}

// Tratos por cuenta y mes. Zoho CRM se replica en el esquema crm del hub, y
// owner_name usa las mismas cadenas que el vendedor de Books, asi que el filtro
// por comercial vale para las dos fuentes sin traducir nada.
export async function getHubDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.created_time)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.created_time) = $1
      AND d.account_name IS NOT NULL
      AND ($2::text IS NULL OR d.owner_name = $2)
    GROUP BY d.account_name, extract(month from d.created_time)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}

// Tratos ganados por cuenta y mes. Se cuenta por closing_date y no por created_time: es
// la fecha de negocio del cierre, y al ser date no arrastra zona horaria. El filtro por
// fase es imprescindible: las fases abiertas llevan fecha de cierre PREVISTA, que cae
// en el futuro, y sin filtrar contaminarian el conteo.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.closing_date)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.closing_date) = $1
      AND d.stage = ANY($2::text[])
      AND d.account_name IS NOT NULL
      AND ($3::text IS NULL OR d.owner_name = $3)
    GROUP BY d.account_name, extract(month from d.closing_date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, [...WON_DEAL_STAGES], f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}

export interface HubOrderRow {
  hub_order_id: string;
  customer_name: string;
  date: string;
  importe: number;
}

// Importe neto de una orden de venta: misma formula que getHubCustomerMonthSales,
// agrupada por orden en vez de por cliente y mes, para poder mostrarla en el
// buscador y en la lista de ordenes ya marcadas como ingresos de proyecto.
const IMPORTE_ORDEN = `
  round(sum(l.bcy_rate * l.quantity *
    COALESCE(1 - COALESCE((s.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(s.bcy_sub_total, 0), 1)
  )::numeric, 2)::float8`;

// Busca ordenes de venta por cliente o por id interno de Zoho. NO busca por
// salesorder_number: esa clave no existe en raw del hub (comprobado contra el
// hub falso de test).
export async function searchHubSalesOrders(query: string): Promise<HubOrderRow[]> {
  const like = `%${query}%`;
  // s.date::text: sin el cast, pg devuelve un objeto Date (parser por defecto de
  // node-postgres para el tipo date) y String(...) lo serializa en la zona horaria
  // local del proceso, NO en 'YYYY-MM-DD'. El cast a texto evita esa conversion:
  // devuelve el mismo literal ISO que hay en la columna, sin ambiguedad horaria.
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date::text AS date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.status NOT IN ('void','draft')
      AND (s.customer_name ILIKE $1 OR s.salesorder_id ILIKE $1)
    GROUP BY s.salesorder_id, s.customer_name, s.date
    ORDER BY s.date DESC
    LIMIT 25`;
  const { rows } = await getHubPool().query(sql, [like]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}

// Resuelve ordenes ya marcadas por su id, para calcular su importe siempre en
// vivo contra el hub. Con ids vacio no consulta el hub.
export async function getHubOrdersByIds(ids: string[]): Promise<HubOrderRow[]> {
  if (ids.length === 0) return [];
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date::text AS date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.salesorder_id = ANY($1::text[])
    GROUP BY s.salesorder_id, s.customer_name, s.date`;
  const { rows } = await getHubPool().query(sql, [ids]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}
