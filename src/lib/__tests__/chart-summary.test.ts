import { describe, it, expect } from "vitest";
import {
  CHART_SUMMARY_MAX_ROWS,
  buildChartSummary,
  chartSummaryCaption,
  formatCount,
} from "@/lib/chart-summary";
import { formatPct, formatUSD } from "@/lib/constants";

type Punto = { mes: string; ventas: number; pct?: number | null };

const SERIE_VENTAS = { label: "Ventas", value: (p: Punto) => p.ventas, format: formatUSD };

describe("buildChartSummary", () => {
  it("una fila por punto: la categoría y cada serie con su formateador", () => {
    const resumen = buildChartSummary<Punto>({
      data: [
        { mes: "Ene", ventas: 1234.5, pct: 12.345 },
        { mes: "Feb", ventas: 0, pct: 0 },
      ],
      categoryLabel: "Mes",
      category: (p) => p.mes,
      series: [SERIE_VENTAS, { label: "Margen %", value: (p) => p.pct, format: (v) => formatPct(v) }],
    });

    expect(resumen.headers).toEqual(["Mes", "Ventas", "Margen %"]);
    expect(resumen.rows).toEqual([
      ["Ene", "$1,234.5", "12.3%"],
      ["Feb", "$0", "0.0%"],
    ]);
    expect(resumen.total).toBe(2);
    expect(resumen.omitted).toBe(0);
  });

  it("sin valor (null, undefined o NaN) pinta una raya, no un cero", () => {
    const resumen = buildChartSummary<Punto>({
      data: [
        { mes: "Ene", ventas: Number.NaN, pct: null },
        { mes: "Feb", ventas: 5 },
      ],
      categoryLabel: "Mes",
      category: (p) => p.mes,
      series: [SERIE_VENTAS, { label: "Margen %", value: (p) => p.pct, format: (v) => formatPct(v) }],
    });

    expect(resumen.rows).toEqual([
      ["Ene", "—", "—"],
      ["Feb", "$5", "—"],
    ]);
  });

  it(`por defecto se queda con las ${CHART_SUMMARY_MAX_ROWS} primeras filas y cuenta el resto`, () => {
    const data = Array.from({ length: CHART_SUMMARY_MAX_ROWS + 7 }, (_, i) => ({ mes: `P${i + 1}`, ventas: i }));
    const resumen = buildChartSummary<Punto>({
      data,
      categoryLabel: "Punto",
      category: (p) => p.mes,
      series: [SERIE_VENTAS],
    });

    expect(resumen.rows).toHaveLength(CHART_SUMMARY_MAX_ROWS);
    expect(resumen.rows[0][0]).toBe("P1");
    expect(resumen.rows.at(-1)?.[0]).toBe(`P${CHART_SUMMARY_MAX_ROWS}`);
    expect(resumen.total).toBe(CHART_SUMMARY_MAX_ROWS + 7);
    expect(resumen.omitted).toBe(7);
  });

  it("el tope se puede ajustar por gráfico", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({ mes: `P${i + 1}`, ventas: i }));
    const resumen = buildChartSummary<Punto>({
      data,
      categoryLabel: "Punto",
      category: (p) => p.mes,
      series: [SERIE_VENTAS],
      maxRows: 3,
    });

    expect(resumen.rows.map((r) => r[0])).toEqual(["P1", "P2", "P3"]);
    expect(resumen.omitted).toBe(2);
  });

  it("sin datos devuelve cero filas", () => {
    const resumen = buildChartSummary<Punto>({
      data: [],
      categoryLabel: "Mes",
      category: (p) => p.mes,
      series: [SERIE_VENTAS],
    });

    expect(resumen.headers).toEqual(["Mes", "Ventas"]);
    expect(resumen.rows).toEqual([]);
    expect(resumen.total).toBe(0);
    expect(resumen.omitted).toBe(0);
  });
});

describe("chartSummaryCaption", () => {
  const base = { headers: ["Mes", "Ventas"], rows: [["Ene", "$1"]] };

  it("con todas las filas solo nombra el contenido", () => {
    expect(chartSummaryCaption({ ...base, total: 1, omitted: 0 })).toBe("Datos del gráfico");
  });

  it("recortada, dice cuántas filas enseña de cuántas", () => {
    expect(chartSummaryCaption({ ...base, total: 30, omitted: 29 })).toBe("Datos del gráfico (primeras 1 de 30 filas)");
  });

  it("vacía lo dice en lugar de anunciar una tabla sin filas", () => {
    expect(chartSummaryCaption({ headers: ["Mes"], rows: [], total: 0, omitted: 0 })).toBe("Sin datos en el gráfico");
  });
});

describe("formatCount", () => {
  it("separa miles igual en servidor y cliente (en-US, como formatUSD)", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
