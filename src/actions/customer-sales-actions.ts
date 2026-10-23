"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readCustomerSales } from "@/lib/data-reads";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
// El histórico (includeHistory) y su fusión con el hub viven en readCustomerSales.
export async function getCustomerSales(filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  const { profile } = await requireApproved();
  return readCustomerSales(profile.company_id, filters);
}
