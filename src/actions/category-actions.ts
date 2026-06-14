"use server";

import { revalidatePath } from "next/cache";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";

export async function getCategories() {
  const { profile } = await requireApproved();
  if (!profile) throw new Error("No autenticado");

  const data = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.company_id, profile.company_id),
        eq(categories.is_active, true)
      )
    )
    .orderBy(asc(categories.sort_order), asc(categories.name));

  return data;
}

export async function createCategory(cat: {
  name: string;
  description?: string;
  color?: string;
}) {
  const { profile } = await requireRole("admin");
  if (!profile) {
    throw new Error("Solo administradores pueden gestionar categorías");
  }

  await db.insert(categories).values({
    name: cat.name,
    description: cat.description,
    color: cat.color,
    company_id: profile.company_id,
  });

  revalidatePath("/categories");
  revalidatePath("/sales");
}

export async function updateCategory(
  id: string,
  updates: Partial<{ name: string; description: string; color: string; is_active: boolean }>
) {
  const { profile } = await requireRole("admin");
  if (!profile) {
    throw new Error("Solo administradores pueden gestionar categorías");
  }

  await db
    .update(categories)
    .set(updates)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.company_id, profile.company_id)
      )
    );

  revalidatePath("/categories");
}

export async function deleteCategory(id: string) {
  const { profile } = await requireRole("admin");
  if (!profile) {
    throw new Error("Solo administradores pueden gestionar categorías");
  }

  await db
    .update(categories)
    .set({ is_active: false })
    .where(
      and(
        eq(categories.id, id),
        eq(categories.company_id, profile.company_id)
      )
    );

  revalidatePath("/categories");
}
