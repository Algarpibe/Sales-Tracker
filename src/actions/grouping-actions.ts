"use server";

import { revalidatePath } from "next/cache";
import { eq, and, inArray, asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  categoryGroups,
  categoryGroupMappings,
  salesRecords,
} from "@/db/schema";
import { hubEnabled } from "@/db/hub";
import { getHubSalesRows } from "@/db/hub-sales";
import { requireRole, requireApproved } from "@/lib/auth/guards";
import { z } from "zod";
import type {
  CategoryGroup,
  RecordType,
  GroupingAnalysisResult,
  GroupingAnalysisRow,
} from "@/types/database";

// ─── Validación de entrada (F2-03) ───
const uuidSchema = z.string().uuid("ID inválido");
const groupNameSchema = z.string().trim().min(1, "El nombre es obligatorio").max(100);
const categoryIdsSchema = z.array(uuidSchema).max(500);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

// ─── Helpers ───
// getAdminProfile() → requireRole("admin"); getCompanyProfile() → requireApproved().
// Both return a profile that always has a company_id (every query is scoped by it).

async function getAdminProfile() {
  const { user, profile } = await requireRole("admin");
  if (!profile?.company_id) throw new Error("Perfil sin empresa asignada");
  return { profile, userId: user.id };
}

async function getCompanyProfile() {
  const { user, profile } = await requireApproved();
  if (!profile?.company_id) throw new Error("Perfil sin empresa asignada");
  return { profile, userId: user.id };
}

// ─── CRUD ───

export async function saveCategoryGrouping(
  groupName: string,
  categoryIds: string[],
  color: string = "#6366f1"
): Promise<{ success: boolean; groupId?: string }> {
  const { profile } = await getAdminProfile();
  const companyId = profile.company_id!;

  const name = groupNameSchema.parse(groupName);
  const catIds = categoryIdsSchema.parse(categoryIds);
  const col = hexColorSchema.parse(color);

  const groupId = await db.transaction(async (tx) => {
    // Get max sort_order
    const [maxOrder] = await tx
      .select({ sort_order: categoryGroups.sort_order })
      .from(categoryGroups)
      .where(eq(categoryGroups.company_id, companyId))
      .orderBy(desc(categoryGroups.sort_order))
      .limit(1);

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    // Insert group
    const [group] = await tx
      .insert(categoryGroups)
      .values({
        name,
        color: col,
        sort_order: nextOrder,
        company_id: companyId,
      })
      .returning({ id: categoryGroups.id });

    // Insert mappings
    if (catIds.length > 0) {
      await tx.insert(categoryGroupMappings).values(
        catIds.map((catId) => ({
          group_id: group.id,
          category_id: catId,
          company_id: companyId,
        }))
      );
    }

    return group.id;
  });

  revalidatePath("/analytics");
  return { success: true, groupId };
}

export async function getSavedCategoryGroupings(): Promise<{
  groups: CategoryGroup[];
  success: boolean;
}> {
  const { profile } = await getCompanyProfile();
  const companyId = profile.company_id!;

  // 1. Fetch groups for this company
  const groupRows = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.company_id, companyId))
    .orderBy(asc(categoryGroups.sort_order));

  if (groupRows.length === 0) {
    return { groups: [], success: true };
  }

  // 2. Fetch all mappings for those groups (scoped by company too)
  const groupIds = groupRows.map((g) => g.id);
  const mappingRows = await db
    .select({
      id: categoryGroupMappings.id,
      group_id: categoryGroupMappings.group_id,
      category_id: categoryGroupMappings.category_id,
      company_id: categoryGroupMappings.company_id,
    })
    .from(categoryGroupMappings)
    .where(
      and(
        eq(categoryGroupMappings.company_id, companyId),
        inArray(categoryGroupMappings.group_id, groupIds)
      )
    );

  // 3. Assemble: embed mappings under each group
  const mappingsByGroup = new Map<string, typeof mappingRows>();
  for (const m of mappingRows) {
    const list = mappingsByGroup.get(m.group_id) ?? [];
    list.push(m);
    mappingsByGroup.set(m.group_id, list);
  }

  const groups: CategoryGroup[] = groupRows.map((g) => ({
    ...g,
    created_at: g.created_at as unknown as string,
    updated_at: g.updated_at as unknown as string,
    mappings: mappingsByGroup.get(g.id) ?? [],
  }));

  return { groups, success: true };
}

