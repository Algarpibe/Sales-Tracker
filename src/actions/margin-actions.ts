"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readMarginByCustomer, readMarginByItem, readMarginByYear } from "@/lib/data-reads";
import type {
  MarginByYearFilters, MarginFilters, MarginCustomerFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

export async function getMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  await requireApproved();
  return readMarginByYear(f);
}

export async function getMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  await requireApproved();
  return readMarginByItem(f);
}

export async function getMarginByCustomer(f: MarginCustomerFilters): Promise<MarginCustomerRow[]> {
  await requireApproved();
  return readMarginByCustomer(f);
}
