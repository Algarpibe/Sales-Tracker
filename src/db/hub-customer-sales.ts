import { getHubPool } from "@/db/hub";
import { customerPredicate, netAmountSumExpr, sourceFor, yearSpanExpr } from "@/db/hub-sql";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

export async function getHubCustomerSales(f: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  // Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
  const src = sourceFor(f.tipo);
  const params: unknown[] = [f.desdeAnio, f.hastaAnio];
  const porCliente = customerPredicate(params, f.customer);
  const sql = `
    SELECT h.customer_name AS customer,
           extract(year from h.date)::int AS year,
           ${netAmountSumExpr("l", "h")} AS ventas
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE ${yearSpanExpr("h.date", "$1", "$2")}
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
      ${porCliente}
    GROUP BY h.customer_name, extract(year from h.date)`;
  const { rows } = await getHubPool().query(sql, params);
  return rows.map((r) => ({
    customer: String(r.customer),
    year: Number(r.year),
    ventas: Number(r.ventas),
  }));
}
