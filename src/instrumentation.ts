import type { Instrumentation } from "next";
import { reportRequestError } from "@/lib/request-error";

// Errores de servidor no capturados (render, route handlers, server actions, proxy) al
// logger estructurado (ARQ-078). Solo método y patrón de ruta: sin cabeceras ni cuerpos.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportRequestError(error, request, context);
};
