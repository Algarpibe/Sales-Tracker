"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";

export interface SavedViewDTO {
  id: string;
  name: string;
  state: unknown;
}

// Degrada con gracia (→ []) si la tabla aún no existe.
export async function getSavedViews(viewKey: string): Promise<SavedViewDTO[]> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ id: savedViews.id, name: savedViews.name, state: savedViews.state })
      .from(savedViews)
      .where(and(eq(savedViews.user_id, profile.id), eq(savedViews.view_key, viewKey)))
      .orderBy(savedViews.name);
    return rows.map((r) => ({ id: r.id, name: r.name, state: r.state }));
  } catch {
    return [];
  }
}

export async function saveView(viewKey: string, name: string, state: unknown): Promise<void> {
  const { profile } = await requireApproved();
  const trimmed = name.trim();
  if (!trimmed) return;
  await db
    .insert(savedViews)
    .values({ user_id: profile.id, view_key: viewKey, name: trimmed, state })
    .onConflictDoUpdate({
      target: [savedViews.user_id, savedViews.view_key, savedViews.name],
      set: { state },
    });
}

export async function deleteSavedView(id: string): Promise<void> {
  const { profile } = await requireApproved();
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.user_id, profile.id)));
}
