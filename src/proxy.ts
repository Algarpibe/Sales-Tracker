import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

// Las lecturas JSON de /api/data (DATA-043) las pide fetch(): una redirección a /login
// la seguiría y acabaría en el HTML de esa página con un 200. A esas rutas se les
// responde 401/403 en JSON, con los mismos mensajes que los guards; las páginas siguen
// redirigiendo. La ruta vuelve a autorizar por su cuenta (defensa en profundidad).
function isDataApi(pathname: string): boolean {
  return pathname === "/api/data" || pathname.startsWith("/api/data/");
}

function apiError(status: 401 | 403, error: string, code: string) {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Proxy de Next 16 (antes `middleware`, convención deprecada): corre en Node.js por
// defecto. No se declara `config.runtime`: en un proxy está prohibido y lanza error.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (!session) {
    if (isDataApi(pathname)) return apiError(401, "Debes iniciar sesión.", "UNAUTHORIZED");
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

  if (!allowed && isDataApi(pathname)) {
    return apiError(403, "Tu cuenta está pendiente de aprobación.", "NOT_APPROVED");
  }
  if (!allowed && pathname !== "/waiting-approval") {
    return NextResponse.redirect(new URL("/waiting-approval", req.url));
  }
  if (allowed && (isAuthPage || pathname === "/waiting-approval")) {
    return NextResponse.redirect(new URL("/home", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/health).*)"],
};
