/**
 * Alternativa en texto de los gráficos (FE-061). Convierte los mismos puntos que pinta
 * un gráfico en las filas de una tabla que solo leen los lectores de pantalla
 * (`ChartFigure`, en src/components/charts/chart-a11y.tsx). Lógica pura: sin React ni
 * DOM, y con formateadores de locale fijo para que servidor y cliente pinten lo mismo.
 */

/**
 * Filas que enseña el resumen como mucho. Una tabla de 30 SKUs o de cientos de puntos
 * de un scatter no se puede escuchar entera: se leen las primeras (en el orden en que
 * llegan al gráfico, que en los rankings ya es de mayor a menor) y se dice cuántas
 * quedan. 20 cubre sin recorte los meses, trimestres, años y los top 10/15/20.
 */
export const CHART_SUMMARY_MAX_ROWS = 20;

/** Texto de una celda sin valor: una raya, para no confundirla con un cero. */
const SIN_VALOR = "—";

/** Una columna numérica del resumen: una serie del gráfico. */
export interface ChartSummarySeries<T> {
  /** Cabecera: el nombre de la serie, como en la leyenda o el tooltip. */
  label: string;
  value: (point: T) => number | null | undefined;
  /** El mismo formateador que usan el tooltip o el eje del gráfico. */
  format: (value: number) => string;
}

export interface ChartSummaryInput<T> {
  /** Los puntos del gráfico, en su orden. */
  data: readonly T[];
  /** Cabecera de la primera columna: el eje de categorías (Mes, Año, Cliente…). */
  categoryLabel: string;
  category: (point: T) => string;
  series: readonly ChartSummarySeries<T>[];
  /** Tope de filas. Por defecto, CHART_SUMMARY_MAX_ROWS. */
  maxRows?: number;
}

export interface ChartSummary {
  headers: string[];
  /** Ya formateadas: la primera celda es la categoría y el resto, una por serie. */
  rows: string[][];
  /** Puntos del gráfico, incluidos los que no caben en `rows`. */
  total: number;
  /** Puntos que se quedan fuera por el tope. */
  omitted: number;
}

export function buildChartSummary<T>({
  data,
  categoryLabel,
  category,
  series,
  maxRows = CHART_SUMMARY_MAX_ROWS,
}: ChartSummaryInput<T>): ChartSummary {
  const shown = data.slice(0, Math.max(0, maxRows));
  return {
    headers: [categoryLabel, ...series.map((s) => s.label)],
    rows: shown.map((point) => [
      category(point),
      ...series.map((s) => {
        const value = s.value(point);
        return value === null || value === undefined || Number.isNaN(value) ? SIN_VALOR : s.format(value);
      }),
    ]),
    total: data.length,
    omitted: Math.max(0, data.length - shown.length),
  };
}

/** Título de la tabla. No repite el del gráfico: ese ya etiqueta la figura que la envuelve. */
export function chartSummaryCaption(summary: ChartSummary): string {
  if (summary.total === 0) return "Sin datos en el gráfico";
  if (summary.omitted === 0) return "Datos del gráfico";
  return `Datos del gráfico (primeras ${summary.rows.length} de ${summary.total} filas)`;
}

/** Última fila de una tabla recortada. */
export function chartSummaryOmittedText(omitted: number): string {
  return `y ${omitted} más`;
}

const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * Cantidades enteras con separador de miles. Locale fijo, como formatUSD: un
 * toLocaleString() sin argumentos depende del navegador y no coincidiría con el
 * servidor.
 */
export function formatCount(value: number): string {
  return COUNT.format(value);
}
