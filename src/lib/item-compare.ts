import type { ItemSalesRow } from "@/types/database";
import { computeDelta } from "@/lib/compare";

export interface ItemCompareRow {
  item_id: string;
  sku: string | null;
  nombre: string;
  categoria: string | null;
  importeA: number;
  importeB: number;
  deltaPct: number | null;
}

export function buildItemCompare(rowsA: ItemSalesRow[], rowsB: ItemSalesRow[]): ItemCompareRow[] {
  const map = new Map<string, ItemCompareRow>();
  const ensure = (r: ItemSalesRow): ItemCompareRow => {
    let row = map.get(r.item_id);
    if (!row) {
      row = { item_id: r.item_id, sku: r.sku, nombre: r.nombre, categoria: r.categoria, importeA: 0, importeB: 0, deltaPct: null };
      map.set(r.item_id, row);
    }
    return row;
  };
  for (const r of rowsA) ensure(r).importeA += r.importe;
  for (const r of rowsB) ensure(r).importeB += r.importe;
  for (const row of map.values()) row.deltaPct = computeDelta(row.importeA, row.importeB).deltaPct;
  return [...map.values()];
}
