import { getHubPool } from "./hub";
import { netAmountExpr } from "./hub-sql";

// Fila agregada del hub por (categoría Zoho, tipo, mes, año).
export type HubSalesRow = {
  category_name: string;
  record_type: "SALES_ORDER" | "INVOICE" | "BACKLOG";
  record_month: number;
  record_year: number;
  amount_usd: number;
};

// Misma lógica que el transform de n8n (validada al céntimo contra los informes de Zoho):
//  - INVOICE / SALES_ORDER: bcy_rate*qty neto del descuento de cabecera (entity-level).
//  - BACKLOG: porción no facturada por orden vía invoiced_status (not_invoiced=total,
//    partially_invoiced=pendiente, invoiced=0), atribuida a la categoría de cada línea.
// Excluye void/draft. Categoría = books.items.category_name (luego se mapea a las
// categorías de la app por nombre).
const HUB_SALES_AGG_SQL = `
WITH ord AS (
  SELECT s.salesorder_id, s.date, (s.raw->>'invoiced_status') st,
    sum(l.bcy_rate*l.quantity) gross
  FROM books.salesorder_line_items l JOIN books.sales_orders s ON s.salesorder_id=l.salesorder_id
  WHERE s.date IS NOT NULL AND l.bcy_rate IS NOT NULL AND s.status NOT IN ('void','draft')
  GROUP BY 1,2,3
),
oi AS (
  SELECT i.salesorder_id, sum(li.bcy_rate*li.quantity) inv
  FROM books.invoice_line_items li JOIN books.invoices i ON i.invoice_id=li.invoice_id
  WHERE i.salesorder_id IS NOT NULL AND i.salesorder_id<>'' AND li.bcy_rate IS NOT NULL AND i.status NOT IN ('void','draft')
  GROUP BY 1
),
frac AS (
  SELECT o.salesorder_id, o.date,
    CASE WHEN o.st='not_invoiced' THEN 1
         WHEN o.st='partially_invoiced' AND o.gross>0 THEN greatest(0,(o.gross-coalesce(oi.inv,0))/o.gross)
         ELSE 0 END f
  FROM ord o LEFT JOIN oi ON oi.salesorder_id=o.salesorder_id
),
lines AS (
  SELECT it.category_name cat,'INVOICE' rt, extract(year from i.date)::int yy, extract(month from i.date)::int mm,
    ${netAmountExpr("l", "i")} amt
  FROM books.invoice_line_items l JOIN books.invoices i ON i.invoice_id=l.invoice_id LEFT JOIN books.items it ON it.item_id=l.item_id
  WHERE i.date IS NOT NULL AND l.bcy_rate IS NOT NULL AND i.status NOT IN ('void','draft')
  UNION ALL
  SELECT it.category_name,'SALES_ORDER', extract(year from s.date)::int, extract(month from s.date)::int,
    ${netAmountExpr("l", "s")}
  FROM books.salesorder_line_items l JOIN books.sales_orders s ON s.salesorder_id=l.salesorder_id LEFT JOIN books.items it ON it.item_id=l.item_id
  WHERE s.date IS NOT NULL AND l.bcy_rate IS NOT NULL AND s.status NOT IN ('void','draft')
  UNION ALL
  SELECT it.category_name,'BACKLOG', extract(year from f.date)::int, extract(month from f.date)::int,
    l.bcy_rate*l.quantity * f.f
  FROM books.salesorder_line_items l JOIN frac f ON f.salesorder_id=l.salesorder_id LEFT JOIN books.items it ON it.item_id=l.item_id
  WHERE l.bcy_rate IS NOT NULL AND f.f > 0
)
SELECT cat AS category_name, rt AS record_type, mm AS record_month, yy AS record_year, round(sum(amt),2)::float8 AS amount_usd
FROM lines WHERE cat IS NOT NULL GROUP BY cat, rt, mm, yy
`;

// Cache en memoria corto: la agregación recorre todas las líneas del hub; con TTL
// 30s, todas las lecturas de una misma carga de página comparten un único cálculo.
let _cache: { at: number; rows: HubSalesRow[] } | null = null;
const CACHE_TTL_MS = 30_000;

// Consulta en vuelo: al vencer la caché, las lecturas simultáneas (varias tarjetas de
// la misma página) esperan la MISMA promesa en vez de lanzar N agregaciones completas
// y agotar el pool del hub. Se suelta al resolver Y al fallar: un fallo no se cachea.
let _inflight: Promise<HubSalesRow[]> | null = null;

export async function getHubSalesRows(): Promise<HubSalesRow[]> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.rows;
  _inflight ??= cargarHubSalesRows().finally(() => {
    _inflight = null;
  });
  return _inflight;
}

async function cargarHubSalesRows(): Promise<HubSalesRow[]> {
  const { rows } = await getHubPool().query(HUB_SALES_AGG_SQL);
  const mapped: HubSalesRow[] = rows.map((r) => ({
    category_name: String(r.category_name),
    record_type: r.record_type as HubSalesRow["record_type"],
    record_month: Number(r.record_month),
    record_year: Number(r.record_year),
    amount_usd: Number(r.amount_usd),
  }));
  _cache = { at: Date.now(), rows: mapped };
  return mapped;
}
