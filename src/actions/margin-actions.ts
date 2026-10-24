"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readMarginByCustomer, readMarginByItem, readMarginByYear } from "@/lib/data-reads";
import type {
  MarginByYearFilters, MarginFilters, MarginCustomerFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

export async function getMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  const { profile } = await requireApproved();
  return readMarginByYear(profile.company_id, f);
}

export async function getMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  const { profile } = await requireApproved();
  return readMarginByItem(profile.company_id, f);
}

export async function getMarginByCustomer(f: MarginCustomerFilters): Promise<MarginCustomerRow[]> {
  const { profile } = await requireApproved();
  return readMarginByCustomer(profile.company_id, f);
}
