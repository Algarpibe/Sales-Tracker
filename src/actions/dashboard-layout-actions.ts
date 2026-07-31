"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { parseDashboardLayout, type DashboardItem } from "@/lib/dashboard-layout";

const VIEW_KEY = "dashboard";
const NAME = "layout";

// null = el usuario no ha personalizado (el llamante usa DEFAULT_LAYOUT).
export async function getDashboardLayout(): Promise<DashboardItem[] | null> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ state: savedViews.state })
      .from(savedViews)
      .where(and(
        eq(savedViews.user_id, profile.id),
        eq(savedViews.view_key, VIEW_KEY),
        eq(savedViews.name, NAME),
      ))
      .limit(1);
    if (rows.length === 0) return null;
    return parseDashboardLayout(rows[0].state);
  } catch {
    return null;
  }
}

export async function saveDashboardLayout(items: DashboardItem[]): Promise<void> {
  const { profile } = await requireApproved();
  // Los tipos de TS no existen en runtime y esto es un endpoint HTTP: se valida y
  // normaliza lo que se persiste (descarta ids desconocidos, acota el jsonb).
  const safe = parseDashboardLayout({ items });
  if (!safe) return;
  const state = { items: safe };
  await db
    .insert(savedViews)
    .values({ user_id: profile.id, view_key: VIEW_KEY, name: NAME, state })
    .onConflictDoUpdate({
      target: [savedViews.user_id, savedViews.view_key, savedViews.name],
      set: { state },
    });
}

export async function resetDashboardLayout(): Promise<void> {
  const { profile } = await requireApproved();
  await db.delete(savedViews).where(and(
    eq(savedViews.user_id, profile.id),
    eq(savedViews.view_key, VIEW_KEY),
    eq(savedViews.name, NAME),
  ));
}
