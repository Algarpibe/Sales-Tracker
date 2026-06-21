"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubItemSales } from "@/db/hub-item-sales";
import type { ItemSalesFilters, ItemSalesRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getItemSales(filters: ItemSalesFilters): Promise<ItemSalesRow[]> {
  await requireApproved();
  return getHubItemSales(filters);
}
