"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { savedViewKeySchema } from "@/lib/validation";

// Límites de payload (SEC-005): evita jsonb / nombres arbitrariamente grandes.
const MAX_VIEW_NAME_LEN = 120;
const MAX_VIEW_STATE_BYTES = 32_000;
// Tope de vistas por usuario y clave (SEC-036): es la lista que ve el usuario en el
// menú "Vistas" de cada tabla. El layout del dashboard vive en su propia clave y no
// consume este cupo.
const MAX_VIEWS_PER_KEY = 50;

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
  const key = savedViewKeySchema.safeParse(viewKey);
  if (!key.success) {
    throw new AppError(key.error.issues[0]?.message ?? "Clave de vista inválida", "VALIDATION");
  }
  const trimmed = name.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_VIEW_NAME_LEN) {
    throw new AppError(`El nombre de la vista es demasiado largo (máx. ${MAX_VIEW_NAME_LEN}).`, "VALIDATION");
  }
  if (JSON.stringify(state ?? null).length > MAX_VIEW_STATE_BYTES) {
    throw new AppError("La vista guardada es demasiado grande (máx. 32 KB).", "PAYLOAD_TOO_LARGE");
  }
  // Sobrescribir una vista existente siempre se permite; crear una nueva, solo por
  // debajo del tope. Cupo blando: dos altas simultáneas podrían pasarlo en una.
  const [{ total }] = await db
    .select({ total: count() })
    .from(savedViews)
    .where(and(
      eq(savedViews.user_id, profile.id),
      eq(savedViews.view_key, viewKey),
      ne(savedViews.name, trimmed),
    ));
  if (total >= MAX_VIEWS_PER_KEY) {
    throw new AppError(`Has alcanzado el máximo de ${MAX_VIEWS_PER_KEY} vistas guardadas.`, "LIMIT");
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
