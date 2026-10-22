"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCategoryMonthSales } from "@/db/hub-category-month-sales";
import { hubYearSchema } from "@/lib/validation";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

export async function getCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  await requireApproved();
  hubYearSchema.parse(f.anio);
  return getHubCategoryMonthSales(f);
}
