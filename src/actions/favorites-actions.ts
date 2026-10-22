"use server";

import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { favoriteCustomerSchema } from "@/lib/validation";

// Tope de favoritos por usuario (SEC-036): acota lo que un usuario puede guardar.
const MAX_FAVORITES = 500;

// Devuelve los nombres de cliente favoritos del usuario. Degrada con gracia
// (→ []) si la tabla aún no existe (migración no aplicada) para no romper Clientes.
export async function getFavorites(): Promise<string[]> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ name: favorites.customer_name })
      .from(favorites)
      .where(eq(favorites.user_id, profile.id));
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

// Alta/baja sin carreras (DATA-050): en vez de leer y luego insertar o borrar, se
// intenta el INSERT con ON CONFLICT DO NOTHING (restricción única
// favorites_user_customer_unique) y, si no insertó nada, es que ya existía y se
// borra. Un doble clic ya no puede chocar con la restricción única.
export async function toggleFavorite(customer: string): Promise<void> {
  const { profile } = await requireApproved();
  const parsed = favoriteCustomerSchema.safeParse(customer);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Cliente inválido", "VALIDATION");
  }
  const [{ total }] = await db
    .select({ total: count() })
    .from(favorites)
    .where(eq(favorites.user_id, profile.id));
  if (total < MAX_FAVORITES) {
    const added = await db
      .insert(favorites)
      .values({ user_id: profile.id, customer_name: customer })
      .onConflictDoNothing({ target: [favorites.user_id, favorites.customer_name] })
      .returning({ id: favorites.id });
    if (added.length > 0) return;
  }
  // Ya era favorito (o se llegó al tope): se quita. Quitar siempre se permite.
  const removed = await db
    .delete(favorites)
    .where(and(eq(favorites.user_id, profile.id), eq(favorites.customer_name, customer)))
    .returning({ id: favorites.id });
  if (removed.length === 0 && total >= MAX_FAVORITES) {
    throw new AppError(`Has alcanzado el máximo de ${MAX_FAVORITES} clientes favoritos.`, "LIMIT");
  }
}
