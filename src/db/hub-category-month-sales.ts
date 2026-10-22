import { getHubPool } from "@/db/hub";
import { netAmountSumExpr, sourceFor } from "@/db/hub-sql";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

export async function getHubCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  // Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
  const src = sourceFor(f.tipo);
  const sql = `
    SELECT extract(month from h.date)::int AS mes,
           it.category_name AS categoria,
           ${netAmountSumExpr("l", "h")} AS importe
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
