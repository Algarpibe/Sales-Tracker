"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubMarginByYear, getHubMarginByItem, getHubMarginByCustomer } from "@/db/hub-margin";
import type {
  MarginByYearFilters, MarginFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

export async function getMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  await requireApproved();
  return getHubMarginByYear(f);
}

export async function getMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  await requireApproved();
  return getHubMarginByItem(f);
}

export async function getMarginByCustomer(f: MarginFilters): Promise<MarginCustomerRow[]> {
  await requireApproved();
  return getHubMarginByCustomer(f);
}
