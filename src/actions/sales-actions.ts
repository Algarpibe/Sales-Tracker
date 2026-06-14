"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { salesRecords, categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { salesRecordSchema, uuidSchema } from "@/lib/validation";
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
