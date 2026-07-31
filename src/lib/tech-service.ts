import { MONTHS } from "@/lib/constants";
import type { SalesRecord, RecordType } from "@/types/database";
import type { TechServiceDataPoint } from "@/components/charts/tech-service-analysis";

export type TechServiceViewMode = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export const ST_CATEGORIES = [
  'Alquileres', 'CAL CO', 'CAL NOx', 'CAL O3', 'CAL PM', 'CAL SO2', 'ST',
  'ST APMA', 'ST APNA', 'ST APOA', 'ST APSA', 'ST EDM 180'
];

export const CR_CATEGORIES = [
  'C&R AP Series', 'C&R APMA-370', 'C&R APNA-370', 'C&R APOA-370', 'C&R APSA-370',
  'C&R D-R 290', 'C&R EDM 180', 'C&R ENDA Series', 'C&R Enviro', 'C&R OCMA-500',
  'C&R PG Series', 'C&R Series 6103', 'C&R Series 7000', 'C&R Shelter', 'C&R U-50 Series'
];

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
 * como el widget `TechServiceWidget` del dashboard configurable.
 */
export function buildTechServiceData(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  catMap: Map<string, string>,
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
      const catName = catMap.get(r.category_id);
      const amt = Number(r.amount_usd);
      if (catName && ST_CATEGORIES.includes(catName)) st += amt;
      else if (catName && CR_CATEGORIES.includes(catName)) cr += amt;
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
