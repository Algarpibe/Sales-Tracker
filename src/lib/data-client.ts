import { fetchJson } from "@/lib/fetch-json";
// Solo tipos: data-api.ts es de servidor (server-only) y no entra en el bundle.
import type { DataResult } from "@/lib/data-api";
import type {
  CategoryMonthFilters,
  CustomerItemFilters,
  CustomerMonthFilters,
  CustomerSalesFilters,
  ItemSalesFilters,
  MarginByYearFilters,
  MarginCustomerFilters,
  MarginFilters,
  RecordType,
  SalesFilters,
} from "@/types/database";

// Lecturas del navegador por GET /api/data (DATA-043): mismos filtros y mismo resultado
// que las Server Actions a las que sustituyen en los queryFn, pero en paralelo. Se
// envían solo los filtros que la ruta conoce: cualquier otro sería un 400.

export function fetchSalesData(f: SalesFilters) {
  return fetchJson<DataResult<"sales">>("sales", {
    year: f.year,
    month: f.month,
    record_type: f.record_type,
    category_id: f.category_id,
  });
}

export function fetchCategories() {
  return fetchJson<DataResult<"categories">>("categories");
}

export function fetchTechServiceCategories() {
  return fetchJson<DataResult<"tech-service-categories">>("tech-service-categories");
}

export function fetchMacroCategorias() {
  return fetchJson<DataResult<"macro-categorias">>("macro-categorias");
}

export function fetchDashboardLayout() {
  return fetchJson<DataResult<"dashboard-layout">>("dashboard-layout");
}

export function fetchCustomerSales(f: CustomerSalesFilters) {
  return fetchJson<DataResult<"customer-sales">>("customer-sales", {
    tipo: f.tipo,
    desdeAnio: f.desdeAnio,
    hastaAnio: f.hastaAnio,
    includeHistory: f.includeHistory,
    customer: f.customer,
  });
}

export function fetchCustomerItemSales(f: CustomerItemFilters) {
  return fetchJson<DataResult<"customer-item">>("customer-item", { tipo: f.tipo, anio: f.anio, customer: f.customer });
}

export function fetchCustomerMonthSales(f: CustomerMonthFilters) {
  return fetchJson<DataResult<"customer-month">>("customer-month", { tipo: f.tipo, anio: f.anio, customer: f.customer });
}

export function fetchCategoryMonthSales(f: CategoryMonthFilters) {
  return fetchJson<DataResult<"category-month">>("category-month", { tipo: f.tipo, anio: f.anio });
}

export function fetchItemSales(f: ItemSalesFilters) {
  return fetchJson<DataResult<"item-sales">>("item-sales", { tipo: f.tipo, desde: f.desde, hasta: f.hasta });
}

export function fetchMarginByYear(f: MarginByYearFilters) {
  return fetchJson<DataResult<"margin-by-year">>("margin-by-year", { tipo: f.tipo });
}

export function fetchMarginByItem(f: MarginFilters) {
  return fetchJson<DataResult<"margin-by-item">>("margin-by-item", { tipo: f.tipo, anio: f.anio });
}

export function fetchMarginByCustomer(f: MarginCustomerFilters) {
  return fetchJson<DataResult<"margin-by-customer">>("margin-by-customer", {
    tipo: f.tipo,
    anio: f.anio,
    customer: f.customer,
  });
}

export function fetchSalespeople() {
  return fetchJson<DataResult<"salespeople">>("salespeople");
}

/** `salesperson` null = metas del total de la compañía. */
export function fetchKpiTargets(year: number, salesperson: string | null) {
  return fetchJson<DataResult<"kpi-targets">>("kpi-targets", { year, salesperson });
}

/** `owner` null = total de la compañía. */
export function fetchKpiMonthlySales(tipo: RecordType, anio: number, owner: string | null) {
  return fetchJson<DataResult<"kpi-monthly-sales">>("kpi-monthly-sales", { tipo, anio, owner });
}

export function fetchKpiDealsMonthly(anio: number, owner: string | null) {
  return fetchJson<DataResult<"kpi-deals">>("kpi-deals", { anio, owner });
}

export function fetchKpiWonDealsMonthly(anio: number, owner: string | null) {
  return fetchJson<DataResult<"kpi-won-deals">>("kpi-won-deals", { anio, owner });
}

export function fetchKpiTicketsChanges(anio: number) {
  return fetchJson<DataResult<"kpi-tickets">>("kpi-tickets", { anio });
}

export function fetchKpiProjectOrders() {
  return fetchJson<DataResult<"kpi-project-orders">>("kpi-project-orders");
}
