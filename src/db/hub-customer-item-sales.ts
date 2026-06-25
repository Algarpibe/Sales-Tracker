import { getHubPool } from "@/db/hub";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerItemSales(f: CustomerItemFilters): Promise<CustomerItemRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer, it.sku, it.raw->>'manufacturer' AS marca,
           it.name AS nombre, it.category_name AS categoria,
           sum(l.quantity) AS cantidad,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric,0) / NULLIF(h.bcy_sub_total,0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
    GROUP BY h.customer_name, it.sku, it.raw->>'manufacturer', it.name, it.category_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    customer: String(r.customer),
    sku: r.sku ?? null,
    marca: r.marca ?? null,
    nombre: String(r.nombre ?? ""),
    categoria: r.categoria ?? null,
    cantidad: Number(r.cantidad),
    importe: Number(r.importe),
  }));
}