export async function updateCategoryGrouping(
  groupId: string,
  groupName: string,
  categoryIds: string[],
  color?: string
): Promise<{ success: boolean }> {
  const { profile } = await getAdminProfile();
  const companyId = profile.company_id!;

  const gid = uuidSchema.parse(groupId);
  const name = groupNameSchema.parse(groupName);
  const catIds = categoryIdsSchema.parse(categoryIds);
  const col = color === undefined ? undefined : hexColorSchema.parse(color);

  await db.transaction(async (tx) => {
    // Update name and color (scoped by company)
    await tx
      .update(categoryGroups)
      .set({
        name,
        color: col,
        updated_at: new Date().toISOString(),
      })
      .where(
        and(
          eq(categoryGroups.id, gid),
          eq(categoryGroups.company_id, companyId)
        )
      );

    // Replace mappings: delete old, insert new (scoped by company)
    await tx
      .delete(categoryGroupMappings)
      .where(
        and(
          eq(categoryGroupMappings.group_id, gid),
          eq(categoryGroupMappings.company_id, companyId)
        )
      );

    if (catIds.length > 0) {
      await tx.insert(categoryGroupMappings).values(
        catIds.map((catId) => ({
          group_id: gid,
          category_id: catId,
          company_id: companyId,
        }))
      );
    }
  });

  revalidatePath("/analytics");
  return { success: true };
}

export async function deleteCategoryGrouping(
  groupId: string
): Promise<{ success: boolean }> {
  const { profile } = await getAdminProfile();
  const companyId = profile.company_id!;

  const gid = uuidSchema.parse(groupId);

  // Mappings are removed by ON DELETE CASCADE on group_id.
  await db
    .delete(categoryGroups)
    .where(
      and(
        eq(categoryGroups.id, gid),
        eq(categoryGroups.company_id, companyId)
      )
    );

  revalidatePath("/analytics");
  return { success: true };
}

/**
 * Reorders groups by updating their sort_order
 */
export async function reorderCategoryGroupings(
  orderedIds: string[]
): Promise<{ success: boolean }> {
  const { profile } = await getAdminProfile();
  const companyId = profile.company_id!;

  const ids = z.array(uuidSchema).max(500).parse(orderedIds);

  await db.transaction(async (tx) => {
    for (let index = 0; index < ids.length; index++) {
      await tx
        .update(categoryGroups)
        .set({ sort_order: index + 1 })
        .where(
          and(
            eq(categoryGroups.id, ids[index]),
            eq(categoryGroups.company_id, companyId)
          )
        );
    }
  });

  revalidatePath("/analytics");
  return { success: true };
}

// ─── Analysis Data Processing ───

