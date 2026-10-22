"use server";

import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { salesRecords, categories } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { hubEnabled } from "@/db/hub";
import { getHubSalesRows } from "@/db/hub-sales";
import { logWarn } from "@/lib/logger";

// F3-06: vigilar el tamaño del payload de getSalesData (callers como analytics piden
// todo el histórico). No se capa (los charts multi-año lo necesitan); se registra un
// aviso si supera el umbral para detectar crecimiento.
const SALES_PAYLOAD_WARN_THRESHOLD = 5000;
function warnIfLargeSalesPayload(count: number, filters: SalesFilters) {
  if (count > SALES_PAYLOAD_WARN_THRESHOLD) {
    logWarn("getSalesData payload grande", {
      count,
      threshold: SALES_PAYLOAD_WARN_THRESHOLD,
      filters,
    });
  }
}

import type {
  SalesFilters,
  SalesRecord,
} from "@/types/database";

export async function getSalesData(filters: SalesFilters): Promise<SalesRecord[]> {
  const { profile } = await requireApproved();
  if (!profile) throw new Error("No autenticado");

  // --- Lectura directa del zoho-hub (si HUB_DB_URL está configurado) ---
  // Agrega en vivo desde el hub y mapea por NOMBRE de categoría a las categorías
  // de la app. Mismo resultado que sales_records (validado al céntimo) pero en
  // tiempo real. Si HUB_DB_URL no está → fallback a sales_records (abajo).
  if (hubEnabled()) {
    const [hubRows, cats] = await Promise.all([
      getHubSalesRows(),
      db
        .select({ id: categories.id, name: categories.name, color: categories.color })
        .from(categories)
        .where(eq(categories.company_id, profile.company_id)),
    ]);
    const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const out: SalesRecord[] = [];
    for (const r of hubRows) {
      const cat = byName.get(r.category_name.toLowerCase());
      if (!cat) continue; // categoría del hub que no existe en la app (igual que el transform)
      if (filters.year && r.record_year !== filters.year) continue;
      if (filters.month && r.record_month !== filters.month) continue;
      if (filters.record_type && r.record_type !== filters.record_type) continue;
      if (filters.category_id && cat.id !== filters.category_id) continue;
      out.push({
        id: `${cat.id}:${r.record_type}:${r.record_year}:${r.record_month}`,
        company_id: profile.company_id,
        category_id: cat.id,
        record_type: r.record_type,
        amount_usd: r.amount_usd,
        record_month: r.record_month,
        record_year: r.record_year,
        notes: null,
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
        categories: { name: cat.name, color: cat.color ?? "" },
      } as unknown as SalesRecord);
    }
    warnIfLargeSalesPayload(out.length, filters);
    return out;
  }

  // --- Fallback: sales_records (poblado por el transform de n8n) ---
  const conditions = [eq(salesRecords.company_id, profile.company_id)];
  if (filters.year) conditions.push(eq(salesRecords.record_year, filters.year));
  if (filters.month) conditions.push(eq(salesRecords.record_month, filters.month));
  if (filters.category_id) conditions.push(eq(salesRecords.category_id, filters.category_id));
  if (filters.record_type) conditions.push(eq(salesRecords.record_type, filters.record_type));

  const rows = await db
    .select({
      record: salesRecords,
      category_name: categories.name,
      category_color: categories.color,
    })
    .from(salesRecords)
    .leftJoin(categories, eq(salesRecords.category_id, categories.id))
    .where(and(...conditions))
    .orderBy(desc(salesRecords.record_year), asc(salesRecords.record_month));

  const result = rows.map((row) => ({
    ...row.record,
    amount_usd: Number(row.record.amount_usd),
    categories: {
      name: row.category_name ?? "",
      color: row.category_color ?? "",
    },
  })) as SalesRecord[];
  warnIfLargeSalesPayload(result.length, filters);
  return result;
}
