"use server";

import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { companies, profiles, user } from "@/db/schema";
import { requireApproved, requireRole, requireUser } from "@/lib/auth/guards";

// ── Empresa ──
export async function getCompany() {
  const { profile } = await requireApproved();
  const [c] = await db.select().from(companies).where(eq(companies.id, profile.company_id));
  return c ?? null;
}

export async function updateCompany(updates: {
  name?: string;
  tax_id?: string | null;
  country?: string | null;
  industry?: string | null;
  logo_url?: string | null;
}) {
  const { profile } = await requireRole("admin");
  await db
    .update(companies)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(companies.id, profile.company_id));
  revalidatePath("/settings");
}

// ── Cuenta propia (nombre/email viven en better-auth user) ──
export async function updateMyAccount(updates: { full_name?: string; email?: string }) {
  const { user: u } = await requireUser();
  const set: Record<string, unknown> = {};
  if (updates.full_name !== undefined) set.name = updates.full_name;
  if (updates.email !== undefined) set.email = updates.email;
  if (Object.keys(set).length === 0) return;
  set.updatedAt = new Date();
  await db.update(user).set(set).where(eq(user.id, u.id));
  revalidatePath("/settings");
}

// ── Usuarios de la empresa (panel admin) ──
export async function getCompanyUsers() {
  const { profile: admin } = await requireRole("admin");
  return db
    .select({
      id: profiles.id,
      email: user.email,
      full_name: user.name,
      role: profiles.role,
      is_active: profiles.is_active,
      is_approved: profiles.is_approved,
      is_rejected: profiles.is_rejected,
      rejection_reason: profiles.rejection_reason,
      created_at: profiles.created_at,
    })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.id))
    .where(eq(profiles.company_id, admin.company_id))
    .orderBy(desc(profiles.created_at));
}
