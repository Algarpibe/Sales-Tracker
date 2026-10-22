"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerMonthSales } from "@/db/hub-customer-month-sales";
import { hubYearSchema } from "@/lib/validation";
import type { CustomerMonthFilters, CustomerMonthRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerMonthSales(filters: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  await requireApproved();
  hubYearSchema.parse(filters.anio);
  return getHubCustomerMonthSales(filters);
}
