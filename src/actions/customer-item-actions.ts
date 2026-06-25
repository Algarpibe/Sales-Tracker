"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerItemSales } from "@/db/hub-customer-item-sales";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerItemSales(filters: CustomerItemFilters): Promise<CustomerItemRow[]> {
  await requireApproved();
  return getHubCustomerItemSales(filters);
}
