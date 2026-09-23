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
 * ¿La venta de este cliente cuenta como de cliente nuevo ese año? Compara por el
 * nombre crudo de Books, que es la clave del mapa de antigüedad.
 *
 * Quien no aparece en el mapa nunca ha tenido una factura: no puede tener un
 * primer año de factura, pero eso no lo hace "existente" por descarte. Si aun
 * así tiene importe este año (por ejemplo una orden de venta todavía sin
 * facturar), solo puede tratarse de su primera compra. Bug real detectado en
 * producción: un cliente sin ninguna factura salía como cliente existente.
 */
export function esVentaDeClienteNuevo(
  customer: string,
  firstYear: Map<string, number>,
  year: number
): boolean {
  const primero = firstYear.get(customer);
  return primero === undefined || primero >= year;
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
    const serie = esVentaDeClienteNuevo(r.customer, firstYear, year) ? out.nuevos : out.existentes;
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
/**
 * Primer año de compra por clave normalizada. El mapa llega con el nombre crudo de
 * Books: se normaliza aquí para que el cruce con las cuentas de CRM use exactamente
 * la misma clave. Si dos nombres crudos normalizan a la misma clave, se queda con
 * el año más antiguo.
 */
function firstYearPorClave(firstYear: Map<string, number>): Map<string, number> {
  const porClave = new Map<string, number>();
  for (const [nombre, anio] of firstYear) {
    const k = normalizeCustomerKey(nombre);
    const actual = porClave.get(k);
    if (actual === undefined || anio < actual) porClave.set(k, anio);
  }
  return porClave;
}

/**
 * ¿El trato de esta cuenta cuenta como de cliente nuevo ese año? Criterio distinto
 * al de ventas a propósito: aquí es existente **solo** si compró en un año anterior,
 * y quien nunca compró es nuevo. Además cruza por clave normalizada, porque el
 * nombre viene de CRM y no de Books.
 */
export function esTratoDeClienteNuevo(
  account: string,
  firstYear: Map<string, number>,
  year: number
): boolean {
  const porClave = firstYearPorClave(firstYear);
  const primero = porClave.get(normalizeCustomerKey(account));
  return primero === undefined || primero >= year;
}

export function splitDealsNewExisting(
  rows: DealMonthRow[],
  firstYear: Map<string, number>,
  year: number
): MonthlySplit {
  const out: MonthlySplit = { nuevos: doceCeros(), existentes: doceCeros() };
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    const serie = esTratoDeClienteNuevo(r.account_name, firstYear, year) ? out.nuevos : out.existentes;
    serie[idx] += r.tratos;
  }
  return out;
}

/** Una línea del detalle de una celda. */
export interface BreakdownRow {
  nombre: string;
  valor: number;
}

/** Fila de origen ya clasificada, tal y como la arma la tabla. */
export interface BreakdownInput extends BreakdownRow {
  mes: number;
  nuevo: boolean;
}

/**
 * Qué compone la cifra de un mes: agrupa por nombre, suma y ordena de mayor a
 * menor. La clasificación llega hecha, con los mismos predicados que usa el
 * reparto, para que el detalle no pueda decir algo distinto que la celda.
 */
export function monthBreakdown(
  rows: BreakdownInput[],
  mes: number,
  serie: "nuevos" | "existentes"
): BreakdownRow[] {
  const quiero = serie === "nuevos";
  const porNombre = new Map<string, number>();
  for (const r of rows) {
    if (r.mes !== mes || r.nuevo !== quiero) continue;
    porNombre.set(r.nombre, (porNombre.get(r.nombre) ?? 0) + r.valor);
  }
  return [...porNombre.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);
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

export interface MonthAmountRow { mes: number; importe: number; }

/** Suma un importe por mes. Misma forma que toMonthlySeries, pero con dinero en
 *  vez de conteos: los nombres de campo lo dicen porque no son lo mismo. */
export function sumByMonth(rows: MonthAmountRow[]): number[] {
  const out = doceCeros();
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    out[idx] += r.importe;
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
