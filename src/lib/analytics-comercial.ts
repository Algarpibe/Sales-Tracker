import { bucketForCategory } from "@/lib/customer-item";
import type { CustomerYearRow, ItemSalesRow } from "@/types/database";

export interface BucketMixYear {
  year: number;
  mano_obra: number;
  cr: number;
  equipos: number;
  operacion: number;
}

type MixRecord = {
  categories?: { name: string } | null;
  record_type: string;
  record_year: number;
  amount_usd: number;
};

export function buildBucketMixByYear(records: MixRecord[], tipo: string): BucketMixYear[] {
  const map = new Map<number, BucketMixYear>();
  for (const r of records) {
    if (r.record_type !== tipo) continue;
    if (r.record_year < 2021) continue;
    let row = map.get(r.record_year);
    if (!row) {
      row = { year: r.record_year, mano_obra: 0, cr: 0, equipos: 0, operacion: 0 };
      map.set(r.record_year, row);
    }
    row[bucketForCategory(r.categories?.name ?? null)] += r.amount_usd;
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

export interface ParetoRow {
  customer: string;
  ventas: number;
  cumPct: number;
}

export function buildClientPareto(rows: CustomerYearRow[]): ParetoRow[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.customer, (map.get(r.customer) ?? 0) + r.ventas);
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const grand = sorted.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  return sorted.map(([customer, ventas]) => {
    acc += ventas;
    return { customer, ventas, cumPct: grand > 0 ? (acc / grand) * 100 : 0 };
  });
}

export function topItems(rows: ItemSalesRow[], metric: "importe" | "cantidad", n: number): ItemSalesRow[] {
  return [...rows].sort((a, b) => b[metric] - a[metric] || a.nombre.localeCompare(b.nombre)).slice(0, n);
}
