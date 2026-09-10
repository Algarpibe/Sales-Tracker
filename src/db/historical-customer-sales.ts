import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { historicalCustomerSales } from "@/db/schema";
import type { CustomerYearRow } from "@/types/database";

/** Último año cubierto por el histórico. A partir de 2021 manda el zoho-hub. */
export const HISTORICAL_LAST_YEAR = 2020;

/**
 * Ventas por cliente y año anteriores al zoho-hub (2015-2020).
 * Devuelve el mismo shape que el hub para poder concatenarlas sin transformar.
 */
export async function getHistoricalCustomerSales(
  companyId: string,
  desdeAnio: number,
  hastaAnio: number
): Promise<CustomerYearRow[]> {
  const rows = await db
    .select({
      customer: historicalCustomerSales.customer_name,
      year: historicalCustomerSales.record_year,
      ventas: historicalCustomerSales.amount_usd,
    })
    .from(historicalCustomerSales)
    .where(
      and(
        eq(historicalCustomerSales.company_id, companyId),
        gte(historicalCustomerSales.record_year, desdeAnio),
        lte(historicalCustomerSales.record_year, Math.min(hastaAnio, HISTORICAL_LAST_YEAR))
      )
    );

  return rows.map((r) => ({
    customer: String(r.customer),
    year: Number(r.year),
    // amount_usd es numeric: Drizzle lo entrega como string.
    ventas: Number(r.ventas),
    source: "historical" as const,
  }));
}
