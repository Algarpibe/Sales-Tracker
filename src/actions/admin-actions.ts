"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
import { runAction, AppError, type ActionResult } from "@/lib/errors";
import { adminChangeError } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Admin = Awaited<ReturnType<typeof requireRole>>;

// Ensures the acting admin and the target user belong to the same company.
// Returns the admin's profile for any further checks.
async function assertSameCompany(userId: string) {
  const admin = await requireRole("admin", { fresh: true });

  const [target] = await db
    .select({ company_id: profiles.company_id })
    .from(profiles)
    .where(eq(profiles.id, userId));

  if (!target) {
    throw new AppError("Usuario no encontrado.", "USER_NOT_FOUND");
  }

  if (!admin.profile?.company_id || target.company_id !== admin.profile.company_id) {
    throw new AppError("No tienes permisos para esta acción.", "FORBIDDEN");
  }

  return admin;
}

// Rejects changes the acting admin applies to their own account, and changes that
// would leave the company without an active admin. Must run inside the same
// transaction as the write: the active admins are locked (FOR UPDATE, in id order)
// so two admins demoting each other concurrently cannot both succeed.
async function assertAdminChangeAllowed(tx: Tx, admin: Admin, targetId: string, removesAdmin: boolean) {
  const activeAdmins = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.company_id, admin.profile.company_id),
        eq(profiles.role, "admin"),
        eq(profiles.is_active, true),
        eq(profiles.is_approved, true),
        eq(profiles.is_rejected, false),
      ),
    )
    .orderBy(profiles.id)
    .for("update");

  const error = adminChangeError({
    actorId: admin.user.id,
    targetId,
    removesAdmin,
    activeAdminIds: activeAdmins.map((a) => a.id),
  });
  if (error) throw new AppError(error, "FORBIDDEN");
}

export async function approveUser(userId: string, role?: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = uuidSchema.parse(userId);
    const admin = await assertSameCompany(uid);

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

    await db.transaction(async (tx) => {
      const removesAdmin = updateData.role !== undefined && updateData.role !== "admin";
      await assertAdminChangeAllowed(tx, admin, uid, removesAdmin);
      await tx.update(profiles).set(updateData).where(eq(profiles.id, uid));
    });
    audit({
      action: "user.approve",
      actorId: admin.user.id,
      companyId: admin.profile.company_id,
      targetId: uid,
      meta: updateData.role !== undefined ? { role: updateData.role } : undefined,
    });

    revalidatePath("/admin/users");
    revalidatePath("/waiting-approval");
  });
}

export async function updateUserRole(userId: string, role: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = uuidSchema.parse(userId);
    const validRole = roleSchema.parse(role);
    const admin = await assertSameCompany(uid);

    await db.transaction(async (tx) => {
      await assertAdminChangeAllowed(tx, admin, uid, validRole !== "admin");
      await tx
        .update(profiles)
        .set({ role: validRole })
        .where(eq(profiles.id, uid));
    });
    audit({
      action: "user.role_update",
      actorId: admin.user.id,
      companyId: admin.profile.company_id,
      targetId: uid,
      meta: { role: validRole },
    });

    revalidatePath("/admin/users");
  });
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = uuidSchema.parse(userId);
    const admin = await assertSameCompany(uid);

    await db.transaction(async (tx) => {
      await assertAdminChangeAllowed(tx, admin, uid, true);
      await tx
        .update(profiles)
        .set({
          is_approved: false,
          is_rejected: true,
          is_active: false,
        })
        .where(eq(profiles.id, uid));
    });
    audit({ action: "user.deactivate", actorId: admin.user.id, companyId: admin.profile.company_id, targetId: uid });

    revalidatePath("/admin/users");
    revalidatePath("/waiting-approval");
  });
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = uuidSchema.parse(userId);
    const admin = await assertSameCompany(uid);

    await db.transaction(async (tx) => {
    await assertAdminChangeAllowed(tx, admin, uid, true);

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
    audit({ action: "user.delete", actorId: admin.user.id, companyId: admin.profile.company_id, targetId: uid });

    revalidatePath("/admin/users");
    revalidatePath("/waiting-approval");
  });
}
