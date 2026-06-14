"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  profiles,
  user,
  account,
  session,
  salesRecords,
  subscriptions,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { uuidSchema, roleSchema } from "@/lib/validation";

// Ensures the acting admin and the target user belong to the same company.
// Returns the admin's profile for any further checks.
async function assertSameCompany(userId: string) {
  const admin = await requireRole("admin");

  const [target] = await db
    .select({ company_id: profiles.company_id })
    .from(profiles)
    .where(eq(profiles.id, userId));

  if (!target) {
    throw new Error("USER_NOT_FOUND");
  }

  if (!admin.profile?.company_id || target.company_id !== admin.profile.company_id) {
    throw new Error("FORBIDDEN");
  }

  return admin;
}

export async function approveUser(userId: string, role?: string) {
  const uid = uuidSchema.parse(userId);
  await assertSameCompany(uid);

  const updateData: {
    is_approved: boolean;
    is_rejected: boolean;
    is_active: boolean;
    role?: (typeof roleSchema)["_output"];
  } = {
    is_approved: true,
    is_rejected: false,
    is_active: true,
  };

  if (role !== undefined) {
    updateData.role = roleSchema.parse(role);
  }

  await db.update(profiles).set(updateData).where(eq(profiles.id, uid));

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}

export async function updateUserRole(userId: string, role: string) {
  const uid = uuidSchema.parse(userId);
  const validRole = roleSchema.parse(role);
  await assertSameCompany(uid);

  await db
    .update(profiles)
    .set({ role: validRole })
    .where(eq(profiles.id, uid));

  revalidatePath("/admin/users");
}

export async function deactivateUser(userId: string) {
  const uid = uuidSchema.parse(userId);
  await assertSameCompany(uid);

  await db
    .update(profiles)
    .set({
      is_approved: false,
      is_rejected: true,
      is_active: false,
    })
    .where(eq(profiles.id, uid));

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}

export async function deleteUser(userId: string) {
  const uid = uuidSchema.parse(userId);
  await assertSameCompany(uid);

  await db.transaction(async (tx) => {
    // 1) sales_records.created_by / updated_by reference user.id with NO cascade,
    //    so null them out to avoid FK restrict violations.
    await tx
      .update(salesRecords)
      .set({ created_by: null })
      .where(eq(salesRecords.created_by, uid));
    await tx
      .update(salesRecords)
      .set({ updated_by: null })
      .where(eq(salesRecords.updated_by, uid));

    // 2) subscriptions.user_id is ON DELETE SET NULL; null it explicitly to be safe.
    await tx
      .update(subscriptions)
      .set({ user_id: null })
      .where(eq(subscriptions.user_id, uid));

    // 3) profiles cascades from user, but delete first to be explicit.
    await tx.delete(profiles).where(eq(profiles.id, uid));

    // 4) better-auth session + account reference user.id (cascade), delete explicitly.
    await tx.delete(session).where(eq(session.userId, uid));
    await tx.delete(account).where(eq(account.userId, uid));

    // 5) finally the user row itself (would cascade the above, done last).
    await tx.delete(user).where(eq(user.id, uid));
  });

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}
