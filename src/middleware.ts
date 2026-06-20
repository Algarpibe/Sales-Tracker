import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (!session) {
    return isAuthPage ? NextResponse.next() : NextResponse.redirect(new URL("/login", req.url));
  }

  const [p] = await db
    .select({
      approved: profiles.is_approved,
      rejected: profiles.is_rejected,
      active: profiles.is_active,
    })
    .from(profiles)
    .where(eq(profiles.id, session.user.id));

  // Acceso pleno solo si está aprobado, no rechazado y activo (coherente con requireApproved)
  const allowed = !!p?.approved && !p?.rejected && !!p?.active;

  if (!allowed && pathname !== "/waiting-approval") {
    return NextResponse.redirect(new URL("/waiting-approval", req.url));
  }
  if (allowed && (isAuthPage || pathname === "/waiting-approval")) {
    return NextResponse.redirect(new URL("/home", req.url));
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
