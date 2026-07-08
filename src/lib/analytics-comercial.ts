import { bucketForCategory } from "@/lib/customer-item";
import type { CustomerYearRow, ItemSalesRow, CustomerItemRow } from "@/types/database";

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

export interface ItemParetoRow {
  label: string;
  sku: string | null;
  importe: number;
  cumPct: number;
}

export function buildItemPareto(rows: ItemSalesRow[]): ItemParetoRow[] {
  const sorted = [...rows].sort((a, b) => b.importe - a.importe || a.nombre.localeCompare(b.nombre));
  const grand = sorted.reduce((s, r) => s + r.importe, 0);
  let acc = 0;
  return sorted.map((r) => {
    acc += r.importe;
    return { label: r.nombre, sku: r.sku, importe: r.importe, cumPct: grand > 0 ? (acc / grand) * 100 : 0 };
  });
}

export interface BrandMixRow {
  marca: string;
  importe: number;
}

export function buildBrandMix(rows: CustomerItemRow[]): BrandMixRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const marca = r.marca ?? "Sin marca";
    map.set(marca, (map.get(marca) ?? 0) + r.importe);
  }
  return [...map.entries()]
    .map(([marca, importe]) => ({ marca, importe }))
    .sort((a, b) => b.importe - a.importe || a.marca.localeCompare(b.marca));
}

export interface BucketClientRow {
  customer: string;
  mano_obra: number;
  cr: number;
  equipos: number;
  operacion: number;
  total: number;
}

export function buildBucketByClient(rows: CustomerItemRow[]): BucketClientRow[] {
  const map = new Map<string, BucketClientRow>();
  for (const r of rows) {
    let row = map.get(r.customer);
    if (!row) {
      row = { customer: r.customer, mano_obra: 0, cr: 0, equipos: 0, operacion: 0, total: 0 };
      map.set(r.customer, row);
    }
    row[bucketForCategory(r.categoria)] += r.importe;
    row.total += r.importe;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.customer.localeCompare(b.customer));
}
