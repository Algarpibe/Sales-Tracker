import type { CustomerYearRow } from "@/types/database";

export function dedupeCustomers(rows: CustomerYearRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.customer) set.add(r.customer);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function articleHref(item: { sku: string | null; nombre: string }): string {
  const q = item.sku ?? item.nombre;
  return `/articulos?q=${encodeURIComponent(q)}`;
}
