import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Las lecturas del hub validan años, rangos y búsquedas ANTES de consultar: un
 * filtro absurdo no debe llegar a Postgres. Se sustituyen la sesión, la BD de la app
 * y el pool del hub por dobles; las funciones de src/db/hub-*.ts corren tal cual.
 */

const state = vi.hoisted(() => ({
  queries: [] as { sql: string; params?: unknown[] }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireApproved: async () => ({ profile: { id: "u1", company_id: "c1", role: "admin" } }),
  requireRole: async () => ({ profile: { id: "u1", company_id: "c1", role: "admin" } }),
}));
vi.mock("@/db/hub", () => ({
  hubEnabled: () => true,
  getHubPool: () => ({
    query: async (sql: string, params?: unknown[]) => {
      state.queries.push({ sql, params });
      return { rows: [] };
    },
  }),
}));

import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getCustomerMonthSales } from "@/actions/customer-month-actions";
import { getCategoryMonthSales } from "@/actions/category-month-actions";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getItemSales } from "@/actions/item-sales-actions";
import { getMarginByCustomer, getMarginByItem } from "@/actions/margin-actions";
import {
  getKpiDealsMonthly,
  getKpiMonthlySales,
  getKpiTicketsChanges,
  getKpiWonDealsMonthly,
  searchSalesOrdersForProjects,
} from "@/actions/kpi-actions";

const year = new Date().getFullYear();
const ZOD = { name: "ZodError" };

beforeEach(() => {
  state.queries = [];
});

describe("lecturas del hub por año", () => {
  const porAnio: [string, (anio: number) => Promise<unknown>][] = [
    ["getCustomerMonthSales", (anio) => getCustomerMonthSales({ tipo: "INVOICE", anio })],
    ["getCategoryMonthSales", (anio) => getCategoryMonthSales({ tipo: "INVOICE", anio })],
    ["getCustomerItemSales", (anio) => getCustomerItemSales({ tipo: "INVOICE", anio })],
    ["getMarginByItem", (anio) => getMarginByItem({ tipo: "INVOICE", anio })],
    ["getMarginByCustomer", (anio) => getMarginByCustomer({ tipo: "INVOICE", anio })],
    ["getKpiMonthlySales", (anio) => getKpiMonthlySales("INVOICE", anio, null)],
    ["getKpiDealsMonthly", (anio) => getKpiDealsMonthly(anio, null)],
    ["getKpiWonDealsMonthly", (anio) => getKpiWonDealsMonthly(anio, null)],
    ["getKpiTicketsChanges", (anio) => getKpiTicketsChanges(anio)],
  ];

  it.each(porAnio)("%s consulta con un año válido", async (_n, fn) => {
    await expect(fn(year)).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it.each(porAnio)("%s rechaza un año fuera de rango sin consultar el hub", async (_n, fn) => {
    await expect(fn(2014)).rejects.toMatchObject(ZOD);
    await expect(fn(year + 2)).rejects.toMatchObject(ZOD);
    await expect(fn(2025.5)).rejects.toMatchObject(ZOD);
    expect(state.queries).toHaveLength(0);
  });
});

describe("getCustomerSales (rango de años)", () => {
  it("consulta con un rango válido", async () => {
    await expect(getCustomerSales({ tipo: "INVOICE", desdeAnio: 2021, hastaAnio: year })).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it("rechaza desde > hasta y años fuera de rango sin consultar el hub", async () => {
    await expect(getCustomerSales({ tipo: "INVOICE", desdeAnio: 2024, hastaAnio: 2022 })).rejects.toMatchObject(ZOD);
    await expect(getCustomerSales({ tipo: "INVOICE", desdeAnio: 1, hastaAnio: 2022 })).rejects.toMatchObject(ZOD);
    await expect(getCustomerSales({ tipo: "INVOICE", desdeAnio: 2021, hastaAnio: 1e9 })).rejects.toMatchObject(ZOD);
    expect(state.queries).toHaveLength(0);
  });
});

describe("getItemSales (rango de fechas)", () => {
  it("consulta con un rango válido", async () => {
    await expect(getItemSales({ tipo: "INVOICE", desde: "2021-01-01", hasta: `${year}-12-31` })).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it("rechaza fechas inválidas o invertidas sin consultar el hub", async () => {
    await expect(getItemSales({ tipo: "INVOICE", desde: "2025-13-01", hasta: "2025-12-31" })).rejects.toMatchObject(ZOD);
    await expect(getItemSales({ tipo: "INVOICE", desde: "1900-01-01", hasta: "2025-12-31" })).rejects.toMatchObject(ZOD);
    await expect(getItemSales({ tipo: "INVOICE", desde: "2025-06-01", hasta: "2025-01-01" })).rejects.toMatchObject(ZOD);
    expect(state.queries).toHaveLength(0);
  });
});

describe("searchSalesOrdersForProjects", () => {
  it("rechaza una búsqueda de más de 100 caracteres sin consultar el hub", async () => {
    await expect(searchSalesOrdersForProjects("a".repeat(101), year)).rejects.toMatchObject(ZOD);
    expect(state.queries).toHaveLength(0);
  });

  it("rechaza un año fuera de rango sin consultar el hub", async () => {
    await expect(searchSalesOrdersForProjects("acme", 2014)).rejects.toMatchObject(ZOD);
    expect(state.queries).toHaveLength(0);
  });

  it("escapa los comodines de ILIKE: % y _ buscan el carácter literal", async () => {
    await searchSalesOrdersForProjects("50%_a\\b", year);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].params).toEqual(["%50\\%\\_a\\\\b%", year]);
  });
});
