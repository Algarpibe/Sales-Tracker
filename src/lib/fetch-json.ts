import { AppError, RATE_LIMITED_CODE, RATE_LIMITED_MESSAGE } from "@/lib/errors";

// Fetcher de las lecturas por GET /api/data (DATA-043). Lo usan los queryFn de
// react-query en el navegador: a diferencia de las Server Actions, que Next despacha de
// una en una, varias peticiones GET corren en paralelo.

export type DataParams = Record<string, string | number | boolean | null | undefined>;

const BASE = "/api/data";
const FALLO = "No se pudieron cargar los datos.";

/** URL del recurso. Los parámetros null/undefined no viajan (la ruta los toma por ausentes). */
export function dataUrl(resource: string, params: DataParams = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  }
  const query = qs.toString();
  return `${BASE}/${encodeURIComponent(resource)}${query ? `?${query}` : ""}`;
}

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").includes("application/json");
}

/**
 * GET JSON de /api/data/<resource>. Una respuesta no-OK (o que no sea JSON, p. ej. una
 * página HTML) se convierte en AppError: con el mensaje y el código que ya sanea el
 * servidor si los trae, o con un mensaje genérico; nunca con el cuerpo crudo. Un fallo
 * de red se propaga tal cual.
 */
export async function fetchJson<T>(resource: string, params?: DataParams): Promise<T> {
  const res = await fetch(dataUrl(resource, params), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
  });
  const json = isJson(res);
  if (res.ok && json) return (await res.json()) as T;

  const body: unknown = json ? await res.json().catch(() => null) : null;
  const { error, code } = (body ?? {}) as { error?: unknown; code?: unknown };
  if (typeof error === "string" && error && typeof code === "string") throw new AppError(error, code);
  // Un 429 sin el JSON del servidor (p. ej. de un proxy delante) se explica igual que
  // el límite por usuario (SEC-006): hay que esperar, no es un fallo de la app.
  if (res.status === 429) throw new AppError(RATE_LIMITED_MESSAGE, RATE_LIMITED_CODE);
  throw new AppError(FALLO, `HTTP_${res.status}`);
}
