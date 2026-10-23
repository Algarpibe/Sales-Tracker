import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "@/lib/data-client";

/**
 * DATA-043: cada lectura del cliente pide su recurso de /api/data con los mismos
 * filtros que antes recibía la Server Action, y solo esos (la ruta rechaza parámetros
 * desconocidos con 400).
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const casos: [string, () => Promise<unknown>, string][] = [
  ["fetchSalesData todo", () => api.fetchSalesData({}), "/api/data/sales"],
  [
    "fetchSalesData filtrado",
    () => api.fetchSalesData({ year: 2025, record_type: "INVOICE", month: 3, category_id: "c1", search: "ignorado" }),
    "/api/data/sales?year=2025&month=3&record_type=INVOICE&category_id=c1",
  ],
  ["fetchCategories", () => api.fetchCategories(), "/api/data/categories"],
  ["fetchTechServiceCategories", () => api.fetchTechServiceCategories(), "/api/data/tech-service-categories"],
  ["fetchMacroCategorias", () => api.fetchMacroCategorias(), "/api/data/macro-categorias"],
  ["fetchDashboardLayout", () => api.fetchDashboardLayout(), "/api/data/dashboard-layout"],
  [
    "fetchCustomerSales",
    () => api.fetchCustomerSales({ tipo: "INVOICE", desdeAnio: 2015, hastaAnio: 2026, includeHistory: true, customer: "Cliente A" }),
    "/api/data/customer-sales?tipo=INVOICE&desdeAnio=2015&hastaAnio=2026&includeHistory=true&customer=Cliente+A",
  ],
  [
    "fetchCustomerSales sin histórico",
    () => api.fetchCustomerSales({ tipo: "SALES_ORDER", desdeAnio: 2021, hastaAnio: 2026 }),
    "/api/data/customer-sales?tipo=SALES_ORDER&desdeAnio=2021&hastaAnio=2026",
  ],
  [
    "fetchCustomerItemSales",
    () => api.fetchCustomerItemSales({ tipo: "INVOICE", anio: 2025 }),
    "/api/data/customer-item?tipo=INVOICE&anio=2025",
  ],
  [
    "fetchCustomerMonthSales",
    () => api.fetchCustomerMonthSales({ tipo: "INVOICE", anio: 2025, customer: "B" }),
    "/api/data/customer-month?tipo=INVOICE&anio=2025&customer=B",
  ],
  [
    "fetchCategoryMonthSales",
    () => api.fetchCategoryMonthSales({ tipo: "SALES_ORDER", anio: 2025 }),
    "/api/data/category-month?tipo=SALES_ORDER&anio=2025",
  ],
  [
    "fetchItemSales",
    () => api.fetchItemSales({ tipo: "INVOICE", desde: "2025-01-01", hasta: "2025-12-31" }),
    "/api/data/item-sales?tipo=INVOICE&desde=2025-01-01&hasta=2025-12-31",
  ],
  ["fetchMarginByYear", () => api.fetchMarginByYear({ tipo: "INVOICE" }), "/api/data/margin-by-year?tipo=INVOICE"],
  ["fetchMarginByItem", () => api.fetchMarginByItem({ tipo: "INVOICE", anio: 2025 }), "/api/data/margin-by-item?tipo=INVOICE&anio=2025"],
  [
    "fetchMarginByCustomer",
    () => api.fetchMarginByCustomer({ tipo: "INVOICE", anio: 2025, customer: "A" }),
    "/api/data/margin-by-customer?tipo=INVOICE&anio=2025&customer=A",
  ],
  ["fetchSalespeople", () => api.fetchSalespeople(), "/api/data/salespeople"],
  ["fetchKpiTargets total", () => api.fetchKpiTargets(2025, null), "/api/data/kpi-targets?year=2025"],
  ["fetchKpiTargets comercial", () => api.fetchKpiTargets(2025, "Comercial A"), "/api/data/kpi-targets?year=2025&salesperson=Comercial+A"],
  [
    "fetchKpiMonthlySales",
    () => api.fetchKpiMonthlySales("INVOICE", 2025, null),
    "/api/data/kpi-monthly-sales?tipo=INVOICE&anio=2025",
  ],
  ["fetchKpiDealsMonthly", () => api.fetchKpiDealsMonthly(2025, "X"), "/api/data/kpi-deals?anio=2025&owner=X"],
  ["fetchKpiWonDealsMonthly", () => api.fetchKpiWonDealsMonthly(2025, null), "/api/data/kpi-won-deals?anio=2025"],
  ["fetchKpiTicketsChanges", () => api.fetchKpiTicketsChanges(2025), "/api/data/kpi-tickets?anio=2025"],
  ["fetchKpiProjectOrders", () => api.fetchKpiProjectOrders(), "/api/data/kpi-project-orders"],
];

describe("lecturas del cliente por /api/data", () => {
  it.each(casos)("%s", async (_n, run, url) => {
    await expect(run()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });
});
