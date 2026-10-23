import { describe, it, expect } from "vitest";
import {
  buildForecastInput,
  firstProjectedMonth,
  forecastBreakdown,
  forecastChartPoints,
  forecastClock,
  forecastRecords,
  forecastSeries,
  reconcileToTotal,
  seasonalShares,
  sumByYearMonth,
  sumSeriesByGroup,
} from "@/lib/forecast-breakdown";
import { FIXTURE_NOW, FIXTURE_SERIES, FIXTURE_YEAR } from "./fixtures/forecast-fixture";

const clock = forecastClock(FIXTURE_NOW);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("forecastClock", () => {
  it("deriva año, mes, día y días del mes de una fecha", () => {
    expect(clock).toEqual({ year: 2026, monthIdx: 5, day: 15, daysInMonth: 30 });
    expect(forecastClock(new Date(2024, 1, 3))).toEqual({ year: 2024, monthIdx: 1, day: 3, daysInMonth: 29 });
  });
});

describe("buildForecastInput", () => {
  it("el año de referencia es SIEMPRE el anterior al proyectado y el histórico los 3 previos", () => {
    const input = buildForecastInput(FIXTURE_SERIES.gamma, 2026, clock);
    expect(input.currentYearMonthly).toEqual([30_000, 30_000, 30_000, 30_000, 30_000, 20_000, 0, 0, 0, 0, 0, 0]);
    expect(input.lastYearMonthly).toEqual(Array(12).fill(10_000)); // 2025
    expect(input.historicalMatrix[2][11]).toBe(50_000); // 2023, diciembre
    expect(input.weights).toEqual([3, 2, 1]);
    expect(input.now).toEqual({ monthIdx: 5, day: 15, daysInMonth: 30 });
    expect(input.isCurrentActualYear).toBe(true);
  });

  it("tolera importes no numéricos o ausentes (cuentan 0)", () => {
    const input = buildForecastInput({ 2026: { 1: Number.NaN, 2: 5 } }, 2026, clock);
    expect(input.currentYearMonthly.slice(0, 3)).toEqual([0, 5, 0]);
    expect(input.lastYearMonthly).toEqual(Array(12).fill(0));
  });
});

describe("sumByYearMonth / forecastRecords", () => {
  const rec = (record_year: number, record_month: number, amount_usd: number | string, record_type = "INVOICE") =>
    ({ record_year, record_month, amount_usd, record_type, category_id: "x" }) as never;

  it("suma por año y mes del tipo pedido", () => {
    expect(sumByYearMonth([rec(2025, 1, 10), rec(2025, 1, "5"), rec(2025, 2, 1, "SALES_ORDER")], "INVOICE")).toEqual({
      2025: { 1: 15 },
    });
  });

  it("forecastRecords = modelo A sobre la serie de la empresa", () => {
    const records = [rec(2025, 6, 100), rec(2026, 1, 50)];
    expect(forecastRecords(records, 2026, "INVOICE", clock)).toEqual(
      forecastSeries({ 2025: { 6: 100 }, 2026: { 1: 50 } }, 2026, clock)
    );
  });
});

describe("firstProjectedMonth", () => {
  it("año en curso → el mes actual; año cerrado o futuro → 12 (nada que reconciliar)", () => {
    expect(firstProjectedMonth(2026, clock)).toBe(5);
    expect(firstProjectedMonth(2025, clock)).toBe(12);
    expect(firstProjectedMonth(2027, clock)).toBe(12);
  });
});

describe("reconcileToTotal", () => {
  it("reparte el total proporcionalmente en los meses proyectados y no toca los cerrados", () => {
    const r = reconcileToTotal({ a: [1, 30, 10], b: [2, 10, 30] }, [3, 80, 20], 1, {});
    expect(r.values.a).toEqual([1, 60, 5]);
    expect(r.values.b).toEqual([2, 20, 15]);
    expect(r.fallbackMonths).toEqual([]);
  });

  it("si la suma de las series es 0, reparte por la cuota estacional (y lo indica)", () => {
    const r = reconcileToTotal({ a: [0, 0], b: [0, 0] }, [0, 100], 1, { a: [0, 1], b: [0, 3] });
    expect(r.values).toEqual({ a: [0, 25], b: [0, 75] });
    expect(r.fallbackMonths).toEqual([1]);
  });

  it("sin cuotas estacionales tampoco: reparto a partes iguales", () => {
    const r = reconcileToTotal({ a: [0], b: [0] }, [10], 0, {});
    expect(r.values).toEqual({ a: [5], b: [5] });
  });

  it("nunca negativos ni NaN: las proyecciones negativas cuentan 0 y un total no válido es 0", () => {
    const r = reconcileToTotal({ a: [-50, Number.NaN], b: [50, 10] }, [100, Number.NaN], 0, {});
    expect(r.values.a).toEqual([0, 0]);
    expect(r.values.b).toEqual([100, 0]);
  });

  it("total 0 → el mes proyectado queda a 0 aunque una serie proyecte algo", () => {
    expect(reconcileToTotal({ a: [40] }, [0], 0, {}).values.a).toEqual([0]);
  });

  it("sin series → objeto vacío", () => {
    expect(reconcileToTotal({}, [100], 0, {}).values).toEqual({});
  });
});

