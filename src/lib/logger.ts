// Logger estructurado (F4-01). Emite una línea JSON por evento a stdout/stderr,
// que EasyPanel/Docker recogen. Centraliza el formato (antes: console.* disperso)
// para poder filtrar/buscar por nivel, mensaje y contexto. Sin dependencias.
// PRIV-017: los metadatos pasan por el filtro de datos personales y los errores se
// registran sin emails.
import { dropPiiKeys, redactEmails } from "@/lib/pii";

type LogLevel = "error" | "warn" | "info";
type LogMeta = Record<string, unknown>;

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactEmails(error.message),
      stack: error.stack === undefined ? undefined : redactEmails(error.stack),
    };
  }
  return redactEmails(String(error));
}

function emit(level: LogLevel, message: string, meta?: LogMeta, error?: unknown) {
  const safeMeta = meta ? (dropPiiKeys(meta) as LogMeta) : {};
  // `error` es un campo reservado: solo lo rellena el error real, nunca los metadatos.
  delete safeMeta.error;
  const entry: Record<string, unknown> = {
    ...safeMeta,
    // Los campos fijos van después: los metadatos no pueden pisarlos.
    level,
    message,
    time: new Date().toISOString(),
  };
  if (error !== undefined) entry.error = serializeError(error);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logError(message: string, error?: unknown, meta?: LogMeta) {
  emit("error", message, meta, error);
}
export function logWarn(message: string, meta?: LogMeta) {
  emit("warn", message, meta);
}
export function logInfo(message: string, meta?: LogMeta) {
  emit("info", message, meta);
}
