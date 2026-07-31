"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";

// Límites de payload (SEC-005): evita jsonb / nombres arbitrariamente grandes.
const MAX_VIEW_NAME_LEN = 120;
const MAX_VIEW_STATE_BYTES = 32_000;

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
  } catch (e) {
    // Degrada con gracia (→ []) si la tabla aún no existe, pero deja rastro del
    // fallo real en el logger (antes se tragaba en silencio — AI-012).
    logError("getSavedViews falló; degradando a []", e, { viewKey });
    return [];
  }
}

export async function saveView(viewKey: string, name: string, state: unknown): Promise<void> {
  const { profile } = await requireApproved();
  const trimmed = name.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_VIEW_NAME_LEN) {
    throw new AppError(`El nombre de la vista es demasiado largo (máx. ${MAX_VIEW_NAME_LEN}).`, "VALIDATION");
  }
  if (JSON.stringify(state ?? null).length > MAX_VIEW_STATE_BYTES) {
    throw new AppError("La vista guardada es demasiado grande (máx. 32 KB).", "PAYLOAD_TOO_LARGE");
  }
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
