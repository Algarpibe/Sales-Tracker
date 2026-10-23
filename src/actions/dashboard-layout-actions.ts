"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { parseDashboardLayout, type DashboardItem } from "@/lib/dashboard-layout";
import { DASHBOARD_LAYOUT_NAME, DASHBOARD_VIEW_KEY, readDashboardLayout } from "@/lib/data-reads";
import { runAction, type ActionResult } from "@/lib/errors";

const VIEW_KEY = DASHBOARD_VIEW_KEY;
const NAME = DASHBOARD_LAYOUT_NAME;

// null = el usuario no ha personalizado (el llamante usa DEFAULT_LAYOUT). La lectura
// vive en src/lib/data-reads.ts, compartida con GET /api/data/dashboard-layout.
export async function getDashboardLayout(): Promise<DashboardItem[] | null> {
  const { profile } = await requireApproved();
  return readDashboardLayout(profile.id);
}

export async function saveDashboardLayout(items: DashboardItem[]): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireApproved({ fresh: true });
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
  });
}

export async function resetDashboardLayout(): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireApproved({ fresh: true });
    await db.delete(savedViews).where(and(
      eq(savedViews.user_id, profile.id),
      eq(savedViews.view_key, VIEW_KEY),
      eq(savedViews.name, NAME),
    ));
  });
}
