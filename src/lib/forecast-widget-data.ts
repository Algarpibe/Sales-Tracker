import type { SalesRecord, RecordType } from "@/types/database";

/**
 * Serie de 12 posiciones (Ene..Dic) con el importe del año y tipo indicados.
 * Alimenta `computeForecast` desde un conjunto de registros de todos los años.
 */
export function monthlyTotals(records: SalesRecord[], year: number, recordType: RecordType): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    if (Number(r.record_year) !== year) continue;
    const m = Number(r.record_month);
    if (m >= 1 && m <= 12) out[m - 1] += Number(r.amount_usd);
  }
  return out;
}

/** Una fila de 12 meses por año, en el mismo orden en que se piden los años. */
export function historicalMatrix(records: SalesRecord[], years: number[], recordType: RecordType): number[][] {
  return years.map((y) => monthlyTotals(records, y, recordType));
}
