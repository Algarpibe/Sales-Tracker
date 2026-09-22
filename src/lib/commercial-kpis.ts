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
  { key: "tratos_nuevos", label: "Generación de tratos · clientes nuevos", period: "mensual", unit: "conteo", source: "auto" },
  { key: "tratos_existentes", label: "Generación de tratos · clientes existentes", period: "mensual", unit: "conteo", source: "auto" },
  { key: "tratos_ganados", label: "Tratos cerrados ganados", period: "mensual", unit: "conteo", source: "auto" },
  { key: "tickets_st", label: "Tickets de Servicio Técnico en plazo", period: "mensual", unit: "pct", source: "pendiente", pendingReason: "Pendiente de Zoho Desk" },
  { key: "incremento_st", label: "Incremento de ventas de Servicio Técnico", period: "trimestral", unit: "pct", source: "auto" },
  { key: "ingresos_proyectos", label: "Ingresos por proyectos", period: "semestral", unit: "usd", source: "auto" },
];

export const KPI_KEYS: string[] = COMMERCIAL_KPIS.map((k) => k.key);

// Etiqueta corta de cada unidad. No todas las metas son importes: las de tratos
// se cuentan y las de tickets y crecimiento van en porcentaje.
export const KPI_UNIT_LABEL: Record<KpiUnit, string> = {
  usd: "USD",
  conteo: "nº",
  pct: "%",
};

/**
 * Fases de Zoho CRM que cuentan como trato ganado. Va en código y no en una variable
 * de entorno porque una etiqueta de fase no expone nada del negocio, y aquí queda
 * visible y cubierta por un test. Si se renombra la fase en Zoho, este KPI se iría a
 * cero: es el precio de tenerlo fijo, y la alternativa sería configurarlo.
 *
 * El mismo literal está repetido en e2e/db/seed-hub.mjs, que no puede importar de aquí
 * por ser .mjs: si se cambia aquí, hay que cambiarlo allí.
 */
export const WON_DEAL_STAGES = ["Cerrado ganado"] as const;

const BY_KEY = new Map(COMMERCIAL_KPIS.map((k) => [k.key, k]));

export function kpiDef(key: string): KpiDef | undefined {
  return BY_KEY.get(key);
}

// Los KPIs comerciales se implantaron en 2025: ofrecer años anteriores dejaría
// elegir periodos que nunca se midieron. El resto de la app sigue con
// getYearRange() de @/lib/constants, que arranca en 2021 porque ahí sí hay ventas.
export const KPI_FIRST_YEAR = 2025;

/** Años elegibles para las metas, del actual hacia atrás hasta KPI_FIRST_YEAR. */
export function getKpiYearRange(): number[] {
  // Math.max deja al menos un año aunque el reloj del sistema fuese anterior a 2025.
  const desde = Math.max(new Date().getFullYear(), KPI_FIRST_YEAR);
  const anios: number[] = [];
  for (let y = desde; y >= KPI_FIRST_YEAR; y--) anios.push(y);
  return anios;
}

// Entradas de raw->>'salesperson_name' que no son comerciales y no deben poder
// elegirse como propietario. Los nombres viven en KPI_EXCLUDED_SALESPEOPLE y no
// en el código porque este repositorio es público.

/** "Uno, Dos" -> ["Uno", "Dos"]. Sin valor o con la cadena vacía, nadie queda excluido. */
export function parseExcludedSalespeople(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre !== "");
}

/** Zoho devuelve el nombre con tilde o sin ella según quien lo escribiera, así que
 *  la comparación ignora mayúsculas y acentos. */
export function isExcludedSalesperson(nombre: string, excluidos: string[]): boolean {
  return excluidos.some(
    (excluido) => nombre.localeCompare(excluido, undefined, { sensitivity: "base" }) === 0
  );
}
