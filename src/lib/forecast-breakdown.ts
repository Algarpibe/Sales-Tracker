import { computeForecast, historyYears, type ForecastInput, type ForecastNow, type ForecastResult } from "@/lib/forecast";
import { MONTH_LABELS } from "@/lib/constants";
import type { RecordType } from "@/types/database";

// Forecast único (ARQ-079). Todas las proyecciones (empresa, categoría y grupo) usan el
// modelo A de computeForecast. Las categorías se proyectan una a una y luego se
// reconcilian en proporción para que, mes a mes, sumen la proyección de la empresa del
// mismo año y tipo de registro. Los grupos se derivan sumando sus categorías ya
// reconciliadas. Todo recibe el reloj (`now`) desde fuera: nada lee la fecha del sistema.

/** año → mes (1-12) → importe. */
export type MonthsByYear = Record<number, Record<number, number>>;

/** Pesos de recencia del histórico estacional: A-1 / A-2 / A-3. */
export const FORECAST_WEIGHTS: readonly number[] = [3, 2, 1];

/** Reloj del forecast: el año de calendario y la posición dentro del mes en curso. */
export interface ForecastClock extends ForecastNow {
  year: number;
}

export function forecastClock(date: Date): ForecastClock {
  return {
    year: date.getFullYear(),
    monthIdx: date.getMonth(),
    day: date.getDate(),
    daysInMonth: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
  };
}

const finite = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

/** Los 12 meses (Ene…Dic) de un año; lo que falta o no es numérico cuenta 0. */
export function yearSeries(months: MonthsByYear, year: number): number[] {
  return Array.from({ length: 12 }, (_, m) => finite(months[year]?.[m + 1]));
}

/**
 * Entrada del modelo A para una serie. El año de referencia del ritmo interanual es
 * SIEMPRE el anterior al proyectado (A-1), nunca el año B que se elija para comparar.
 */
export function buildForecastInput(months: MonthsByYear, year: number, now: ForecastClock): ForecastInput {
  return {
    currentYearMonthly: yearSeries(months, year),
    lastYearMonthly: yearSeries(months, year - 1),
    historicalMatrix: historyYears(year, FORECAST_WEIGHTS.length).map((y) => yearSeries(months, y)),
    weights: [...FORECAST_WEIGHTS],
    now: { monthIdx: now.monthIdx, day: now.day, daysInMonth: now.daysInMonth },
    isCurrentActualYear: year === now.year,
  };
}

export function forecastSeries(months: MonthsByYear, year: number, now: ForecastClock): ForecastResult {
  return computeForecast(buildForecastInput(months, year, now));
}

/** Venta mínima para agregar (SalesRecord la cumple; amount_usd puede llegar como texto). */
export interface ForecastSale {
  record_type: string;
  record_year: number;
  record_month: number;
  amount_usd: number | string;
}

/** Serie de la empresa (año → mes → importe) de un tipo de registro. */
export function sumByYearMonth(records: readonly ForecastSale[], recordType: RecordType): MonthsByYear {
  const out: MonthsByYear = {};
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const y = Number(r.record_year);
    const m = Number(r.record_month);
    if (!(m >= 1 && m <= 12)) continue;
    out[y] ??= {};
    out[y][m] = (out[y][m] || 0) + finite(r.amount_usd);
  }
  return out;
}

/** Modelo A de la empresa a partir de las ventas (proyecciones de cierre y gráfico estacional). */
export function forecastRecords(
  records: readonly ForecastSale[],
  year: number,
  recordType: RecordType,
  now: ForecastClock
): ForecastResult {
  return forecastSeries(sumByYearMonth(records, recordType), year, now);
}

/**
 * Primer mes (0-11) que es proyección: el mes en curso si se proyecta el año actual. Un
 * año cerrado o futuro no tiene meses que reconciliar (12).
 */
export function firstProjectedMonth(year: number, now: ForecastClock): number {
  return year === now.year ? now.monthIdx : 12;
}

