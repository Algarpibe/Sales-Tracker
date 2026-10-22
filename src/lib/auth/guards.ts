import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { AppError } from "@/lib/errors";

/**
 * `fresh: true` lee la sesión de la BD saltándose la cookie cache de better-auth
 * (5 min, auth.ts). Lo usan las acciones que ESCRIBEN: una sesión revocada (logout
 * en otro dispositivo, cambio de contraseña) deja de valer al instante en vez de
 * seguir pasando hasta que caduque la cookie (SEC-038). Las lecturas y el
 * proxy siguen en la cookie cache, que ahorra una consulta por request.
 */
export type GuardOptions = { fresh?: boolean };

export async function getSessionUser(opts: GuardOptions = {}) {
  const s = await auth.api.getSession({
    headers: await headers(),
    ...(opts.fresh ? { query: { disableCookieCache: true } } : {}),
  });
  if (!s) return null;
  // Selecciona columnas explícitas: NO traer el binario `avatar` (bytea) al cliente;
  // en su lugar expone `has_avatar` para construir la URL /api/avatar/[id].
  const [profile] = await db
    .select({
      id: profiles.id,
      company_id: profiles.company_id,
      role: profiles.role,
      is_active: profiles.is_active,
      is_approved: profiles.is_approved,
      is_rejected: profiles.is_rejected,
      rejection_reason: profiles.rejection_reason,
      created_at: profiles.created_at,
      updated_at: profiles.updated_at,
      has_avatar: sql<boolean>`${profiles.avatar} is not null`,
    })
    .from(profiles)
    .where(eq(profiles.id, s.user.id));
  return { user: s.user, profile: profile ?? null };
}

export async function requireUser(opts: GuardOptions = {}) {
  const u = await getSessionUser(opts);
  if (!u) throw new AppError("Debes iniciar sesión.", "UNAUTHORIZED");
  return u;
}

export async function requireApproved(opts: GuardOptions = {}) {
  const u = await requireUser(opts);
  const profile = u.profile;
  if (!profile || !profile.is_approved || profile.is_rejected || !profile.is_active) {
    throw new AppError("Tu cuenta está pendiente de aprobación.", "NOT_APPROVED");
  }
  // profile queda garantizado no-nulo para los consumidores.
  return { user: u.user, profile };
}

/**
 * Exige uno de los roles. Las opciones van opcionalmente al final:
 * `requireRole("admin")` o `requireRole("admin", "editor", { fresh: true })`.
 */
export async function requireRole(...args: [...roles: string[], opts: GuardOptions] | string[]) {
  const last = args[args.length - 1];
  const opts: GuardOptions = typeof last === "object" ? last : {};
  const roles = args.filter((a): a is string => typeof a === "string");
  const u = await requireApproved(opts);
  if (!roles.includes(u.profile.role)) {
    throw new AppError("No tienes permisos para esta acción.", "FORBIDDEN");
  }
  return u;
}
