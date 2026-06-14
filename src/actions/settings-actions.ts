"use server";

import { eq, ne, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { companies, profiles, user } from "@/db/schema";
import { requireApproved, requireRole, requireUser } from "@/lib/auth/guards";
import { accountUpdateSchema, companyUpdateSchema } from "@/lib/validation";

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
  const parsed = companyUpdateSchema.parse(updates);
  await db
    .update(companies)
    .set({ ...parsed, updated_at: new Date().toISOString() })
    .where(eq(companies.id, profile.company_id));
  revalidatePath("/settings");
}

// ── Cuenta propia (nombre/email viven en better-auth user) ──
export async function updateMyAccount(updates: { full_name?: string; email?: string }) {
  const { user: u } = await requireUser();
  const parsed = accountUpdateSchema.parse(updates);

  const set: Record<string, unknown> = {};
  if (parsed.full_name !== undefined) set.name = parsed.full_name;

  if (parsed.email !== undefined && parsed.email !== u.email) {
    // Unicidad: better-auth exige email único; comprobamos antes para dar un error claro.
    const [dupe] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, parsed.email), ne(user.id, u.id)));
    if (dupe) throw new Error("EMAIL_EN_USO");
    set.email = parsed.email;
    set.emailVerified = false; // requiere re-verificación
  }

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
