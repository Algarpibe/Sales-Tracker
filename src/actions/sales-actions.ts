"use server";

import { requireApproved } from "@/lib/auth/guards";
import { readSalesData } from "@/lib/data-reads";
import type { SalesFilters, SalesRecord } from "@/types/database";

// La lectura vive en src/lib/data-reads.ts, compartida con GET /api/data/sales
// (DATA-043): el cliente la pide por la ruta para que corra en paralelo.
export async function getSalesData(filters: SalesFilters): Promise<SalesRecord[]> {
  const { profile } = await requireApproved();
  return readSalesData(profile.company_id, filters);
}
