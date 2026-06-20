"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { salesRecords, categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { salesRecordSchema, uuidSchema } from "@/lib/validation";
import { hubEnabled } from "@/db/hub";
import { getHubSalesRows } from "@/db/hub-sales";
import type {
  SalesFilters,
  RecordType,
  SalesRecord,
  MonthlyTotal,
  AnnualByCategory,
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

  return rows.map((row) => ({
    ...row.record,
    amount_usd: Number(row.record.amount_usd),
    categories: {
      name: row.category_name ?? "",
      color: row.category_color ?? "",
    },
  })) as SalesRecord[];
}

export async function upsertSalesRecord(record: {
  category_id: string;
  record_type: RecordType;
  amount_usd: number;
  record_month: number;
  record_year: number;
  notes?: string;
}) {
  const { user, profile } = await requireRole("admin", "editor");
  const data = salesRecordSchema.parse(record);

  await db
    .insert(salesRecords)
    .values({
      category_id: data.category_id,
      record_type: data.record_type,
      amount_usd: String(data.amount_usd),
      record_month: data.record_month,
      record_year: data.record_year,
      notes: data.notes,
      company_id: profile.company_id,
      created_by: user.id,
      updated_by: user.id,
    })
    .onConflictDoUpdate({
      target: [
        salesRecords.company_id,
        salesRecords.category_id,
        salesRecords.record_type,
        salesRecords.record_month,
        salesRecords.record_year,
      ],
      set: {
        amount_usd: String(data.amount_usd),
        notes: data.notes,
        updated_by: user.id,
        updated_at: sql`now()`,
      },
    });

  revalidatePath("/tablas");
  revalidatePath("/sales");
  revalidatePath("/home");
  revalidatePath("/analytics");
}

// Importación masiva: un único INSERT ... ON CONFLICT DO UPDATE para todas las
// filas, con una sola verificación de permisos (antes era 1 petición por fila).
export async function bulkUpsertSalesRecords(
  records: Array<{
    category_id: string;
    record_type: RecordType;
    amount_usd: number;
    record_month: number;
    record_year: number;
    notes?: string;
  }>
): Promise<{ imported: number; invalid: number }> {
  const { user, profile } = await requireRole("admin", "editor");

  if (records.length > 5000) throw new Error("Demasiados registros (máx 5000 por importación)");

  // Validación fila a fila: importa las válidas y cuenta las inválidas
  // (año/mes/monto fuera de rango) en vez de fallar toda la importación.
  const parsed: z.infer<typeof salesRecordSchema>[] = [];
  let invalid = 0;
  for (const r of records) {
    const res = salesRecordSchema.safeParse(r);
    if (res.success) parsed.push(res.data);
    else invalid++;
  }

  if (parsed.length === 0) return { imported: 0, invalid };

  await db
    .insert(salesRecords)
    .values(
      parsed.map((r) => ({
        category_id: r.category_id,
        record_type: r.record_type,
        amount_usd: String(r.amount_usd),
        record_month: r.record_month,
        record_year: r.record_year,
        notes: r.notes,
        company_id: profile.company_id,
        created_by: user.id,
        updated_by: user.id,
      }))
    )
    .onConflictDoUpdate({
      target: [
        salesRecords.company_id,
        salesRecords.category_id,
        salesRecords.record_type,
        salesRecords.record_month,
        salesRecords.record_year,
      ],
      set: {
        amount_usd: sql`excluded.amount_usd`,
        notes: sql`excluded.notes`,
        updated_by: sql`excluded.updated_by`,
        updated_at: sql`now()`,
      },
    });

  revalidatePath("/tablas");
  revalidatePath("/sales");
  revalidatePath("/home");
  revalidatePath("/analytics");
  return { imported: parsed.length, invalid };
}

export async function deleteSalesRecord(id: string) {
  const { profile } = await requireRole("admin", "editor");
  const recordId = uuidSchema.parse(id);

  await db
    .delete(salesRecords)
    .where(
      and(
        eq(salesRecords.id, recordId),
        eq(salesRecords.company_id, profile.company_id)
      )
    );

  revalidatePath("/sales");
  revalidatePath("/home");
}

export async function getMonthlyTotals(year?: number): Promise<MonthlyTotal[]> {
  const { profile } = await requireApproved();
  if (!profile) throw new Error("No autenticado");

  if (hubEnabled()) {
    const hubRows = await getHubSalesRows();
    const agg = new Map<string, MonthlyTotal>();
    for (const r of hubRows) {
      if (r.record_type === "BACKLOG") continue;
      if (year && r.record_year !== year) continue;
      const k = `${r.record_type}:${r.record_year}:${r.record_month}`;
      const e =
        agg.get(k) ??
        { company_id: profile.company_id, record_type: r.record_type as RecordType, record_year: r.record_year, record_month: r.record_month, total_usd: 0 };
      e.total_usd += r.amount_usd;
      agg.set(k, e);
    }
    return Array.from(agg.values()).sort(
      (a, b) => a.record_year - b.record_year || a.record_month - b.record_month
    );
  }

  const cid = profile.company_id;
  const { rows } = year
    ? await db.execute(
        sql`SELECT company_id, record_type, record_year, record_month, total_usd
            FROM v_monthly_totals
            WHERE company_id = ${cid} AND record_year = ${year}
            ORDER BY record_year, record_month`
      )
    : await db.execute(
        sql`SELECT company_id, record_type, record_year, record_month, total_usd
            FROM v_monthly_totals
            WHERE company_id = ${cid}
            ORDER BY record_year, record_month`
      );

  return rows.map((r) => ({
    company_id: r.company_id as string,
    record_type: r.record_type as RecordType,
    record_year: Number(r.record_year),
    record_month: Number(r.record_month),
    total_usd: Number(r.total_usd),
  }));
}

export async function getAnnualByCategory(year?: number): Promise<AnnualByCategory[]> {
  const { profile } = await requireApproved();
  if (!profile) throw new Error("No autenticado");

  if (hubEnabled()) {
    const [hubRows, cats] = await Promise.all([
      getHubSalesRows(),
      db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.company_id, profile.company_id)),
    ]);
    const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const agg = new Map<string, AnnualByCategory>();
    for (const r of hubRows) {
      if (r.record_type === "BACKLOG") continue;
      if (year && r.record_year !== year) continue;
      const cat = byName.get(r.category_name.toLowerCase());
      if (!cat) continue;
      const k = `${r.record_type}:${r.record_year}:${cat.id}`;
      const e =
        agg.get(k) ??
        { company_id: profile.company_id, record_type: r.record_type as RecordType, record_year: r.record_year, category_id: cat.id, category_name: cat.name, total_usd: 0 };
      e.total_usd += r.amount_usd;
      agg.set(k, e);
    }
    return Array.from(agg.values()).sort((a, b) => b.total_usd - a.total_usd);
  }

  const cid = profile.company_id;
  const { rows } = year
    ? await db.execute(
        sql`SELECT company_id, record_type, record_year, category_id, category_name, total_usd
            FROM v_annual_by_category
            WHERE company_id = ${cid} AND record_year = ${year}
            ORDER BY total_usd DESC`
      )
    : await db.execute(
        sql`SELECT company_id, record_type, record_year, category_id, category_name, total_usd
            FROM v_annual_by_category
            WHERE company_id = ${cid}
            ORDER BY total_usd DESC`
      );

  return rows.map((r) => ({
    company_id: r.company_id as string,
    record_type: r.record_type as RecordType,
    record_year: Number(r.record_year),
    category_id: r.category_id as string,
    category_name: r.category_name as string,
    total_usd: Number(r.total_usd),
  }));
}