export async function getGroupingAnalysisData(
  recordType: RecordType
): Promise<GroupingAnalysisResult> {
  const { profile } = await getCompanyProfile();
  const companyId = profile.company_id!;

  // 1. Fetch all groups for this company
  const groups = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.company_id, companyId))
    .orderBy(asc(categoryGroups.sort_order));

  if (groups.length === 0) {
    return { rows: [], years: [], yearTotals: {} };
  }

  // 1b. Mappings y registros son independientes entre sí → en paralelo.
  // (Se eliminó la consulta de colores de categoría: catColorMap era código muerto,
  //  el color de cada fila sale del color del grupo.)
  const groupIds = groups.map((g) => g.id);

  type AnalysisRecord = {
    category_id: string;
    record_year: number;
    record_month: number;
    amount_usd: number;
  };

  // Los registros vienen del hub en vivo (si HUB_DB_URL está) o de sales_records.
  const recordsP: Promise<AnalysisRecord[]> = hubEnabled()
    ? (async () => {
        const [hubRows, cats] = await Promise.all([
          getHubSalesRows(),
          db
            .select({ id: categories.id, name: categories.name })
            .from(categories)
            .where(eq(categories.company_id, companyId)),
        ]);
        const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
        return hubRows
          .filter((r) => r.record_type === recordType)
          .map((r) => ({
            category_id: byName.get(r.category_name.toLowerCase()) ?? "",
            record_year: r.record_year,
            record_month: r.record_month,
            amount_usd: r.amount_usd,
          }))
          .filter((r) => r.category_id !== "");
      })()
    : db
        .select({
          category_id: salesRecords.category_id,
          record_year: salesRecords.record_year,
          record_month: salesRecords.record_month,
          amount_usd: salesRecords.amount_usd,
        })
        .from(salesRecords)
        .where(
          and(
            eq(salesRecords.company_id, companyId),
            eq(salesRecords.record_type, recordType)
          )
        ) as unknown as Promise<AnalysisRecord[]>;

  const [mappings, records] = await Promise.all([
    db
      .select({
        group_id: categoryGroupMappings.group_id,
        category_id: categoryGroupMappings.category_id,
      })
      .from(categoryGroupMappings)
      .where(
        and(
          eq(categoryGroupMappings.company_id, companyId),
          inArray(categoryGroupMappings.group_id, groupIds)
        )
      ),
    recordsP,
  ]);

  // Build mapping: categoryId → groupId
  const catToGroup = new Map<string, string>();
  for (const m of mappings) {
    catToGroup.set(String(m.category_id), m.group_id);
  }

  // Assign the saved color to each group
  const groupColors = new Map<string, string>();
  for (const g of groups) {
    groupColors.set(g.id, g.color || "#6366f1");
  }

  // 4. Aggregate: group → year → sum
  const yearsSet = new Set<number>();
  const groupYearSums: Record<string, Record<number, number>> = {};
  const groupMonthSums: Record<string, Record<number, Record<number, number>>> = {}; // group -> year -> month -> amount
  const yearTotals: Record<number, number> = {};

  // Initialize group accumulators
  for (const g of groups) {
    groupYearSums[g.id] = {};
    groupMonthSums[g.id] = {};
  }

  for (const r of records) {
    const catId = String(r.category_id);
    const year = Number(r.record_year);
    const month = Number(r.record_month);
    const amount = Number(r.amount_usd) || 0; // NUMERIC → Number
    const groupId = catToGroup.get(catId);

    yearsSet.add(year);
    yearTotals[year] = (yearTotals[year] || 0) + amount;

    if (groupId && groupYearSums[groupId]) {
      groupYearSums[groupId][year] = (groupYearSums[groupId][year] || 0) + amount;

      // Monthly aggregation
      if (!groupMonthSums[groupId][year]) groupMonthSums[groupId][year] = {};
      groupMonthSums[groupId][year][month] =
        (groupMonthSums[groupId][year][month] || 0) + amount;
    }
  }

  const years = Array.from(yearsSet).sort((a, b) => a - b);

  // 5. Build result rows with percentages and averages
  const rows: GroupingAnalysisRow[] = groups.map((g) => {
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

    const totalOfAllYearTotals = years.reduce(
      (acc, y) => acc + (yearTotals[y] || 0),
      0
    );
    const avgAmount = yearCount > 0 ? totalAmount / yearCount : 0;
    const avgPercentage =
      totalOfAllYearTotals > 0 ? (totalAmount / totalOfAllYearTotals) * 100 : 0;

    return {
      groupId: g.id,
      groupName: g.name,
      color: groupColors.get(g.id) || "#6366f1",
      years: yearData,
      months: groupMonthSums[g.id] || {},
      average: { amount: avgAmount, percentage: avgPercentage },
    };
  });

  return { rows, years, yearTotals };
}
