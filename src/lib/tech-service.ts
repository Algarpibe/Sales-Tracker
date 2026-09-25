import { MONTHS } from "@/lib/constants";
import type { SalesRecord, RecordType, TechServiceBucket, TechServiceCategory } from "@/types/database";
import type { TechServiceDataPoint } from "@/components/charts/tech-service-analysis";

export type { TechServiceBucket } from "@/types/database";

export type TechServiceViewMode = "MONTHLY" | "QUARTERLY" | "ANNUAL";

/**
 * Clave de react-query de las categorías con su grupo de Servicio Técnico. Cuelga de
 * ["categories"] a propósito: invalidar ["categories"] (al guardar la clasificación
 * en Configuración o al editar una categoría) refresca también esta consulta, porque
 * react-query invalida por prefijo. No reutiliza ["categories"] tal cual porque
 * getCategories() solo trae las activas, y aquí también hacen falta las inactivas.
 */
export const TECH_SERVICE_CATEGORIES_KEY = ["categories", "servicio-tecnico"] as const;

/**
 * Grupo de Servicio Técnico de cada categoría clasificada, indexado por id. Entran
 * también las inactivas, porque sus ventas históricas tienen que seguir contando al
 * comparar años. Se indexa por id y no por nombre para que renombrar una categoría no
 * la saque de su grupo sin avisar, que es lo que pasaba con las listas fijas. El
 * gráfico, su widget y el KPI construyen el mapa con esta misma función, así que
 * siempre clasifican igual.
 */
export function gruposServicioTecnico(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): Map<string, TechServiceBucket> {
  const grupos = new Map<string, TechServiceBucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como grupo.
    if (c.tech_service_bucket === "st" || c.tech_service_bucket === "cr") {
      grupos.set(String(c.id), c.tech_service_bucket);
    }
  }
  return grupos;
}

function slotsFor(viewMode: TechServiceViewMode): { label: string; months: number[] }[] {
  if (viewMode === "MONTHLY") return MONTHS.map((m) => ({ label: m.label, months: [m.value] }));
  if (viewMode === "QUARTERLY") {
    return [
      { label: "T1", months: [1, 2, 3] },
      { label: "T2", months: [4, 5, 6] },
      { label: "T3", months: [7, 8, 9] },
      { label: "T4", months: [10, 11, 12] },
    ];
  }
  return [{ label: "Anual", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }];
}

/**
 * Agrega las líneas ST (mano de obra) y C&R (consumibles) por slot temporal,
 * comparando el año A (`recordsA`) con el año B (`recordsB`) y llevando el
 * acumulado corriente de cada uno. Función pura: la usan tanto `analytics/page.tsx`
 * como el widget `TechServiceWidget` del dashboard configurable. `grupos` sale de
 * gruposServicioTecnico(): una categoría que no está en el mapa no cuenta.
 */
export function buildTechServiceData(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType,
  viewMode: TechServiceViewMode,
): TechServiceDataPoint[] {
  const slots = slotsFor(viewMode);
  let acumA = 0;
  let acumB = 0;

  const sum = (records: SalesRecord[], months: number[]) => {
    let st = 0;
    let cr = 0;
    for (const r of records) {
      if (r.record_type !== recordType) continue;
      if (!months.includes(Number(r.record_month))) continue;
      const grupo = grupos.get(r.category_id);
      const amt = Number(r.amount_usd);
      if (grupo === "st") st += amt;
      else if (grupo === "cr") cr += amt;
    }
    return { st, cr };
  };

  return slots.map((slot) => {
    const a = sum(recordsA, slot.months);
    const b = sum(recordsB, slot.months);
    const totalA = a.st + a.cr;
    const totalB = b.st + b.cr;
    acumA += totalA;
    acumB += totalB;
    return {
      label: slot.label,
      st: a.st, cr: a.cr, total: totalA, acum: acumA,
      st_prev: b.st, cr_prev: b.cr, total_prev: totalB, acum_prev: acumB,
    };
  });
}

const TRIMESTRES = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
];

/**
 * Variación interanual en porcentaje. Misma fórmula y mismo convenio que usa el
 * Análisis de Servicio Técnico para "VAR. ACUMULADA VS AÑO ANTERIOR": sin base con la
 * que comparar pero con valor este año es un crecimiento del 100 %, no una división
 * por cero; sin valor en ninguno de los dos años no hay variación que calcular.
 */
export function yoy(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : null;
  return ((actual - anterior) / anterior) * 100;
}

/**
 * Ventas de Servicio Técnico en un periodo: ST (mano de obra) más C&R (consumibles),
 * el mismo total que suma buildTechServiceData con el mismo mapa de grupos. Se
 * exporta para el test de coherencia entre el gráfico y el KPI.
 */
export function acumuladoServicioTecnico(
  records: SalesRecord[],
  meses: number[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType
): number {
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    if (!meses.includes(Number(r.record_month))) continue;
    if (grupos.has(r.category_id)) total += Number(r.amount_usd);
  }
  return total;
}

/**
 * Variación acumulada de las ventas de Servicio Técnico (ST + C&R) frente al mismo
 * periodo del año anterior, trimestre a trimestre. Es la misma cifra que la fila
 * "VAR. ACUMULADA VS AÑO ANTERIOR" del Análisis de Servicio Técnico para el mismo tipo
 * de registro y los mismos dos años: comparten yoy() y la misma clasificación
 * guardada. Es un KPI de compañía: estas líneas no llevan comercial asignado, así que
 * no se filtra por vendedor.
 */
export function stGrowthByQuarter(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType
): (number | null)[] {
  const out: (number | null)[] = [];
  let acumMeses: number[] = [];
  for (const trimestre of TRIMESTRES) {
    acumMeses = [...acumMeses, ...trimestre];
    const a = acumuladoServicioTecnico(recordsA, acumMeses, grupos, recordType);
    const b = acumuladoServicioTecnico(recordsB, acumMeses, grupos, recordType);
    out.push(yoy(a, b));
  }
  return out;
}
