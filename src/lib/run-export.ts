// Ejecuta una exportación asíncrona (p. ej. generar el .xlsx en el servidor) y
// avisa al terminar: éxito solo cuando de verdad ha acabado, error si falla.
// Devuelve si salió bien. El aviso se inyecta (toast de sonner en la UI).
export interface ExportNotifier {
  success: (message: string) => unknown;
  error: (message: string) => unknown;
}

export async function runExport(
  task: () => Promise<unknown>,
  notify: ExportNotifier,
  messages: { ok: string; error: string }
): Promise<boolean> {
  try {
    await task();
    notify.success(messages.ok);
    return true;
  } catch {
    notify.error(messages.error);
    return false;
  }
}

export const XLSX_EXPORT_MESSAGES = {
  ok: "Excel descargado",
  error: "No se pudo generar el Excel",
} as const;
