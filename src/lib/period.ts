export type Tipo = "SALES_ORDER" | "INVOICE";
export interface Period { tipo: Tipo; year: number }

export function parseStoredPeriod(raw: string | null, fallback: Period): Period {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as { tipo?: unknown; year?: unknown };
    const tipo: Tipo = p.tipo === "SALES_ORDER" || p.tipo === "INVOICE" ? p.tipo : fallback.tipo;
    const year = typeof p.year === "number" && Number.isFinite(p.year) ? p.year : fallback.year;
    return { tipo, year };
  } catch {
    return fallback;
  }
}
