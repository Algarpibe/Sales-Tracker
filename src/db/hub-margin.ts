import { getHubPool } from "@/db/hub";
import type {
  MarginByYearFilters, MarginFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

// Ingreso neto (mismo ajuste de descuento que hub-customer-sales.ts).
const VENTAS = `round(sum(l.bcy_rate * l.quantity *
  COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
)::numeric, 2)::float8`;
// Costo estándar del maestro (NO se descuenta).
const COSTO = `round(sum(NULLIF(it.raw->>'purchase_rate','')::numeric * l.quantity)::numeric, 2)::float8`;
// Solo bienes con costo real.
const COMMON_WHERE = `l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND NULLIF(it.raw->>'purchase_rate','')::numeric > 0`;

function src(tipo: MarginFilters["tipo"]) {
  return tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
}

export async function getHubMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT extract(year from h.date)::int AS year, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE ${COMMON_WHERE}
    GROUP BY 1
    ORDER BY 1`;
  const { rows } = await getHubPool().query(sql);
  return rows.map((r) => ({ year: Number(r.year), ventas: Number(r.ventas), costo: Number(r.costo) }));
}

export async function getHubMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT it.item_id, it.sku, it.name AS nombre, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND ${COMMON_WHERE}
    GROUP BY it.item_id, it.sku, it.name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    item_id: String(r.item_id), sku: r.sku ?? null, nombre: String(r.nombre ?? ""),
    ventas: Number(r.ventas), costo: Number(r.costo),
  }));
}

export async function getHubMarginByCustomer(f: MarginFilters): Promise<MarginCustomerRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT h.customer_name AS customer, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND h.customer_name IS NOT NULL
      AND ${COMMON_WHERE}
    GROUP BY h.customer_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({ customer: String(r.customer), ventas: Number(r.ventas), costo: Number(r.costo) }));
}
