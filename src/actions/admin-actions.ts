"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveUser(userId: string, role?: string) {
  const supabase = await createClient();
  
  const updateData: any = { 
    is_approved: true,
    is_rejected: false 
  };

  if (role) {
    updateData.role = role;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}

export async function updateUserRole(userId: string, role: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}

export async function deactivateUser(userId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from("profiles")
    .update({ 
      is_approved: false,
      is_rejected: true 
    })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}

export async function deleteUser(userId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase.rpc('delete_user_entirely', { target_user_id: userId });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
  revalidatePath("/waiting-approval");
}
