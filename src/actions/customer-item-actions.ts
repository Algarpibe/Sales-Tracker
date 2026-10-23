"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readCustomerItemSales } from "@/lib/data-reads";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerItemSales(filters: CustomerItemFilters): Promise<CustomerItemRow[]> {
  await requireApproved();
  return readCustomerItemSales(filters);
}
