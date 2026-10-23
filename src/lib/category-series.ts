import { MONTH_LABELS } from "@/lib/constants";

// Agregados por categoría de las tarjetas «Histórico por categoría» y «Forecast por
// categoría» (FE-057). Antes vivían dentro de un useEffect de cada tarjeta; aquí son
// funciones puras sobre las ventas ya cargadas por react-query.

/** Venta mínima que necesitan los agregados (SalesRecord la cumple). */
export interface CategorySale {
  category_id: string;
  record_year: number;
  record_month: number;
  /** NUMERIC: puede llegar como texto desde Postgres. */
  amount_usd: number;
}

/** Punto del gráfico: clave del eje (year/month/quarter) + importe por category_id. */
export type CategoryChartPoint = Record<string, string | number>;

export interface HistoricalCategorySeries {
  /** Años con ventas desde `firstYear`, ascendentes. */
  years: number[];
  annual: CategoryChartPoint[];
  /** año → 12 puntos (Ene…Dic). */
  monthly: Record<number, CategoryChartPoint[]>;
  /** año → 4 puntos (T1…T4). */
  quarterly: Record<number, CategoryChartPoint[]>;
}

const QUARTERS = [
  { label: "T1", months: [1, 2, 3] },
  { label: "T2", months: [4, 5, 6] },
  { label: "T3", months: [7, 8, 9] },
  { label: "T4", months: [10, 11, 12] },
];

const cents = (n: number) => Math.round(n * 100) / 100;

export function buildHistoricalCategorySeries(
  records: readonly CategorySale[],
  firstYear: number
): HistoricalCategorySeries {
  const years = Array.from(new Set(records.map((r) => Number(r.record_year))))
    .filter((y) => y >= firstYear)
    .sort((a, b) => a - b);

  // año → mes → categoría → importe (solo años del rango).
  const byYearMonth: Record<number, Record<number, Record<string, number>>> = {};
  for (const y of years) {
    byYearMonth[y] = {};
    for (let m = 1; m <= 12; m++) byYearMonth[y][m] = {};
  }
  for (const r of records) {
    const months = byYearMonth[Number(r.record_year)];
    if (!months) continue; // año anterior a firstYear
    const bucket = months[Number(r.record_month)];
    if (!bucket) continue;
    const catId = String(r.category_id);
    bucket[catId] = (bucket[catId] || 0) + (Number(r.amount_usd) || 0);
  }

  const annual: CategoryChartPoint[] = [];
  const monthly: Record<number, CategoryChartPoint[]> = {};
  const quarterly: Record<number, CategoryChartPoint[]> = {};

  for (const year of years) {
    const yearTotals: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      for (const [catId, total] of Object.entries(byYearMonth[year][m])) {
        yearTotals[catId] = (yearTotals[catId] || 0) + total;
      }
    }
    const annualPoint: CategoryChartPoint = { year: String(year) };
    for (const [catId, total] of Object.entries(yearTotals)) annualPoint[catId] = cents(total);
    annual.push(annualPoint);

    monthly[year] = MONTH_LABELS.map((label, idx) => {
      const point: CategoryChartPoint = { month: label };
      for (const [catId, total] of Object.entries(byYearMonth[year][idx + 1])) point[catId] = cents(total);
      return point;
    });

    quarterly[year] = QUARTERS.map((q) => {
      const point: CategoryChartPoint = { quarter: q.label };
      for (const m of q.months) {
        for (const [catId, total] of Object.entries(byYearMonth[year][m])) {
          point[catId] = (Number(point[catId]) || 0) + cents(total);
        }
      }
      return point;
    });
  }

  return { years, annual, monthly, quarterly };
}

/** categoría → año → mes → importe. Base del forecast estacional por categoría. */
export function sumByCategoryYearMonth(
  records: readonly CategorySale[]
): Record<string, Record<number, Record<number, number>>> {
  const sums: Record<string, Record<number, Record<number, number>>> = {};
  for (const r of records) {
    const catId = String(r.category_id);
    const year = Number(r.record_year);
    const month = Number(r.record_month);
    sums[catId] ??= {};
    sums[catId][year] ??= {};
    sums[catId][year][month] = (sums[catId][year][month] || 0) + (Number(r.amount_usd) || 0);
  }
  return sums;
}
