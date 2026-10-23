"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readCategoryMonthSales } from "@/lib/data-reads";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

export async function getCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  await requireApproved();
  return readCategoryMonthSales(f);
}
