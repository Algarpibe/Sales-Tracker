import type { KpiPeriod } from "@/lib/commercial-kpis";
import type { CustomerMonthRow } from "@/types/database";

/** Las dos series de doce meses en las que se parte la facturación del año. */
export interface MonthlySplit {
  nuevos: number[];
  existentes: number[];
}

const MESES = 12;

function doceCeros(): number[] {
  return new Array(MESES).fill(0);
}

/**
 * Reparte los importes mensuales en clientes nuevos y existentes. Es nuevo quien
 * tiene su primer año con ventas en el año analizado; el mapa se calcula aparte,
 * de compañía y con histórico, para que no dependa del comercial ni del
 * conmutador OV/FAC.
 */
export function splitNewExisting(
  rows: CustomerMonthRow[],
  firstYear: Map<string, number>,
  year: number
): MonthlySplit {
  const out: MonthlySplit = { nuevos: doceCeros(), existentes: doceCeros() };
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    const serie = firstYear.get(r.customer) === year ? out.nuevos : out.existentes;
    serie[idx] += r.importe;
  }
  return out;
}

/**
 * Clave con la que se cruzan las cuentas de CRM y los clientes de Books. En el hub
 * no hay `crm.accounts`, así que no existe identificador compartido y el cruce es
 * por nombre: normalizar es lo único que evita perder un cliente por una tilde o
 * por un punto de más, y un fallo aquí no se ve, solo clasifica mal.
 */
export function normalizeCustomerKey(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Tratos de una cuenta en un mes, tal y como los agrupa el hub. */
export interface DealMonthRow {
  account_name: string;
  mes: number;
  tratos: number;
}

/**
 * Reparte los tratos entre clientes nuevos y existentes. Es **existente** solo si
 * la cuenta tiene ventas en un año anterior al analizado; el resto es nuevo, tanto
 * quien nunca compró como quien compró por primera vez este año. Mientras no haya
 * compra previa, el trato sigue siendo esfuerzo de captación.
 */
export function splitDealsNewExisting(
  rows: DealMonthRow[],
  firstYear: Map<string, number>,
  year: number
): MonthlySplit {
  // El mapa llega con el nombre crudo de Books: se normaliza aquí para que los dos
  // lados del cruce usen exactamente la misma clave.
  const porClave = new Map<string, number>();
  for (const [nombre, anio] of firstYear) {
    const k = normalizeCustomerKey(nombre);
    const actual = porClave.get(k);
    if (actual === undefined || anio < actual) porClave.set(k, anio);
  }

  const out: MonthlySplit = { nuevos: doceCeros(), existentes: doceCeros() };
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    const primero = porClave.get(normalizeCustomerKey(r.account_name));
    const serie = primero !== undefined && primero < year ? out.existentes : out.nuevos;
    serie[idx] += r.tratos;
  }
  return out;
}

/** Conteos de una fase por mes, tal y como los agrupa el hub. */
export interface MonthCountRow {
  mes: number;
  tratos: number;
}

/** Reparte conteos mensuales en las doce posiciones del año. */
export function toMonthlySeries(rows: MonthCountRow[]): number[] {
  const out = doceCeros();
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    out[idx] += r.tratos;
  }
  return out;
}

const MESES_POR_CUBO: Record<KpiPeriod, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
};

/** Agrupa los doce meses en los cubos que le tocan a esa periodicidad: 12, 4 o 2. */
export function periodTotals(monthly: number[], period: KpiPeriod): number[] {
  const paso = MESES_POR_CUBO[period];
  const out: number[] = [];
  for (let i = 0; i < MESES; i += paso) {
    out.push(monthly.slice(i, i + paso).reduce((a, b) => a + b, 0));
  }
  return out;
}

/**
 * Cumplimiento en porcentaje. Devuelve null cuando no hay meta con la que comparar:
 * un cero ahí significaría "no cumplió", y lo cierto es que no se puede saber.
 */
export function attainment(value: number, target: number): number | null {
  if (target <= 0) return null;
  return (value / target) * 100;
}

/** Media simple de los periodos que sí se pudieron medir. */
export function kpiAverage(values: (number | null)[]): number | null {
  const medibles = values.filter((v): v is number => v !== null);
  if (medibles.length === 0) return null;
  return medibles.reduce((a, b) => a + b, 0) / medibles.length;
}

/**
 * Lo que ese KPI aporta al total. El cumplimiento se topa al 100 %: sin el tope,
 * un KPI muy desbordado compensaría el incumplimiento de los demás y el total
 * dejaría de decir si se están cumpliendo los objetivos.
 */
export function kpiContribution(average: number, weight: number): number {
  return (Math.min(average, 100) * weight) / 100;
}

export interface ScoreInput {
  average: number | null;
  weight: number;
}

export interface Scoreboard {
  /** Puntuación sobre 100, renormalizada. Null si no hay nada medible. */
  total: number | null;
  /** Porcentaje del peso total que sí se ha podido medir. */
  coverage: number;
}

/**
 * Puntuación total sobre los KPIs que hoy tienen datos. Se renormaliza en vez de
 * repartir sobre los 100 puntos completos: con tres de ocho KPIs esperando a que
 * el hub replique CRM y Desk, el reparto plano daría siempre un suspenso que no
 * describe nada. `coverage` dice cuánto del peso respalda esa nota.
 */
export function scoreboard(rows: ScoreInput[]): Scoreboard {
  const medibles = rows.filter((r) => r.average !== null && r.weight > 0);
  const coverage = medibles.reduce((s, r) => s + r.weight, 0);
  if (coverage === 0) return { total: null, coverage: 0 };
  const aporte = medibles.reduce((s, r) => s + kpiContribution(r.average as number, r.weight), 0);
  return { total: (aporte / coverage) * 100, coverage };
}