export interface ReconcileResult {
  values: Record<string, number[]>;
  /** Meses en los que las series sumaban 0 y se repartió por cuota estacional. */
  fallbackMonths: number[];
}

/**
 * Reconciliación proporcional: en cada mes proyectado (desde `fromMonth`) escala las
 * series para que sumen `target`. Los meses anteriores (reales) no se tocan.
 *
 * - Proyecciones negativas o no numéricas cuentan 0; un total negativo o no numérico es 0.
 * - Si las series suman 0 en un mes con total > 0, el total se reparte según
 *   `fallbackShares` (la cuota estacional de cada serie en ese mes) y, si tampoco hay
 *   cuotas, a partes iguales. Así nunca salen negativos ni NaN.
 */
export function reconcileToTotal(
  projections: Record<string, readonly number[]>,
  target: readonly number[],
  fromMonth: number,
  fallbackShares: Record<string, readonly number[]>
): ReconcileResult {
  const ids = Object.keys(projections);
  const values: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, [...projections[id]]]));
  const fallbackMonths: number[] = [];
  if (ids.length === 0) return { values, fallbackMonths };

  for (let m = fromMonth; m < target.length; m++) {
    const total = Math.max(0, finite(target[m]));
    const raw = ids.map((id) => Math.max(0, finite(projections[id][m])));
    const rawSum = sum(raw);
    let weights = raw;
    let weightSum = rawSum;
    if (total > 0 && rawSum <= 0) {
      fallbackMonths.push(m);
      weights = ids.map((id) => Math.max(0, finite(fallbackShares[id]?.[m])));
      weightSum = sum(weights);
      if (weightSum <= 0) {
        weights = ids.map(() => 1);
        weightSum = ids.length;
      }
    }
    ids.forEach((id, i) => {
      values[id][m] = total > 0 ? (total * weights[i]) / weightSum : 0;
    });
  }
  return { values, fallbackMonths };
}

/**
 * Cuota estacional de cada serie: por mes, la suma ponderada (3/2/1) de sus ventas en
 * los tres años anteriores a `year`. Un mes sin historia en ninguna serie usa el peso
 * anual de cada una. Es la base del reparto de respaldo de reconcileToTotal.
 */
export function seasonalShares(seriesById: Record<string, MonthsByYear>, year: number): Record<string, number[]> {
  const years = historyYears(year, FORECAST_WEIGHTS.length);
  const out: Record<string, number[]> = {};
  for (const [id, months] of Object.entries(seriesById)) {
    out[id] = Array.from({ length: 12 }, (_, m) =>
      years.reduce((acc, y, k) => acc + FORECAST_WEIGHTS[k] * Math.max(0, finite(months[y]?.[m + 1])), 0)
    );
  }
  const ids = Object.keys(out);
  const annual = Object.fromEntries(ids.map((id) => [id, sum(out[id])]));
  for (let m = 0; m < 12; m++) {
    if (sum(ids.map((id) => out[id][m])) > 0) continue;
    for (const id of ids) out[id][m] = annual[id];
  }
  return out;
}

/** Suma varias series año → mes → importe en una (la de la empresa). */
function mergeSeries(all: readonly MonthsByYear[]): MonthsByYear {
  const out: MonthsByYear = {};
  for (const s of all)
    for (const [y, ms] of Object.entries(s))
      for (const [m, v] of Object.entries(ms)) {
        const year = Number(y);
        out[year] ??= {};
        out[year][Number(m)] = (out[year][Number(m)] || 0) + finite(v);
      }
  return out;
}

