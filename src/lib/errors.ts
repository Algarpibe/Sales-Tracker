import { ZodError } from "zod";

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
    console.error("[action] error inesperado:", e);
    return { ok: false, error: "Ocurrió un error interno. Inténtalo de nuevo.", code: "INTERNAL" };
  }
}
