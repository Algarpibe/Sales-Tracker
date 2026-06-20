// Logger estructurado (F4-01). Emite una línea JSON por evento a stdout/stderr,
// que EasyPanel/Docker recogen. Centraliza el formato (antes: console.* disperso)
// para poder filtrar/buscar por nivel, mensaje y contexto. Sin dependencias.
type LogLevel = "error" | "warn" | "info";
type LogMeta = Record<string, unknown>;

function emit(level: LogLevel, message: string, meta?: LogMeta, error?: unknown) {
  const entry: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta,
  };
  if (error !== undefined) {
    entry.error =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error);
  }
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
