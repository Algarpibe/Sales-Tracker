"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  CategoryGroup,
  RecordType,
  GroupingAnalysisResult,
  GroupingAnalysisRow,
} from "@/types/database";

// ─── Helpers ───

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new Error("Solo administradores pueden gestionar agrupaciones");
  }

  return { supabase, profile, userId: user.id };
}

async function getCompanyProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("Perfil no encontrado");
  return { supabase, profile, userId: user.id };
}

// ─── CRUD ───

export async function saveCategoryGrouping(
  groupName: string,
  categoryIds: string[],
  color: string = "#6366f1"
): Promise<{ success: boolean; groupId?: string }> {
  const { supabase, profile } = await getAdminProfile();

  // Get max sort_order
  const { data: maxOrder } = await supabase
    .from("category_groups")
    .select("sort_order")
    .eq("company_id", profile.company_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrder?.sort_order || 0) + 1;

  // Insert group
  const { data: group, error: groupError } = await supabase
    .from("category_groups")
    .insert({
      name: groupName.trim(),
      color: color,
      sort_order: nextOrder,
      company_id: profile.company_id,
    })
    .select("id")
    .single();

  if (groupError) throw new Error(groupError.message);

  // Insert mappings
  if (categoryIds.length > 0) {
    const mappings = categoryIds.map((catId) => ({
      group_id: group.id,
      category_id: catId,
      company_id: profile.company_id,
    }));

    const { error: mapError } = await supabase
      .from("category_group_mappings")
      .insert(mappings);

    if (mapError) throw new Error(mapError.message);
  }

  revalidatePath("/analytics");
  return { success: true, groupId: group.id };
}

export async function getSavedCategoryGroupings(): Promise<{
  groups: CategoryGroup[];
  success: boolean;
}> {
  const { supabase, profile } = await getCompanyProfile();

  const { data, error } = await supabase
    .from("category_groups")
    .select("*, category_group_mappings(id, group_id, category_id, company_id)")
    .eq("company_id", profile.company_id)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  // Map the nested join to the expected shape
  const groups: CategoryGroup[] = (data || []).map((g: any) => ({
    ...g,
    mappings: g.category_group_mappings || [],
  }));

  return { groups, success: true };
}

export async function updateCategoryGrouping(
  groupId: string,
  groupName: string,
  categoryIds: string[],
  color?: string
): Promise<{ success: boolean }> {
  const { supabase, profile } = await getAdminProfile();

  // Update name and color
  const { error: updateError } = await supabase
    .from("category_groups")
    .update({ 
      name: groupName.trim(), 
      color: color,
      updated_at: new Date().toISOString() 
    })
    .eq("id", groupId)
    .eq("company_id", profile.company_id);

  if (updateError) throw new Error(updateError.message);

  // Replace mappings: delete old, insert new
  const { error: deleteError } = await supabase
    .from("category_group_mappings")
    .delete()
    .eq("group_id", groupId);

  if (deleteError) throw new Error(deleteError.message);

  if (categoryIds.length > 0) {
    const mappings = categoryIds.map((catId) => ({
      group_id: groupId,
      category_id: catId,
      company_id: profile.company_id,
    }));

    const { error: mapError } = await supabase
      .from("category_group_mappings")
      .insert(mappings);

    if (mapError) throw new Error(mapError.message);
  }

  revalidatePath("/analytics");
  return { success: true };
}

export async function deleteCategoryGrouping(
  groupId: string
): Promise<{ success: boolean }> {
  const { supabase, profile } = await getAdminProfile();

  const { error } = await supabase
    .from("category_groups")
    .delete()
    .eq("id", groupId)
    .eq("company_id", profile.company_id);

  if (error) throw new Error(error.message);

  revalidatePath("/analytics");
  return { success: true };
}

/**
 * Reorders groups by updating their sort_order
 */
export async function reorderCategoryGroupings(
  orderedIds: string[]
): Promise<{ success: boolean }> {
  const { supabase, profile } = await getAdminProfile();

  // Perform updates in parallel
  const updates = orderedIds.map((id, index) => 
    supabase
      .from("category_groups")
      .update({ sort_order: index + 1 })
      .eq("id", id)
      .eq("company_id", profile.company_id)
  );

  await Promise.all(updates);

  revalidatePath("/analytics");
  return { success: true };
}

