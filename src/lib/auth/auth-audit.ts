import { isAPIError } from "better-auth/api";
import type { AuditInput } from "@/lib/audit";

/**
 * Entrada de auditoría para un login por email fallido (ARQ-078), o null si la
 * respuesta no es un fallo de login. Lo llama el hook `after` de better-auth con lo que
 * devolvió el endpoint. Solo el status y el código de better-auth: nunca el email.
 */
export function signInFailureAudit(path: string, returned: unknown): AuditInput | null {
  if (path !== "/sign-in/email" || !isAPIError(returned)) return null;
  const body = returned.body as { code?: unknown } | undefined;
  return {
    action: "auth.sign_in_failed",
    meta: {
      status: returned.statusCode,
      code: typeof body?.code === "string" ? body.code : undefined,
    },
  };
}
