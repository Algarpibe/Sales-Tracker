import type { CustomerYearRow } from "@/types/database";

export interface CustomerMatrixRow {
  customer: string;
  byYear: Record<number, number>;
  total: number;
}

export function buildCustomerMatrix(rows: CustomerYearRow[]): CustomerMatrixRow[] {
  const map = new Map<string, CustomerMatrixRow>();
  for (const r of rows) {
    let m = map.get(r.customer);
    if (!m) {
      m = { customer: r.customer, byYear: {}, total: 0 };
      map.set(r.customer, m);
    }
    m.byYear[r.year] = (m.byYear[r.year] ?? 0) + r.ventas;
    m.total += r.ventas;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function computeColumnTotals(
  matrix: CustomerMatrixRow[],
  years: number[]
): { byYear: Record<number, number>; grand: number } {
  const byYear: Record<number, number> = {};
  for (const y of years) byYear[y] = 0;
  let grand = 0;
  for (const row of matrix) {
    for (const y of years) byYear[y] += row.byYear[y] ?? 0;
    grand += row.total;
  }
  return { byYear, grand };
}

export type CustomerSortKey = "customer" | "total" | number; // number = año
export type CustomerSortDir = "asc" | "desc";

// Ordena la matriz por columna (nombre, un año concreto, o total). No muta la entrada.
export function sortCustomerMatrix(
  matrix: CustomerMatrixRow[],
  sortKey: CustomerSortKey,
  sortDir: CustomerSortDir
): CustomerMatrixRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  const val = (r: CustomerMatrixRow): string | number => {
    if (sortKey === "customer") return r.customer.toLowerCase();
    if (sortKey === "total") return r.total;
    return r.byYear[sortKey] ?? 0;
  };
  return [...matrix].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function filterCustomers(matrix: CustomerMatrixRow[], search: string): CustomerMatrixRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return matrix;
  return matrix.filter((r) => r.customer.toLowerCase().includes(q));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customerMatrixToCsv(
  matrix: CustomerMatrixRow[],
  years: number[],
  grand: number
): string {
  const pct = (n: number) => (grand > 0 ? `${((n / grand) * 100).toFixed(1)}%` : "0%");
  const header = ["Cliente", ...years.map(String), "Total", "%"];
  const body = matrix.map((r) => [
    r.customer,
    ...years.map((y) => (r.byYear[y] ?? 0).toFixed(2)),
    r.total.toFixed(2),
    pct(r.total),
  ]);
  const totals = computeColumnTotals(matrix, years);
  const totalRow = [
    "TOTAL",
    ...years.map((y) => totals.byYear[y].toFixed(2)),
    totals.grand.toFixed(2),
    pct(totals.grand),
  ];
  return [header, ...body, totalRow].map((row) => row.map(csvCell).join(";")).join("\n");
}
