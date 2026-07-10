import type { CustomerSortKey, CustomerSortDir } from "@/lib/customer-sales";

export interface ClientesViewState {
  tipo: "SALES_ORDER" | "INVOICE";
  desdeAnio: number;
  hastaAnio: number;
  search: string;
  sortKey: CustomerSortKey;
  sortDir: CustomerSortDir;
  compareA: number;
  compareB: number;
  onlyFav: boolean;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function parseClientesState(raw: unknown): ClientesViewState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const okTipo = s.tipo === "SALES_ORDER" || s.tipo === "INVOICE";
  const okSortKey = s.sortKey === "customer" || s.sortKey === "total" || s.sortKey === "delta" || isNum(s.sortKey);
  const okDir = s.sortDir === "asc" || s.sortDir === "desc";
  if (
    !okTipo || !isNum(s.desdeAnio) || !isNum(s.hastaAnio) || typeof s.search !== "string" ||
    !okSortKey || !okDir || !isNum(s.compareA) || !isNum(s.compareB) || typeof s.onlyFav !== "boolean"
  ) {
    return null;
  }
  return {
    tipo: s.tipo as "SALES_ORDER" | "INVOICE",
    desdeAnio: s.desdeAnio as number,
    hastaAnio: s.hastaAnio as number,
    search: s.search as string,
    sortKey: s.sortKey as CustomerSortKey,
    sortDir: s.sortDir as CustomerSortDir,
    compareA: s.compareA as number,
    compareB: s.compareB as number,
    onlyFav: s.onlyFav as boolean,
  };
}
