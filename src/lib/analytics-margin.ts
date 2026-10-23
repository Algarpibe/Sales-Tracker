import type { MarginYearRow, MarginItemRow, MarginCustomerRow } from "@/types/database";
import type { ChartSummarySeries } from "@/lib/chart-summary";
import { formatPct, formatUSD } from "@/lib/constants";

export interface MarginDerived { margen: number; margenPct: number }

export function deriveMargin(ventas: number, costo: number): MarginDerived {
  const margen = ventas - costo;
  return { margen, margenPct: ventas > 0 ? (margen / ventas) * 100 : 0 };
}

export interface MarginYearPoint { year: number; ventas: number; costo: number; margen: number; margenPct: number }
export interface MarginTotals { ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginByYear(rows: MarginYearRow[]): { series: MarginYearPoint[]; totals: MarginTotals } {
  const series = [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: r.year, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }));
  const ventas = rows.reduce((s, r) => s + r.ventas, 0);
  const costo = rows.reduce((s, r) => s + r.costo, 0);
  return { series, totals: { ventas, costo, ...deriveMargin(ventas, costo) } };
}

export interface MarginItemPoint { label: string; sku: string | null; ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginItems(rows: MarginItemRow[]): MarginItemPoint[] {
  return rows
    .map((r) => ({ label: r.nombre, sku: r.sku, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }))
    .sort((a, b) => b.margen - a.margen || a.label.localeCompare(b.label));
}

export interface MarginCustomerPoint { customer: string; ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginCustomers(rows: MarginCustomerRow[]): MarginCustomerPoint[] {
  return rows
    .map((r) => ({ customer: r.customer, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }))
    .sort((a, b) => b.margen - a.margen || a.customer.localeCompare(b.customer));
}

/**
 * Columnas del resumen accesible de los gráficos de margen (FE-061): las mismas cifras y
 * formatos que su tooltip. El scatter no enseña el costo, así que lo puede quitar.
 */
export function marginSummarySeries<T extends MarginTotals>({ costo = true }: { costo?: boolean } = {}): ChartSummarySeries<T>[] {
  return [
    { label: "Ventas", value: (p) => p.ventas, format: formatUSD },
    ...(costo ? [{ label: "Costo", value: (p: T) => p.costo, format: formatUSD }] : []),
    { label: "Margen", value: (p) => p.margen, format: formatUSD },
    { label: "Margen %", value: (p) => p.margenPct, format: (v) => formatPct(v) },
  ];
}
