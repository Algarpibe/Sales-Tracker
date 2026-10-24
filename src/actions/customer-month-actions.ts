"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readCustomerMonthSales } from "@/lib/data-reads";
import type { CustomerMonthFilters, CustomerMonthRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerMonthSales(filters: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  const { profile } = await requireApproved();
  return readCustomerMonthSales(profile.company_id, filters);
}
