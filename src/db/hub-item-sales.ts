import { getHubPool } from "@/db/hub";
import { sourceFor } from "@/db/hub-sql";
import type { ItemSalesFilters, ItemSalesRow } from "@/types/database";

export async function getHubItemSales(f: ItemSalesFilters): Promise<ItemSalesRow[]> {
  // Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
  // BACKLOG no aplica a esta vista; cualquier valor distinto de SALES_ORDER usa FAC.
  const src = sourceFor(f.tipo);
  // Importe BRUTO a propósito (bcy_rate * cantidad, sin netAmountSumExpr): esta vista
  // cuadra con el informe de artículos de Zoho, que no prorratea el descuento de
  // cabecera (ver ItemSalesRow.importe en src/types/database.ts).
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
