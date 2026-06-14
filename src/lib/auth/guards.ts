import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function getSessionUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  // Selecciona columnas explícitas: NO traer el binario `avatar` (bytea) al cliente;
  // en su lugar expone `has_avatar` para construir la URL /api/avatar/[id].
  const [profile] = await db
    .select({
      id: profiles.id,
      company_id: profiles.company_id,
      role: profiles.role,
      is_active: profiles.is_active,
      is_approved: profiles.is_approved,
      is_rejected: profiles.is_rejected,
      rejection_reason: profiles.rejection_reason,
      created_at: profiles.created_at,
      updated_at: profiles.updated_at,
      has_avatar: sql<boolean>`${profiles.avatar} is not null`,
    })
    .from(profiles)
    .where(eq(profiles.id, s.user.id));
  return { user: s.user, profile: profile ?? null };
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export async function requireApproved() {
  const u = await requireUser();
  const profile = u.profile;
  if (!profile || !profile.is_approved || profile.is_rejected || !profile.is_active) {
    throw new Error("NOT_APPROVED");
  }
  // profile queda garantizado no-nulo para los consumidores.
  return { user: u.user, profile };
}

export async function requireRole(...roles: string[]) {
  const u = await requireApproved();
  if (!roles.includes(u.profile.role)) throw new Error("FORBIDDEN");
  return u;
}