// ─── Analysis Data Processing ───

export async function getGroupingAnalysisData(
  recordType: RecordType
): Promise<GroupingAnalysisResult> {
  const { supabase, profile } = await getCompanyProfile();

  // 1. Fetch all groups + mappings for this company
  const { data: groups, error: groupsError } = await supabase
    .from("category_groups")
    .select(`
      *,
      mappings: category_group_mappings(*)
    `)
    .eq("company_id", profile.company_id)
    .order("sort_order", { ascending: true });

  if (groupsError) throw new Error(groupsError.message);
  if (!groups || groups.length === 0) {
    return { rows: [], years: [], yearTotals: {} };
  }

  // Build mapping: categoryId → groupId
  const catToGroup = new Map<string, string>();
  const groupMap = new Map<string, { name: string }>();

  (groups as any[]).forEach((g) => {
    groupMap.set(g.id, { name: g.name });
    (g.mappings || []).forEach((m: any) => {
      catToGroup.set(String(m.category_id), g.id);
    });
  });

  // 2. Fetch category colors
  const { data: categories } = await supabase
    .from("categories")
    .select("id, color")
    .eq("company_id", profile.company_id);

  const catColorMap = new Map<string, string>();
  (categories || []).forEach((c: any) => {
    catColorMap.set(String(c.id), c.color || "#6366f1");
  });

  // Assign the saved color to each group
  const groupColors = new Map<string, string>();
  (groups as any[]).forEach((g) => {
    groupColors.set(g.id, g.color || "#6366f1");
  });

  // 3. Fetch all sales records for the company and record type
  const { data: records, error: recordsError } = await supabase
    .from("sales_records")
    .select("category_id, record_year, amount_usd")
    .eq("record_type", recordType);

  if (recordsError) throw new Error(recordsError.message);

  // 4. Aggregate: group → year → sum
  const yearsSet = new Set<number>();
  const groupYearSums: Record<string, Record<number, number>> = {};
  const yearTotals: Record<number, number> = {};

  // Initialize group accumulators
  (groups as any[]).forEach((g) => {
    groupYearSums[g.id] = {};
  });

  (records || []).forEach((r: any) => {
    const catId = String(r.category_id);
    const year = Number(r.record_year);
    const amount = Number(r.amount_usd) || 0;
    const groupId = catToGroup.get(catId);

    yearsSet.add(year);
    yearTotals[year] = (yearTotals[year] || 0) + amount;

    if (groupId && groupYearSums[groupId]) {
      groupYearSums[groupId][year] = (groupYearSums[groupId][year] || 0) + amount;
    }
  });

  const years = Array.from(yearsSet).sort((a, b) => a - b);

  // 5. Build result rows with percentages and averages
  const rows: GroupingAnalysisRow[] = (groups as any[]).map((g) => {
    const sums = groupYearSums[g.id] || {};
    const yearData: Record<number, { amount: number; percentage: number }> = {};
    let totalAmount = 0;
    let totalPercentage = 0;
    let yearCount = 0;

    years.forEach((y) => {
      const amount = sums[y] || 0;
      const grandTotal = yearTotals[y] || 1;
      const percentage = grandTotal > 0 ? (amount / grandTotal) * 100 : 0;
      yearData[y] = { amount, percentage };
      totalAmount += amount;
      totalPercentage += percentage;
      yearCount++;
    });

    const totalOfAllYearTotals = years.reduce((acc, y) => acc + (yearTotals[y] || 0), 0);
    const avgAmount = yearCount > 0 ? totalAmount / yearCount : 0;
    const avgPercentage = totalOfAllYearTotals > 0 ? (totalAmount / totalOfAllYearTotals) * 100 : 0;

    return {
      groupId: g.id,
      groupName: g.name,
      color: groupColors.get(g.id) || "#6366f1",
      years: yearData,
      average: { amount: avgAmount, percentage: avgPercentage },
    };
  });

  return { rows, years, yearTotals };
}
