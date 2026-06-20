import { describe, it, expect } from "vitest";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";

const cats = [
  { id: "c1", name: "Cat One" },
  { id: "c2", name: "Cat Two" },
];

describe("computeDashboardMetrics", () => {
  it("suma OV/FAC, calcula execution_rate y avg_ticket", () => {
    const records = [
      { category_id: "c1", record_type: "SALES_ORDER", record_month: 1, record_year: 2026, amount_usd: 1000 },
      { category_id: "c1", record_type: "SALES_ORDER", record_month: 2, record_year: 2026, amount_usd: 1000 },
      { category_id: "c1", record_type: "INVOICE", record_month: 1, record_year: 2026, amount_usd: 600 },
    ];
    const m = computeDashboardMetrics(records, cats);
    expect(m.sales_orders).toBe(2000);
    expect(m.invoices).toBe(600);
    expect(m.execution_rate).toBeCloseTo(30);
    expect(m.avg_ticket).toBe(1000); // 2000 / 2 órdenes
  });

  it("backlog solo cuenta filas BACKLOG; aging suma = backlog", () => {
    const records = [
      { category_id: "c1", record_type: "SALES_ORDER", record_month: 1, record_year: 2026, amount_usd: 5000 },
      { category_id: "c1", record_type: "BACKLOG", record_month: 1, record_year: 2026, amount_usd: 300 },
      { category_id: "c2", record_type: "BACKLOG", record_month: 2, record_year: 2026, amount_usd: 100 },
    ];
    const m = computeDashboardMetrics(records, cats);
    expect(m.backlog).toBe(400);
    expect(m.aging.total).toBe(400);
    expect(m.aging.lowRisk + m.aging.mediumRisk + m.aging.highRisk).toBe(400);
  });

  it("acepta amount_usd como string (NUMERIC de Postgres)", () => {
    const records = [
      { category_id: "c1", record_type: "INVOICE", record_month: 3, record_year: 2026, amount_usd: "1234.56" },
    ];
    const m = computeDashboardMetrics(records, cats);
    expect(m.invoices).toBeCloseTo(1234.56);
  });

  it("concentración por categoría con nombre y porcentaje", () => {
    const records = [
      { category_id: "c1", record_type: "BACKLOG", record_month: 1, record_year: 2026, amount_usd: 750 },
      { category_id: "c2", record_type: "BACKLOG", record_month: 1, record_year: 2026, amount_usd: 250 },
    ];
    const m = computeDashboardMetrics(records, cats);
    const c1 = m.concentration.find((c) => c.categoryName === "Cat One");
    expect(c1?.amount).toBe(750);
    expect(c1?.percentage).toBeCloseTo(75);
  });

  it("categoría desconocida → 'Desconocida', sin categoría → 'Sin Asignar'", () => {
    const records = [
      { category_id: "zzz", record_type: "BACKLOG", record_month: 1, record_year: 2026, amount_usd: 100 },
      { category_id: "", record_type: "BACKLOG", record_month: 1, record_year: 2026, amount_usd: 100 },
    ];
    const m = computeDashboardMetrics(records, cats);
    const names = m.concentration.map((c) => c.categoryName);
    expect(names).toContain("Desconocida");
    expect(names).toContain("Sin Asignar");
  });

  it("sin registros → todo en cero, sin dividir por cero", () => {
    const m = computeDashboardMetrics([], cats);
    expect(m.sales_orders).toBe(0);
    expect(m.invoices).toBe(0);
    expect(m.backlog).toBe(0);
    expect(m.execution_rate).toBe(0);
    expect(m.avg_ticket).toBe(0); // 0 / (0||1)
    expect(m.concentration).toHaveLength(0);
    expect(m.monthly).toHaveLength(12);
  });
});
