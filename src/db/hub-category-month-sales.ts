import { getHubPool } from "@/db/hub";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT extract(month from h.date)::int AS mes,
           it.category_name AS categoria,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
    GROUP BY extract(month from h.date), it.category_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({ mes: Number(r.mes), categoria: r.categoria ?? null, importe: Number(r.importe) }));
}
