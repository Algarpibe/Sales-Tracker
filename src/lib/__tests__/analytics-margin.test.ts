import { describe, it, expect } from "vitest";
import {
  deriveMargin, buildMarginByYear, buildMarginItems, buildMarginCustomers, marginSummarySeries,
} from "@/lib/analytics-margin";
import type { MarginYearRow, MarginItemRow, MarginCustomerRow } from "@/types/database";
import { buildChartSummary } from "@/lib/chart-summary";

describe("deriveMargin", () => {
  it("calcula margen y %", () => {
    expect(deriveMargin(100, 40)).toEqual({ margen: 60, margenPct: 60 });
  });
  it("ventas=0 → margenPct 0 (sin división por cero)", () => {
    expect(deriveMargin(0, 0)).toEqual({ margen: 0, margenPct: 0 });
  });
});

describe("buildMarginByYear", () => {
  it("series ordenada + totales globales", () => {
    const rows: MarginYearRow[] = [
      { year: 2023, ventas: 200, costo: 100 },
      { year: 2022, ventas: 100, costo: 60 },
    ];
    const { series, totals } = buildMarginByYear(rows);
    expect(series.map((s) => s.year)).toEqual([2022, 2023]);
    expect(series[0]).toEqual({ year: 2022, ventas: 100, costo: 60, margen: 40, margenPct: 40 });
    expect(totals).toEqual({ ventas: 300, costo: 160, margen: 140, margenPct: (140 / 300) * 100 });
  });
});

describe("buildMarginItems", () => {
  it("orden por margen desc, label=nombre", () => {
    const rows: MarginItemRow[] = [
      { item_id: "1", sku: "A", nombre: "uno", ventas: 100, costo: 90 },
      { item_id: "2", sku: "B", nombre: "dos", ventas: 200, costo: 50 },
    ];
    const p = buildMarginItems(rows);
    expect(p.map((x) => x.label)).toEqual(["dos", "uno"]);
    expect(p[0]).toEqual({ label: "dos", sku: "B", ventas: 200, costo: 50, margen: 150, margenPct: 75 });
  });
});

describe("buildMarginCustomers", () => {
  it("orden por margen desc", () => {
    const rows: MarginCustomerRow[] = [
      { customer: "X", ventas: 100, costo: 80 },
      { customer: "Y", ventas: 300, costo: 100 },
    ];
    expect(buildMarginCustomers(rows).map((x) => x.customer)).toEqual(["Y", "X"]);
  });
});

describe("marginSummarySeries (resumen accesible, FE-061)", () => {
  const punto = { year: 2025, ventas: 1000, costo: 600.5, margen: 399.5, margenPct: 39.95 };

  it("las columnas y formatos del tooltip: ventas, costo y margen en USD, margen % con un decimal", () => {
    const resumen = buildChartSummary({
      data: [punto], categoryLabel: "Año", category: (p) => String(p.year), series: marginSummarySeries(),
    });
    expect(resumen.headers).toEqual(["Año", "Ventas", "Costo", "Margen", "Margen %"]);
    expect(resumen.rows).toEqual([["2025", "$1,000", "$600.5", "$399.5", "40.0%"]]);
  });

  it("sin costo para el scatter, cuyo tooltip no lo enseña", () => {
    expect(marginSummarySeries({ costo: false }).map((s) => s.label)).toEqual(["Ventas", "Margen", "Margen %"]);
  });
});
