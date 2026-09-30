import type { Bucket, CustomerItemRow } from "@/types/database";
import type { ExcelRow, ExcelSheet } from "@/lib/excel-types";
import { BUCKETS, BUCKET_LABELS, bucketForCategory, csvCell, emptyTotals } from "@/lib/customer-item";

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

/**
 * CSV con el mismo formato que customerItemToCsv (separador «;», importes con dos
 * decimales, cabeceras de BUCKET_LABELS), para que quien ya abre esa exportación en
 * Excel reconozca esta. El importe de cada categoría va solo en la columna de su
 * macro-categoría.
 */
export function customerCategoryToCsv(groups: CustomerCategoryGroup[], grand: Record<Bucket, number>): string {
  const header = ["Categoría", "Cantidad", ...BUCKETS.map((b) => BUCKET_LABELS[b])];
  const lines: (string | number)[][] = [header];
  for (const g of groups) {
    lines.push([g.customer, "", ...BUCKETS.map((b) => g.totals[b].toFixed(2))]);
    for (const c of g.categorias) {
      lines.push([
        c.categoria ?? SIN_CATEGORIA,
        c.cantidad,
        ...BUCKETS.map((b) => (b === c.bucket ? c.importe.toFixed(2) : "")),
      ]);
    }
  }
  lines.push(["TOTAL", "", ...BUCKETS.map((b) => grand[b].toFixed(2))]);
  return lines.map((row) => row.map(csvCell).join(";")).join("\n");
}

/** Hoja de Excel (y de «Copiar tabla») con las mismas filas que el CSV. */
export function customerCategoryToExcel(groups: CustomerCategoryGroup[], grand: Record<Bucket, number>): ExcelSheet {
  const rows: ExcelRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.customer, "", ...BUCKETS.map((b) => g.totals[b])], bold: true });
    for (const c of g.categorias) {
      rows.push({
        cells: [c.categoria ?? SIN_CATEGORIA, c.cantidad, ...BUCKETS.map((b) => (b === c.bucket ? c.importe : null))],
      });
    }
  }
  rows.push({ cells: ["TOTAL", "", ...BUCKETS.map((b) => grand[b])], bold: true });
  return {
    name: "Cliente×Categoría",
    columns: [
      { header: "Categoría", width: 30 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      ...BUCKETS.map((b) => ({ header: BUCKET_LABELS[b], width: 16, numFmt: '"$"#,##0.00' })),
    ],
    rows,
  };
}
