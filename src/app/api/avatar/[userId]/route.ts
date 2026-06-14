import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/guards";

// Sirve el avatar (bytea) de un usuario. Requiere sesión: solo se permite ver
// el avatar propio o el de un usuario de la misma empresa (multi-tenant).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return new NextResponse(null, { status: 401 });

  const { userId } = await params;
  const [p] = await db
    .select({ avatar: profiles.avatar, mime: profiles.avatar_mime, company_id: profiles.company_id })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (!p?.avatar) return new NextResponse(null, { status: 404 });

  // Autorización: avatar propio o de alguien de la misma empresa.
  const isSelf = userId === session.user.id;
  const sameCompany = !!session.profile && p.company_id === session.profile.company_id;
  if (!isSelf && !sameCompany) return new NextResponse(null, { status: 403 });

  return new NextResponse(new Uint8Array(p.avatar), {
    headers: { "Content-Type": p.mime ?? "image/png", "Cache-Control": "private, max-age=60" },
  });
}
