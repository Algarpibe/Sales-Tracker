export const MONTHS = [
  { value: 1, label: "Ene", full: "Enero" },
  { value: 2, label: "Feb", full: "Febrero" },
  { value: 3, label: "Mar", full: "Marzo" },
  { value: 4, label: "Abr", full: "Abril" },
  { value: 5, label: "May", full: "Mayo" },
  { value: 6, label: "Jun", full: "Junio" },
  { value: 7, label: "Jul", full: "Julio" },
  { value: 8, label: "Ago", full: "Agosto" },
  { value: 9, label: "Sep", full: "Septiembre" },
  { value: 10, label: "Oct", full: "Octubre" },
  { value: 11, label: "Nov", full: "Noviembre" },
  { value: 12, label: "Dic", full: "Diciembre" },
] as const;

/** Etiquetas cortas de los meses ("Ene"…"Dic"), en orden. Antes copiadas en cada gráfico. */
export const MONTH_LABELS: readonly string[] = MONTHS.map((m) => m.label);

// Años de arranque de los datos (AI-082). NO son intercambiables:
// - HUB_FIRST_YEAR: primer año completo del zoho-hub. Es el inicio de los selectores de
//   año y de los gráficos (2020 es parcial y distorsiona la comparación).
// - HISTORY_FIRST_YEAR: primer año del histórico de clientes previo al hub (2015-2020).
//   Solo lo usan las vistas que incorporan ese histórico (/clientes, ficha de cliente,
//   KPI comerciales) y la validación de los filtros del hub.
export const HUB_FIRST_YEAR = 2021;
export const HISTORY_FIRST_YEAR = 2015;

export const RECORD_TYPES = [
  { value: "SALES_ORDER" as const, label: "Órdenes de Venta", short: "OV" },
  { value: "INVOICE" as const, label: "Facturas", short: "FAC" },
] as const;

export const ROLES = [
  { value: "admin" as const, label: "Administrador", description: "Control total de la empresa" },
  { value: "editor" as const, label: "Editor", description: "Puede crear y editar registros" },
  { value: "lector" as const, label: "Lector", description: "Solo lectura" },
] as const;

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// Formateadores Intl reutilizados (crear un Intl.NumberFormat por llamada es caro).
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const USD_COMPACT_INTL = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Dólares enteros: $1,235. Tooltips y tablas de las tarjetas premium. */
export function formatUSDWhole(value: number): string {
  return USD_WHOLE.format(value);
}

/** Notación compacta de Intl: $1.2K, $1.5M. Distinta de formatCompactUSD ($1.0K). */
export function formatUSDCompactIntl(value: number): string {
  return USD_COMPACT_INTL.format(value);
}

export function formatCompactUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return formatUSD(value);
}

/** Porcentaje con un decimal. Existía repetido a mano en media docena de sitios. */
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function getYearRange(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= HUB_FIRST_YEAR; y--) {
    years.push(y);
  }
  return years;
}
