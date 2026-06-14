import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";

// Sube el avatar del usuario actual (multipart 'file') y lo guarda como bytea.
export async function POST(req: NextRequest) {
  const { user } = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await db
    .update(profiles)
    .set({ avatar: bytes, avatar_mime: file.type || "image/png", updated_at: new Date().toISOString() })
    .where(eq(profiles.id, user.id));
  return NextResponse.json({ url: `/api/avatar/${user.id}?t=${Date.now()}` });
}
