"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SalesFilters, RecordType } from "@/types/database";

export async function getSalesData(filters: SalesFilters) {
  const supabase = await createClient();

  let query = supabase
    .from("sales_records")
    .select("*, categories(name, color)")
    .order("record_year", { ascending: false })
    .order("record_month", { ascending: true });

  if (filters.year) query = query.eq("record_year", filters.year);
  if (filters.month) query = query.eq("record_month", filters.month);
  if (filters.category_id) query = query.eq("category_id", filters.category_id);
  if (filters.record_type) query = query.eq("record_type", filters.record_type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertSalesRecord(record: {
  category_id: string;
  record_type: RecordType;
  amount_usd: number;
  record_month: number;
  record_year: number;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "editor"].includes(profile.role)) {
    throw new Error("Sin permisos para esta acción");
  }

  console.log("Upserting record:", { ...record, company_id: profile.company_id });

  const { data, error } = await supabase.from("sales_records").upsert(
    {
      ...record,
      company_id: profile.company_id,
      created_by: user.id,
      updated_by: user.id,
    },
    {
      onConflict: "company_id,category_id,record_type,record_month,record_year",
    }
  ).select();

  if (error) {
    console.error("Supabase Upsert Error:", error);
    throw new Error(`DB Error: ${error.message} (${error.code})`);
  }
  
  console.log("Upsert Success:", data?.[0]?.id);
  revalidatePath("/tablas");
  revalidatePath("/sales");
  revalidatePath("/home");
  revalidatePath("/analytics");
}

export async function deleteSalesRecord(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/home");
}

export async function getMonthlyTotals(year?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("v_monthly_totals")
    .select("*")
    .order("record_year")
    .order("record_month");

  if (year) query = query.eq("record_year", year);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getAnnualByCategory(year?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("v_annual_by_category")
    .select("*")
    .order("total_usd", { ascending: false });

  if (year) query = query.eq("record_year", year);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
