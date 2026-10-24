"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readCategoryMonthSales } from "@/lib/data-reads";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

export async function getCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  const { profile } = await requireApproved();
  return readCategoryMonthSales(profile.company_id, f);
}
