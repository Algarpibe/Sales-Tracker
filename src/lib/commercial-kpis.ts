/** Periodo en el que se mide el cumplimiento de cada KPI. */
export type KpiPeriod = "mensual" | "trimestral" | "semestral";
/** Unidad del valor medido: importe, conteo de documentos o porcentaje. */
export type KpiUnit = "usd" | "conteo" | "pct";
/** "auto" se calcula desde el zoho-hub; "pendiente" todavía no tiene origen de datos. */
export type KpiSource = "auto" | "pendiente";

export interface KpiDef {
  key: string;
  label: string;
  period: KpiPeriod;
  unit: KpiUnit;
  source: KpiSource;
  /** Motivo que muestra la tabla cuando el KPI está pendiente. */
  pendingReason?: string;
}

// Catálogo fijo: la base de datos solo guarda meta y peso de cada clave, así que
// estas claves no pueden cambiar sin migrar los datos existentes.
export const COMMERCIAL_KPIS: KpiDef[] = [
  { key: "ventas_nuevos", label: "Ventas clientes nuevos", period: "trimestral", unit: "usd", source: "auto" },
  { key: "ventas_existentes", label: "Ventas clientes existentes", period: "trimestral", unit: "usd", source: "auto" },
  { key: "tratos_nuevos", label: "Generación de tratos · clientes nuevos", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tratos_existentes", label: "Generación de tratos · clientes existentes", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tratos_ganados", label: "Tratos cerrados ganados", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tickets_st", label: "Tickets de Servicio Técnico en plazo", period: "mensual", unit: "pct", source: "pendiente", pendingReason: "Pendiente de Zoho Desk" },
  { key: "incremento_st", label: "Incremento de ventas de Servicio Técnico", period: "trimestral", unit: "pct", source: "auto" },
  { key: "ingresos_proyectos", label: "Ingresos por proyectos", period: "semestral", unit: "usd", source: "pendiente", pendingReason: "Pendiente de carga manual" },
];

export const KPI_KEYS: string[] = COMMERCIAL_KPIS.map((k) => k.key);

const BY_KEY = new Map(COMMERCIAL_KPIS.map((k) => [k.key, k]));

export function kpiDef(key: string): KpiDef | undefined {
  return BY_KEY.get(key);
}
