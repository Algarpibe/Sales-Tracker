import { getHubPool } from "@/db/hub";
import { customerPredicate, netAmountSumExpr, sourceFor, yearRangeExpr } from "@/db/hub-sql";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

export async function getHubCustomerItemSales(f: CustomerItemFilters): Promise<CustomerItemRow[]> {
  // Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
  const src = sourceFor(f.tipo);
  const params: unknown[] = [f.anio];
  const porCliente = customerPredicate(params, f.customer);
  const sql = `
    SELECT h.customer_name AS customer, it.sku, it.raw->>'manufacturer' AS marca,
           it.name AS nombre, it.category_name AS categoria,
           sum(l.quantity) AS cantidad,
           ${netAmountSumExpr("l", "h")} AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE ${yearRangeExpr("h.date", "$1")}
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
      ${porCliente}
    GROUP BY h.customer_name, it.sku, it.raw->>'manufacturer', it.name, it.category_name`;
  const { rows } = await getHubPool().query(sql, params);
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
