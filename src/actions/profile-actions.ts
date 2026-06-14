"use server";

import { getSessionUser } from "@/lib/auth/guards";

export async function getMyProfile() {
  return getSessionUser();
}
