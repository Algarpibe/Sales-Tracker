"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";

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

export async function toggleFavorite(customer: string): Promise<void> {
  const { profile } = await requireApproved();
  const cond = and(eq(favorites.user_id, profile.id), eq(favorites.customer_name, customer));
  const existing = await db.select({ id: favorites.id }).from(favorites).where(cond).limit(1);
  if (existing.length > 0) {
    await db.delete(favorites).where(cond);
  } else {
    await db.insert(favorites).values({ user_id: profile.id, customer_name: customer });
  }
}
