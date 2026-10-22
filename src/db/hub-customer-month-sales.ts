import { getHubPool } from "@/db/hub";
import { netAmountSumExpr, sourceFor } from "@/db/hub-sql";
import type { CustomerMonthFilters, CustomerMonthRow } from "@/types/database";

export async function getHubCustomerMonthSales(f: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  // Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
  const src = sourceFor(f.tipo);
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           ${netAmountSumExpr("l", "h")} AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
    GROUP BY h.customer_name, extract(month from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    customer: String(r.customer),
    mes: Number(r.mes),
    importe: Number(r.importe),
  }));
}