describe("seasonalShares", () => {
  it("peso de cada serie en cada mes con los pesos 3/2/1 de los años previos", () => {
    const s = seasonalShares({ a: { 2025: { 1: 10 }, 2023: { 1: 10 } }, b: { 2024: { 1: 10 } } }, 2026);
    expect(s.a[0]).toBe(40); // 3×10 + 1×10
    expect(s.b[0]).toBe(20); // 2×10
  });

  it("un mes sin historia en ninguna serie usa el peso anual de cada una", () => {
    const s = seasonalShares({ a: { 2025: { 1: 10 } }, b: { 2025: { 2: 30 } } }, 2026);
    expect(s.a[5]).toBe(30);
    expect(s.b[5]).toBe(90);
  });
});

describe("forecastBreakdown (fixture compartido)", () => {
  const b = forecastBreakdown(FIXTURE_SERIES, FIXTURE_YEAR, clock);

  it("la suma de las categorías cuadra con el modelo A de la empresa, mes a mes", () => {
    for (let m = 0; m < 12; m++) {
      const s = sum(Object.values(b.forecast).map((v) => v[m]));
      expect(s).toBeCloseTo(b.company.monthlyForecast[m], 6);
    }
    expect(Math.round(sum(Object.values(b.totals)))).toBe(b.company.year.value);
  });

  it("los meses cerrados son los reales de cada categoría", () => {
    expect(b.forecast.alfa.slice(0, 5)).toEqual(b.actual.alfa.slice(0, 5));
    expect(b.actual.alfa[5]).toBe(67_500); // MTD de junio
    expect(b.firstProjectedMonth).toBe(5);
  });

  it("cuotas sobre el total proyectado de la empresa (suman 100)", () => {
    expect(sum(Object.values(b.sharePct))).toBeCloseTo(100, 6);
  });

  // Referencia del cambio: con el modelo B retirado las tarjetas daban alfa 1.687.500,
  // beta 1.098.667 y gamma 542.857 (suma 3.329.024, un 7,6 % por encima de la empresa).
  it("golden: cierre por categoría tras reconciliar (modelo A)", () => {
    const rounded = Object.fromEntries(Object.entries(b.totals).map(([k, v]) => [k, Math.round(v)]));
    expect({ company: b.company.year.value, ...rounded }).toMatchInlineSnapshot(`
      {
        "alfa": 1605544,
        "beta": 1071540,
        "company": 3092682,
        "gamma": 415598,
      }
    `);
    expect(b.fallbackMonths).toEqual([]);
  });

  it("año cerrado: devuelve los reales sin reconciliar", () => {
    const past = forecastBreakdown(FIXTURE_SERIES, 2025, clock);
    expect(past.forecast.beta).toEqual(past.actual.beta);
    expect(Math.round(past.totals.beta)).toBe(1_260_000);
  });

  it("sin series → vacío y empresa a cero", () => {
    const empty = forecastBreakdown({}, 2026, clock);
    expect(empty.forecast).toEqual({});
    expect(empty.company.year.value).toBe(0);
  });
});

describe("sumSeriesByGroup", () => {
  it("cada grupo suma solo sus categorías; las no asignadas no cuentan en ninguno", () => {
    const g = sumSeriesByGroup({ a: [1, 2], b: [10, 20], libre: [100, 100] }, { g1: ["a", "b"], g2: ["zzz"] });
    // Siempre 12 meses; lo que falta cuenta 0.
    expect(g.g1.slice(0, 3)).toEqual([11, 22, 0]);
    expect(g.g1).toHaveLength(12);
    expect(g.g2).toEqual(Array(12).fill(0));
  });
});

describe("forecastChartPoints", () => {
  it("barras reales hasta el mes en curso, línea con la proyección y % sobre lo elegido", () => {
    const forecast = { a: Array(12).fill(30), b: Array(12).fill(10) };
    const actual = { a: Array(12).fill(1), b: Array(12).fill(2) };
    const pts = forecastChartPoints([{ id: "a", key: "A", color: "#a" }, { id: "b", key: "B" }], forecast, actual, 5);
    expect(pts).toHaveLength(12);
    expect(pts[0]).toMatchObject({ month: "Ene", A: 1, B: 2, A_forecast: 30, B_forecast: 10, total_forecast: 40 });
    expect(pts[0].A_percent).toBe(75);
    expect(pts[0].A_color).toBe("#a");
    expect(pts[5].A).toBe(1); // mes en curso: barra con el MTD
    expect(pts[6].A).toBe(0); // meses futuros: sin barra
  });

  it("año cerrado: barras en los 12 meses; total 0 → porcentaje 0", () => {
    const pts = forecastChartPoints([{ id: "a", key: "A" }], { a: Array(12).fill(0) }, { a: Array(12).fill(4) }, 12);
    expect(pts[11].A).toBe(4);
    expect(pts[11].A_percent).toBe(0);
  });
});