export interface ForecastBreakdown {
  /** Modelo A de la empresa (suma de todas las series), mismo año y tipo. */
  company: ForecastResult;
  /** id → 12 meses: reales en los meses cerrados, proyección reconciliada en el resto. */
  forecast: Record<string, number[]>;
  /** id → 12 meses de ventas reales del año (el mes en curso, a fecha de hoy). */
  actual: Record<string, number[]>;
  /** id → cierre del año (suma de `forecast`). */
  totals: Record<string, number>;
  /** id → % del cierre proyectado de la empresa. */
  sharePct: Record<string, number>;
  /** Primer mes proyectado (0-11); 12 si el año no tiene meses proyectados. */
  firstProjectedMonth: number;
  /** Meses repartidos por cuota estacional porque las series sumaban 0. */
  fallbackMonths: number[];
}

/**
 * Proyección de cada serie (categoría) reconciliada con la de la empresa. `seriesById`
 * debe incluir TODAS las series del tipo de registro: la empresa es su suma.
 */
export function forecastBreakdown(
  seriesById: Record<string, MonthsByYear>,
  year: number,
  now: ForecastClock
): ForecastBreakdown {
  const ids = Object.keys(seriesById);
  const company = forecastSeries(mergeSeries(Object.values(seriesById)), year, now);
  const raw = Object.fromEntries(ids.map((id) => [id, forecastSeries(seriesById[id], year, now).monthlyForecast]));
  const from = firstProjectedMonth(year, now);
  const { values, fallbackMonths } = reconcileToTotal(
    raw,
    company.monthlyForecast,
    from,
    from < 12 ? seasonalShares(seriesById, year) : {}
  );
  const totals = Object.fromEntries(ids.map((id) => [id, sum(values[id])]));
  const companyTotal = sum(company.monthlyForecast);
  return {
    company,
    forecast: values,
    actual: Object.fromEntries(ids.map((id) => [id, yearSeries(seriesById[id], year)])),
    totals,
    sharePct: Object.fromEntries(ids.map((id) => [id, companyTotal > 0 ? (totals[id] / companyTotal) * 100 : 0])),
    firstProjectedMonth: from,
    fallbackMonths,
  };
}

/**
 * Agrega series por grupo: cada grupo suma solo sus categorías. Las categorías sin
 * grupo no cuentan en ninguno (como en el análisis por agrupaciones).
 */
export function sumSeriesByGroup(
  seriesById: Record<string, readonly number[]>,
  members: Record<string, readonly string[]>
): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(members).map(([groupId, ids]) => [
      groupId,
      Array.from({ length: 12 }, (_, m) => sum(ids.map((id) => finite(seriesById[id]?.[m])))),
    ])
  );
}

/** Punto del gráfico: mes + claves dinámicas por serie (real, forecast, %, color). */
export type ForecastChartPoint = Record<string, string | number>;

export interface ForecastChartItem {
  id: string;
  /** Clave del dato en el gráfico (id de la categoría, nombre del grupo…). */
  key: string;
  color?: string;
}

/**
 * Puntos de las tarjetas de forecast por categoría/grupo. Barras: ventas reales hasta
 * el mes en curso (incluido). Línea `total_forecast`: suma de la proyección de lo
 * elegido. `${key}_percent`: peso de cada serie dentro de lo elegido ese mes.
 */
export function forecastChartPoints(
  items: readonly ForecastChartItem[],
  forecast: Record<string, readonly number[]>,
  actual: Record<string, readonly number[]>,
  firstProjected: number
): ForecastChartPoint[] {
  const barsUntil = firstProjected >= 12 ? 12 : firstProjected + 1;
  return MONTH_LABELS.map((label, m) => {
    const point: ForecastChartPoint = { month: label };
    let total = 0;
    for (const it of items) {
      const f = finite(forecast[it.id]?.[m]);
      total += f;
      point[it.key] = m < barsUntil ? finite(actual[it.id]?.[m]) : 0;
      point[`${it.key}_forecast`] = f;
      if (it.color) point[`${it.key}_color`] = it.color;
    }
    point.total_forecast = total;
    for (const it of items) {
      const f = Number(point[`${it.key}_forecast`]);
      point[`${it.key}_percent`] = total > 0 ? (f / total) * 100 : 0;
    }
    return point;
  });
}
