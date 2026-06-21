"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerSales(filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  await requireApproved();
  return getHubCustomerSales(filters);
}
