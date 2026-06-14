import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function getSessionUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, s.user.id));
  return { user: s.user, profile: profile ?? null };
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export async function requireApproved() {
  const u = await requireUser();
  if (!u.profile?.isApproved) throw new Error("NOT_APPROVED");
  return u;
}

export async function requireRole(...roles: string[]) {
  const u = await requireApproved();
  if (!u.profile || !roles.includes(u.profile.role)) throw new Error("FORBIDDEN");
  return u;
}
