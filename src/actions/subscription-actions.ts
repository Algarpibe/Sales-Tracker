"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import {
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
  uuidSchema,
} from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import type {
  Subscription,
  SubscriptionCategory,
  SubscriptionStatus,
  BillingCycle,
  SubscriptionFilters,
} from "@/types/database";

// NUMERIC columns vuelven como string desde la BD → normalizamos a number/null
function mapRow(row: typeof subscriptions.$inferSelect): Subscription {
  return {
    id: row.id,
    company_id: row.company_id as string,
    user_id: row.user_id as string,
    tool_name: row.tool_name,
    provider: row.provider,
    category: row.category,
    description: row.description,
    monthly_cost_usd: Number(row.monthly_cost_usd),
    billing_cycle: row.billing_cycle,
    annual_cost_usd: row.annual_cost_usd === null ? null : Number(row.annual_cost_usd),
    status: row.status,
    renewal_date: row.renewal_date,
    start_date: row.start_date,
    cancel_date: row.cancel_date,
    url: row.url,
    logo_url: row.logo_url,
    created_at:
      row.created_at as string,
    updated_at:
      row.updated_at as string,
  };
}

export async function getSubscriptions(filters?: SubscriptionFilters): Promise<Subscription[]> {
  const { profile } = await requireApproved();

  const conditions = [eq(subscriptions.company_id, profile.company_id as string)];

  if (filters?.status) conditions.push(eq(subscriptions.status, filters.status));
  if (filters?.category) conditions.push(eq(subscriptions.category, filters.category));
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(ilike(subscriptions.tool_name, term), ilike(subscriptions.provider, term))!
    );
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(desc(subscriptions.created_at));

  return rows.map(mapRow);
}

export async function createSubscription(sub: {
  tool_name: string;
  provider?: string;
  category: SubscriptionCategory;
  description?: string;
  monthly_cost_usd: number;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  start_date: string;
  url?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { user, profile } = await requireRole("admin", "editor");
    const data = subscriptionCreateSchema.parse(sub);

    await db.insert(subscriptions).values({
      tool_name: data.tool_name,
      provider: data.provider,
      category: data.category,
      description: data.description,
      monthly_cost_usd: String(data.monthly_cost_usd),
      billing_cycle: data.billing_cycle,
      status: data.status,
      start_date: data.start_date,
      url: data.url,
      company_id: profile.company_id,
      user_id: user.id,
    });

    revalidatePath("/subscriptions");
  });
}

export async function updateSubscription(
  id: string,
  rawUpdates: Partial<{
    tool_name: string;
    provider: string;
    category: SubscriptionCategory;
    description: string;
    monthly_cost_usd: number;
    billing_cycle: BillingCycle;
    status: SubscriptionStatus;
    cancel_date: string;
    url: string;
  }>
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", "editor");
    const subId = uuidSchema.parse(id);
    const updates = subscriptionUpdateSchema.parse(rawUpdates);

    const values: Partial<typeof subscriptions.$inferInsert> = {};
    if (updates.tool_name !== undefined) values.tool_name = updates.tool_name;
    if (updates.provider !== undefined) values.provider = updates.provider;
    if (updates.category !== undefined) values.category = updates.category;
    if (updates.description !== undefined) values.description = updates.description;
    if (updates.monthly_cost_usd !== undefined) values.monthly_cost_usd = String(updates.monthly_cost_usd);
    if (updates.billing_cycle !== undefined) values.billing_cycle = updates.billing_cycle;
    if (updates.status !== undefined) values.status = updates.status;
    if (updates.cancel_date !== undefined) values.cancel_date = updates.cancel_date;
    if (updates.url !== undefined) values.url = updates.url;

    await db
      .update(subscriptions)
      .set(values)
      .where(
        and(
          eq(subscriptions.id, subId),
          eq(subscriptions.company_id, profile.company_id as string)
        )
      );

    revalidatePath("/subscriptions");
  });
}

export async function deleteSubscription(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", "editor");
    const subId = uuidSchema.parse(id);

    await db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subId),
          eq(subscriptions.company_id, profile.company_id as string)
        )
      );

    revalidatePath("/subscriptions");
  });
}
