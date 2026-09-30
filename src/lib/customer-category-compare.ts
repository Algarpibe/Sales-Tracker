import type { CustomerItemRow } from "@/types/database";
import { computeDelta } from "@/lib/compare";

export interface CustomerCategoryComparePoint {
  categoria: string | null;
  importeA: number;
  importeB: number;
  deltaPct: number | null;
}

export interface CustomerCategoryCompareGroup {
  customer: string;
  categorias: CustomerCategoryComparePoint[];
  totalA: number;
  totalB: number;
  deltaPct: number | null;
}

/**
 * Compara dos años por (cliente, categoría). Entran las categorías y los clientes que
 * solo tienen ventas en uno de los dos años, con 0 en el otro: si no, una categoría que
 * se dejó de comprar desaparecería en lugar de mostrar la caída. Mismo orden que
 * buildCustomerItemCompare: importe A desc, luego importe B desc, luego nombre.
 */
export function buildCustomerCategoryCompare(
  rowsA: CustomerItemRow[],
  rowsB: CustomerItemRow[]
): CustomerCategoryCompareGroup[] {
  const byCustomer = new Map<string, Map<string | null, CustomerCategoryComparePoint>>();
  const ensure = (r: CustomerItemRow): CustomerCategoryComparePoint => {
    let categorias = byCustomer.get(r.customer);
    if (!categorias) {
      categorias = new Map();
      byCustomer.set(r.customer, categorias);
    }
    let p = categorias.get(r.categoria);
    if (!p) {
      p = { categoria: r.categoria, importeA: 0, importeB: 0, deltaPct: null };
      categorias.set(r.categoria, p);
    }
    return p;
  };
  for (const r of rowsA) ensure(r).importeA += r.importe;
  for (const r of rowsB) ensure(r).importeB += r.importe;

  const groups: CustomerCategoryCompareGroup[] = [];
  for (const [customer, categoriasMap] of byCustomer) {
    const categorias = [...categoriasMap.values()];
    for (const c of categorias) c.deltaPct = computeDelta(c.importeA, c.importeB).deltaPct;
    categorias.sort(
      (a, b) =>
        b.importeA - a.importeA ||
        b.importeB - a.importeB ||
        (a.categoria ?? "").localeCompare(b.categoria ?? "")
    );
    const totalA = categorias.reduce((s, c) => s + c.importeA, 0);
    const totalB = categorias.reduce((s, c) => s + c.importeB, 0);
    groups.push({ customer, categorias, totalA, totalB, deltaPct: computeDelta(totalA, totalB).deltaPct });
  }
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}
