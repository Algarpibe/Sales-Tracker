import { AppError } from "@/lib/errors";
import { logError, logWarn } from "@/lib/logger";

// Visibilidad de los errores de servidor no capturados (ARQ-078). Lo llama
// `onRequestError` de src/instrumentation.ts (API de Next 16). Se registra el PATRÓN de
// la ruta (`/clientes/[customer]`), no la ruta real: la real puede llevar un nombre de
// cliente o una búsqueda. Nunca cabeceras (cookies de sesión) ni cuerpos.

export interface RequestErrorRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RequestErrorContext {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "proxy";
  renderSource?: string;
  revalidateReason?: string;
}

export function requestErrorMeta(
  request: RequestErrorRequest,
  context: RequestErrorContext,
  error: unknown
): Record<string, string> {
  const meta: Record<string, string> = {
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  };
  if (context.renderSource) meta.renderSource = context.renderSource;
  if (error !== null && typeof error === "object" && "digest" in error && error.digest !== undefined) {
    meta.digest = String(error.digest);
  }
  return meta;
}

export function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext
): void {
  const meta = requestErrorMeta(request, context, error);
  // Un AppError es un error esperado (sesión caducada, sin permisos, validación) que
  // una lectura deja subir a react-query: aviso, no error.
  if (error instanceof AppError) {
    logWarn("request error esperado", { ...meta, code: error.code });
    return;
  }
  logError("unhandled server error", error, meta);
}
