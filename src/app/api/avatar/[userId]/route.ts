import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

// Sirve el avatar (bytea) de un usuario. Público (sólo imagen de perfil).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [p] = await db
    .select({ avatar: profiles.avatar, mime: profiles.avatar_mime })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (!p?.avatar) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(p.avatar), {
    headers: { "Content-Type": p.mime ?? "image/png", "Cache-Control": "private, max-age=60" },
  });
}
