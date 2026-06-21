import { getHubPool } from "@/db/hub";
import type { ItemSalesFilters, ItemSalesRow } from "@/types/database";

// Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
// BACKLOG no aplica a esta vista; cualquier valor distinto de SALES_ORDER usa FAC.
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubItemSales(f: ItemSalesFilters): Promise<ItemSalesRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT it.item_id, it.sku, it.name AS nombre, it.category_name AS categoria,
           sum(l.quantity) AS cantidad,
           round(sum(l.bcy_rate * l.quantity)::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE h.date BETWEEN $1 AND $2
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
    GROUP BY it.item_id, it.sku, it.name, it.category_name
    ORDER BY importe DESC`;
  const { rows } = await getHubPool().query(sql, [f.desde, f.hasta]);
  return rows.map((r) => ({
    item_id: String(r.item_id),
    sku: r.sku ?? null,
    nombre: String(r.nombre ?? ""),
    categoria: r.categoria ?? null,
    cantidad: Number(r.cantidad),
    importe: Number(r.importe),
  }));
}
