"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SubscriptionCategory, SubscriptionStatus, BillingCycle } from "@/types/database";

export async function getSubscriptions(filters?: {
  status?: SubscriptionStatus;
  category?: SubscriptionCategory;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.category) query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
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
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("Perfil no encontrado");

  const { error } = await supabase.from("subscriptions").insert({
    ...sub,
    company_id: profile.company_id,
    user_id: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/subscriptions");
}

export async function updateSubscription(
  id: string,
  updates: Partial<{
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
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/subscriptions");
}

export async function deleteSubscription(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/subscriptions");
}
