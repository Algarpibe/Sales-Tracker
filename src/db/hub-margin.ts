import { getHubPool } from "@/db/hub";
import { customerPredicate, netAmountSumExpr, sourceFor, yearRangeExpr } from "@/db/hub-sql";
import type {
  MarginByYearFilters, MarginFilters, MarginCustomerFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

// Ingreso neto (mismo ajuste de descuento que hub-customer-sales.ts).
const VENTAS = netAmountSumExpr("l", "h");
// Costo estándar del maestro (NO se descuenta).
const COSTO = `round(sum(NULLIF(it.raw->>'purchase_rate','')::numeric * l.quantity)::numeric, 2)::float8`;
// Solo bienes con costo real.
const COMMON_WHERE = `l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND NULLIF(it.raw->>'purchase_rate','')::numeric > 0`;

export async function getHubMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  // Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
  const s = sourceFor(f.tipo);
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
  const s = sourceFor(f.tipo);
  const sql = `
    SELECT it.item_id, it.sku, it.name AS nombre, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE ${yearRangeExpr("h.date", "$1")}
      AND ${COMMON_WHERE}
    GROUP BY it.item_id, it.sku, it.name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    item_id: String(r.item_id), sku: r.sku ?? null, nombre: String(r.nombre ?? ""),
    ventas: Number(r.ventas), costo: Number(r.costo),
  }));
}

export async function getHubMarginByCustomer(f: MarginCustomerFilters): Promise<MarginCustomerRow[]> {
  const s = sourceFor(f.tipo);
  const params: unknown[] = [f.anio];
  const porCliente = customerPredicate(params, f.customer);
  const sql = `
    SELECT h.customer_name AS customer, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE ${yearRangeExpr("h.date", "$1")}
      AND h.customer_name IS NOT NULL
      ${porCliente}
      AND ${COMMON_WHERE}
    GROUP BY h.customer_name`;
  const { rows } = await getHubPool().query(sql, params);
  return rows.map((r) => ({ customer: String(r.customer), ventas: Number(r.ventas), costo: Number(r.costo) }));
}
