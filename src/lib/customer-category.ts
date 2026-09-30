import type { Bucket, CustomerItemRow } from "@/types/database";
import { bucketForCategory, emptyTotals } from "@/lib/customer-item";

/** Texto de las ventas sin categoría en la tabla, la comparación y las exportaciones. */
export const SIN_CATEGORIA = "Sin categoría";

/** Ventas de un cliente en una categoría: la suma de todos sus artículos de esa categoría. */
export interface CustomerCategoryRow {
  categoria: string | null;
  bucket: Bucket;
  // Suma de unidades de artículos distintos: se muestra porque la sección de artículos
  // también la tiene, aunque mezcle unidades.
  cantidad: number;
  importe: number;
}

export interface CustomerCategoryGroup {
  customer: string;
  categorias: CustomerCategoryRow[];
  totals: Record<Bucket, number>;
}

/**
 * Filtra por cliente o por categoría. Trabaja sobre las filas por artículo, antes de
 * agrupar, igual que filterRows: así los totales del cliente son los de lo filtrado.
 */
export function filterCategoryRows(rows: CustomerItemRow[], search: string): CustomerItemRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.customer.toLowerCase().includes(q) || (r.categoria ?? "").toLowerCase().includes(q)
  );
}

/**
 * Agrupa las ventas por cliente y, dentro de cada cliente, por categoría.
 * - La categoría se agrupa por su nombre tal cual llega del hub; las ventas sin
 *   categoría (null) forman una sola fila, porque un Map distingue null como clave.
 * - Los totales del cliente suman cada fila en el mismo orden que groupByCustomer, para
 *   que las dos secciones den exactamente las mismas cifras, sin diferencias de redondeo.
 * - Clientes por orden alfabético y categorías por importe descendente, como
 *   groupByCustomer con los artículos.
 */
export function groupByCustomerCategory(
  rows: CustomerItemRow[],
  mapa: Map<string, Bucket>
): CustomerCategoryGroup[] {
  const porCliente = new Map<
    string,
    { totals: Record<Bucket, number>; categorias: Map<string | null, CustomerCategoryRow> }
  >();
  for (const r of rows) {
    let g = porCliente.get(r.customer);
    if (!g) {
      g = { totals: emptyTotals(), categorias: new Map() };
      porCliente.set(r.customer, g);
    }
    let c = g.categorias.get(r.categoria);
    if (!c) {
      c = { categoria: r.categoria, bucket: bucketForCategory(r.categoria, mapa), cantidad: 0, importe: 0 };
      g.categorias.set(r.categoria, c);
    }
    c.cantidad += r.cantidad;
    c.importe += r.importe;
    g.totals[c.bucket] += r.importe;
  }
  const groups: CustomerCategoryGroup[] = [...porCliente].map(([customer, g]) => ({
    customer,
    categorias: [...g.categorias.values()].sort((a, b) => b.importe - a.importe),
    totals: g.totals,
  }));
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}
