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

export const RECORD_TYPES = [
  { value: "SALES_ORDER" as const, label: "Órdenes de Venta", short: "OV" },
  { value: "INVOICE" as const, label: "Facturas", short: "FAC" },
] as const;

export const ROLES = [
  { value: "admin" as const, label: "Administrador", description: "Control total de la empresa" },
  { value: "editor" as const, label: "Editor", description: "Puede crear y editar registros" },
  { value: "viewer" as const, label: "Visualizador", description: "Solo lectura" },
] as const;

export const SUBSCRIPTION_CATEGORIES = [
  "Marketing",
  "Development",
  "Design",
  "HR",
  "Finance",
  "Operations",
  "Communication",
  "Analytics",
  "Security",
  "Infrastructure",
  "General",
] as const;

export const BILLING_CYCLES = [
  { value: "monthly" as const, label: "Mensual" },
  { value: "annual" as const, label: "Anual" },
  { value: "quarterly" as const, label: "Trimestral" },
  { value: "one-time" as const, label: "Único" },
] as const;

export const SUBSCRIPTION_STATUSES = [
  { value: "active" as const, label: "Activa", color: "bg-green-500/10 text-green-500" },
  { value: "paused" as const, label: "Pausada", color: "bg-yellow-500/10 text-yellow-500" },
  { value: "cancelled" as const, label: "Cancelada", color: "bg-red-500/10 text-red-500" },
  { value: "trial" as const, label: "Prueba", color: "bg-blue-500/10 text-blue-500" },
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

export function formatCompactUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return formatUSD(value);
}

export function getYearRange(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 2021; y--) {
    years.push(y);
  }
  return years;
}
