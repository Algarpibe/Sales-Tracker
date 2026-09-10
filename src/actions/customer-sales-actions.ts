"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import { getHistoricalCustomerSales, HISTORICAL_LAST_YEAR } from "@/db/historical-customer-sales";
import { mergeWithHistory } from "@/lib/customer-sales";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerSales(filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  const { profile } = await requireApproved();

  const hubRows = (await getHubCustomerSales(filters)).map((r) => ({
    ...r,
    source: "hub" as const,
  }));

  // El histórico solo se sirve a quien lo pide explícitamente (hoy: /clientes).
  // Además es facturación consolidada, así que no aplica a Órdenes de Venta,
  // y no existe por encima de 2020: fuera de ese rango ni se consulta.
  const aplica =
    filters.includeHistory === true &&
    filters.tipo === "INVOICE" &&
    filters.desdeAnio <= HISTORICAL_LAST_YEAR;

  if (!aplica) return hubRows;

  const histRows = await getHistoricalCustomerSales(
    profile.company_id,
    filters.desdeAnio,
    filters.hastaAnio
  );

  // El historico manda en su rango: el 2020 del hub es parcial (Zoho se empezo
  // a usar a mediados de 2020) y sumar ambas fuentes duplicaria ese anio.
  return mergeWithHistory(hubRows, histRows, HISTORICAL_LAST_YEAR);
}
