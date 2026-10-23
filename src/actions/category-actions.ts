"use server";

import { revalidatePath } from "next/cache";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { readCategories, readMacroCategorias, readTechServiceCategories } from "@/lib/data-reads";
import { ROLES_EDITAN_METAS } from "@/lib/commercial-kpis";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  macroCategoriasSchema,
  techServiceBucketsSchema,
  uuidSchema,
} from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { BUCKETS } from "@/lib/customer-item";
import type { Bucket, MacroCategoria, TechServiceCategory } from "@/types/database";

// Las lecturas viven en src/lib/data-reads.ts, compartidas con GET /api/data/*
// (DATA-043).
export async function getCategories() {
  const { profile } = await requireApproved();
  return readCategories(profile.company_id);
}

/** Categorías con su grupo de Servicio Técnico, activas e inactivas (ver readTechServiceCategories). */
export async function getTechServiceCategories(): Promise<TechServiceCategory[]> {
  const { profile } = await requireApproved();
  return readTechServiceCategories(profile.company_id);
}

export async function createCategory(cat: {
  name: string;
  description?: string;
  color?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", { fresh: true });
    const data = categoryCreateSchema.parse(cat);

    const [created] = await db
      .insert(categories)
      .values({
        name: data.name,
        description: data.description,
        color: data.color,
        company_id: profile.company_id,
      })
      .returning({ id: categories.id });
    audit({ action: "category.create", actorId: profile.id, companyId: profile.company_id, targetId: created?.id });

    revalidatePath("/categories");
  });
}

export async function updateCategory(
  id: string,
  updates: Partial<{ name: string; description: string; color: string; is_active: boolean }>
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", { fresh: true });
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
    audit({
      action: "category.update",
      actorId: profile.id,
      companyId: profile.company_id,
      targetId: categoryId,
      meta: { fields: Object.keys(data) },
    });

    revalidatePath("/categories");
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", { fresh: true });
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
    audit({ action: "category.delete", actorId: profile.id, companyId: profile.company_id, targetId: categoryId });

    revalidatePath("/categories");
  });
}

/**
 * Guarda de una vez los dos grupos de Servicio Técnico. Admin y Editor, la misma
 * regla que las metas de KPIs, porque decide qué cuenta en el KPI de incremento.
 * Primero se vacía la clasificación de toda la compañía y después se marcan los dos
 * grupos: así, una categoría que ya no se envía deja de contar. Todo va en una
 * transacción, para que nadie vea la compañía a medio clasificar. El filtro por
 * company_id hace que un id de otra compañía no toque nada.
 */
export async function saveTechServiceBuckets(st: string[], cr: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole(...ROLES_EDITAN_METAS, { fresh: true });
    const data = techServiceBucketsSchema.parse({ st, cr });

    await db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({ tech_service_bucket: null })
        .where(eq(categories.company_id, profile.company_id));

      if (data.st.length > 0) {
        await tx
          .update(categories)
          .set({ tech_service_bucket: "st" })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, data.st)));
      }
      if (data.cr.length > 0) {
        await tx
          .update(categories)
          .set({ tech_service_bucket: "cr" })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, data.cr)));
      }
    });
    audit({
      action: "category.tech_service_save",
      actorId: profile.id,
      companyId: profile.company_id,
      meta: { st: data.st.length, cr: data.cr.length },
    });

    revalidatePath("/settings");
    revalidatePath("/analytics");
  });
}

/** Categorías con su macro-categoría, activas e inactivas (ver readMacroCategorias). */
export async function getMacroCategorias(): Promise<MacroCategoria[]> {
  const { profile } = await requireApproved();
  return readMacroCategorias(profile.company_id);
}

/**
 * Guarda de una vez las cuatro macro-categorías. Admin y Editor, la misma regla que la
 * clasificación de Servicio Técnico. Primero se vacía la clasificación de toda la
 * compañía y después se marca cada grupo: así, una categoría que ya no se envía vuelve
 * a contar como Equipos. Todo va en una transacción, para que ningún gráfico vea la
 * compañía a medio clasificar. El filtro por company_id hace que un id de otra
 * compañía no toque nada.
 */
export async function saveMacroCategorias(grupos: Record<Bucket, string[]>): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole(...ROLES_EDITAN_METAS, { fresh: true });
    const data = macroCategoriasSchema.parse(grupos);

    await db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({ macro_categoria: null })
        .where(eq(categories.company_id, profile.company_id));

      for (const bucket of BUCKETS) {
        const ids = data[bucket];
        if (ids.length === 0) continue;
        await tx
          .update(categories)
          .set({ macro_categoria: bucket })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, ids)));
      }
    });
    audit({
      action: "category.macro_save",
      actorId: profile.id,
      companyId: profile.company_id,
      meta: Object.fromEntries(BUCKETS.map((b) => [b, data[b].length])),
    });

    // Las pantallas leen con react-query y se refrescan al invalidar ["categories"] en
    // el cliente. Esto solo descarta lo que Next.js tuviera cacheado de esas rutas.
    revalidatePath("/settings");
    revalidatePath("/analytics");
    revalidatePath("/home");
    revalidatePath("/cliente-articulo");
    revalidatePath("/cliente-categoria");
  });
}
