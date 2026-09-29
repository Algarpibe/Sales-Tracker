import type { Bucket, CustomerItemRow, MacroCategoria } from "@/types/database";
import type { ExcelSheet, ExcelRow } from "@/lib/excel-types";

// Bucket vive en types/database porque también tipa la columna macro_categoria. Se
// reexporta aquí para que los consumidores lo sigan importando de donde siempre.
export type { Bucket } from "@/types/database";

/** Las cuatro macro-categorías, en el orden de columnas, series, leyendas y grupos. */
export const BUCKETS: readonly Bucket[] = ["mano_obra", "cr", "equipos", "operacion"];

/**
 * Nombre de cada macro-categoría en la tarjeta de Configuración, los gráficos y las
 * exportaciones. Está en un solo sitio para que los nombres no vuelvan a divergir entre
 * pantallas.
 */
export const BUCKET_LABELS: Record<Bucket, string> = {
  mano_obra: "Mano de obra",
  cr: "Consumos y repuestos",
  equipos: "Equipos",
  operacion: "Operaciones",
};

/**
 * Clave de react-query de las categorías con su macro-categoría. Cuelga de
 * ["categories"] a propósito: al guardar en Configuración se invalida ["categories"] y,
 * por prefijo, se refrescan todos los gráficos que clasifican. No reutiliza
 * ["categories"] tal cual porque getCategories() solo trae las activas.
 */
export const MACRO_CATEGORIAS_KEY = ["categories", "macro-categorias"] as const;

export interface CustomerGroup {
  customer: string;
  items: CustomerItemRow[];
  totals: Record<Bucket, number>;
}

/**
 * Macro-categoría de cada categoría marcada, indexada por nombre en minúsculas.
 * - Va por nombre porque las ventas llegan del hub con el nombre de la categoría, no
 *   con su id.
 * - Va en minúsculas porque getSalesData ya casa así los nombres del hub con los de la
 *   app; si no, un gráfico clasificaría distinto que otro.
 * - Entran las inactivas: sus ventas de años anteriores tienen que seguir en su
 *   macro-categoría.
 * - Las no marcadas no entran, y bucketForCategory las cuenta como Equipos.
 */
export function mapaMacroCategorias(
  categorias: Pick<MacroCategoria, "name" | "macro_categoria">[]
): Map<string, Bucket> {
  const mapa = new Map<string, Bucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como macro-categoría.
    if (c.macro_categoria !== null && (BUCKETS as readonly string[]).includes(c.macro_categoria)) {
      mapa.set(c.name.toLowerCase(), c.macro_categoria);
    }
  }
  return mapa;
}

export function bucketForCategory(categoria: string | null): Bucket {
  if (categoria) {
    if (categoria.startsWith("C&R ")) return "cr";
    if (categoria.startsWith("CAL ") || categoria === "ST" || categoria.startsWith("ST ") || categoria === "Alquileres") {
      return "mano_obra";
    }
    if (categoria === "Operación de Redes" || categoria === "Consultoría") return "operacion";
  }
  return "equipos";
}

export function filterRows(rows: CustomerItemRow[], search: string): CustomerItemRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.customer.toLowerCase().includes(q) ||
      (r.sku ?? "").toLowerCase().includes(q) ||
      r.nombre.toLowerCase().includes(q)
  );
}

function emptyTotals(): Record<Bucket, number> {
  return { mano_obra: 0, cr: 0, equipos: 0, operacion: 0 };
}

export function groupByCustomer(rows: CustomerItemRow[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const r of rows) {
    let g = map.get(r.customer);
    if (!g) {
      g = { customer: r.customer, items: [], totals: emptyTotals() };
      map.set(r.customer, g);
    }
    g.items.push(r);
    g.totals[bucketForCategory(r.categoria)] += r.importe;
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => b.importe - a.importe);
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}

export function computeGrandTotals(groups: CustomerGroup[]): Record<Bucket, number> {
  const t = emptyTotals();
  for (const g of groups) {
    t.mano_obra += g.totals.mano_obra;
    t.cr += g.totals.cr;
    t.equipos += g.totals.equipos;
    t.operacion += g.totals.operacion;
  }
  return t;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customerItemToCsv(groups: CustomerGroup[], grand: Record<Bucket, number>): string {
  // Las cabeceras salen de BUCKET_LABELS para que la exportación diga lo mismo que la pantalla.
  const header = ["SKU", "Marca", "Nombre", "Categoría", "Cantidad", ...BUCKETS.map((b) => BUCKET_LABELS[b])];
  const lines: (string | number)[][] = [header];
  for (const g of groups) {
    lines.push(["", "", "", "", "", g.totals.mano_obra.toFixed(2), g.totals.cr.toFixed(2), g.totals.equipos.toFixed(2), g.totals.operacion.toFixed(2)]);
    lines[lines.length - 1][0] = g.customer;
    for (const it of g.items) {
      const b = bucketForCategory(it.categoria);
      lines.push([
        it.sku ?? "",
        it.marca ?? "",
        it.nombre,
        it.categoria ?? "Sin categoría",
        it.cantidad,
        b === "mano_obra" ? it.importe.toFixed(2) : "",
        b === "cr" ? it.importe.toFixed(2) : "",
        b === "equipos" ? it.importe.toFixed(2) : "",
        b === "operacion" ? it.importe.toFixed(2) : "",
      ]);
    }
  }
  lines.push(["TOTAL", "", "", "", "", grand.mano_obra.toFixed(2), grand.cr.toFixed(2), grand.equipos.toFixed(2), grand.operacion.toFixed(2)]);
  return lines.map((row) => row.map(csvCell).join(";")).join("\n");
}

export function customerItemToExcel(groups: CustomerGroup[], grand: Record<Bucket, number>): ExcelSheet {
  const rows: ExcelRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.customer, "", "", "", "", g.totals.mano_obra, g.totals.cr, g.totals.equipos, g.totals.operacion], bold: true });
    for (const it of g.items) {
      const b = bucketForCategory(it.categoria);
      rows.push({
        cells: [
          it.sku ?? "", it.marca ?? "", it.nombre, it.categoria ?? "Sin categoría", it.cantidad,
          b === "mano_obra" ? it.importe : null,
          b === "cr" ? it.importe : null,
          b === "equipos" ? it.importe : null,
          b === "operacion" ? it.importe : null,
        ],
      });
    }
  }
  rows.push({ cells: ["TOTAL", "", "", "", "", grand.mano_obra, grand.cr, grand.equipos, grand.operacion], bold: true });
  return {
    name: "Cliente×Artículo",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Marca", width: 18 },
      { header: "Nombre", width: 40 },
      { header: "Categoría", width: 20 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      ...BUCKETS.map((b) => ({ header: BUCKET_LABELS[b], width: 16, numFmt: '"$"#,##0.00' })),
    ],
    rows,
  };
}
