"use server";

import { revalidatePath } from "next/cache";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { categoryCreateSchema, categoryUpdateSchema, uuidSchema } from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";

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
}): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const data = categoryCreateSchema.parse(cat);

    await db.insert(categories).values({
      name: data.name,
      description: data.description,
      color: data.color,
      company_id: profile.company_id,
    });

    revalidatePath("/categories");
    revalidatePath("/sales");
  });
}

export async function updateCategory(
  id: string,
  updates: Partial<{ name: string; description: string; color: string; is_active: boolean }>
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const categoryId = uuidSchema.parse(id);
    const data = categoryUpdateSchema.parse(updates);

    await db
      .update(categories)
      .set(data)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.company_id, profile.company_id)
        )
      );

    revalidatePath("/categories");
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const categoryId = uuidSchema.parse(id);

    await db
      .update(categories)
      .set({ is_active: false })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.company_id, profile.company_id)
        )
      );

    revalidatePath("/categories");
  });
}
