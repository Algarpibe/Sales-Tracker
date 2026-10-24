import { ZodError } from "zod";
import { logError } from "@/lib/logger";

// Contrato uniforme de errores para Server Actions mutadoras.
// Los errores ESPERADOS viajan como datos (ActionResult) para que el mensaje real
// llegue al usuario: en producción Next.js oculta el mensaje de las excepciones.
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, code?: string): ActionResult<never> {
  return { ok: false, error, code };
}

// Error "esperado" con mensaje seguro de mostrar al usuario.
export class AppError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

// Límite de peticiones por usuario (SEC-006, src/lib/rate-limit.ts). El código y el
// mensaje los comparten servidor y cliente: el cliente los usa para explicar un 429
// en vez de mostrar un error genérico.
export const RATE_LIMITED_CODE = "RATE_LIMITED";
export const RATE_LIMITED_MESSAGE = "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";

export function isRateLimited(e: unknown): boolean {
  return e instanceof AppError && e.code === RATE_LIMITED_CODE;
}

// SEC-035: la empresa de la sesión no es la dueña de los datos del hub (HUB_COMPANY_ID,
// src/lib/hub-company.ts). Viaja como FORBIDDEN (403 en /api/data); el mensaje lo
// comparten servidor y cliente para que la tarjeta explique por qué no hay datos.
export const HUB_COMPANY_FORBIDDEN_MESSAGE = "Tu empresa no tiene acceso a los datos del hub.";

export function isHubCompanyForbidden(e: unknown): boolean {
  return e instanceof AppError && e.code === "FORBIDDEN" && e.message === HUB_COMPANY_FORBIDDEN_MESSAGE;
}

// Status HTTP de un error de los guards (requireUser/requireApproved/requireRole)
// para Route Handlers. null = no es un error de autorización: el llamador lo relanza.
// El guard también corta por el límite de mutaciones (SEC-006): 429.
export function authErrorStatus(e: unknown): 401 | 403 | 429 | null {
  if (!(e instanceof AppError)) return null;
  if (e.code === "UNAUTHORIZED") return 401;
  if (e.code === "NOT_APPROVED" || e.code === "FORBIDDEN") return 403;
  if (e.code === RATE_LIMITED_CODE) return 429;
  return null;
}

// Envuelve el cuerpo de una acción y normaliza el error:
//  - AppError      → su mensaje (esperado, seguro)
//  - ZodError      → primer mensaje de validación
//  - desconocido   → mensaje genérico + log en servidor (no se filtra detalle)
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: e.message, code: e.code };
    }
    if (e instanceof ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos", code: "VALIDATION" };
    }
    logError("server action falló (error inesperado)", e, { code: "INTERNAL" });
    return { ok: false, error: "Ocurrió un error interno. Inténtalo de nuevo.", code: "INTERNAL" };
  }
}

// --- Lado cliente (ARQ-077) ---
// Una mutación con runAction no lanza: devuelve { ok: false }. Para useMutation (que
// distingue éxito/error por si la promesa se rechaza) se convierte en un AppError con
// el mensaje ya saneado por runAction.
export function unwrapAction<T>(res: ActionResult<T>): T {
  if (res.ok) return res.data;
  throw new AppError(res.error, res.code);
}

// Mensaje seguro para un toast: el de un AppError (esperado y saneado) o el genérico.
// Nunca el mensaje crudo de otro error (red, Next, Postgres...).
export function userErrorMessage(e: unknown, fallback: string): string {
  return e instanceof AppError ? e.message : fallback;
}
