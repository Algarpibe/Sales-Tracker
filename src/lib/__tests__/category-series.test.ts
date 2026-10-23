import { describe, it, expect } from "vitest";
import { buildHistoricalCategorySeries, sumByCategoryYearMonth } from "@/lib/category-series";

const r = (category_id: string, record_year: number, record_month: number, amount_usd: number) => ({
  category_id,
  record_year,
  record_month,
  amount_usd,
});

describe("buildHistoricalCategorySeries", () => {
  const records = [
    r("a", 2020, 1, 999), // anterior al primer año: se ignora
    r("a", 2021, 1, 100.004),
    r("a", 2021, 2, 50),
    r("b", 2021, 4, 10),
    r("a", 2022, 12, 7),
  ];

  it("lista los años con datos desde el primer año, ordenados", () => {
    expect(buildHistoricalCategorySeries(records, 2021).years).toEqual([2021, 2022]);
  });

  it("agrega por año y categoría, redondeado a céntimos", () => {
    expect(buildHistoricalCategorySeries(records, 2021).annual).toEqual([
      { year: "2021", a: 150, b: 10 },
      { year: "2022", a: 7 },
    ]);
  });

  it("da 12 meses por año con etiqueta corta", () => {
    const { monthly } = buildHistoricalCategorySeries(records, 2021);
    expect(monthly[2021]).toHaveLength(12);
    expect(monthly[2021][0]).toEqual({ month: "Ene", a: 100 });
    expect(monthly[2021][1]).toEqual({ month: "Feb", a: 50 });
    expect(monthly[2021][3]).toEqual({ month: "Abr", b: 10 });
    expect(monthly[2022][11]).toEqual({ month: "Dic", a: 7 });
    expect(monthly[2020]).toBeUndefined();
  });

  it("da 4 trimestres por año sumando sus meses", () => {
    const { quarterly } = buildHistoricalCategorySeries(records, 2021);
    expect(quarterly[2021]).toEqual([
      { quarter: "T1", a: 150 },
      { quarter: "T2", b: 10 },
      { quarter: "T3" },
      { quarter: "T4" },
    ]);
  });

  it("sin ventas (o todas anteriores al primer año) no hay años ni series", () => {
    const out = buildHistoricalCategorySeries([r("a", 2019, 1, 5)], 2021);
    expect(out).toEqual({ years: [], annual: [], monthly: {}, quarterly: {} });
  });

  it("tolera importes NUMERIC que llegan como texto", () => {
    const out = buildHistoricalCategorySeries([{ category_id: "a", record_year: 2021, record_month: 3, amount_usd: "12.5" as unknown as number }], 2021);
    expect(out.annual).toEqual([{ year: "2021", a: 12.5 }]);
  });
});

describe("sumByCategoryYearMonth", () => {
  it("suma por categoría → año → mes", () => {
    expect(
      sumByCategoryYearMonth([r("a", 2024, 1, 10), r("a", 2024, 1, 5), r("a", 2025, 2, 1), r("b", 2024, 3, 2)])
    ).toEqual({
      a: { 2024: { 1: 15 }, 2025: { 2: 1 } },
      b: { 2024: { 3: 2 } },
    });
  });

  it("sin registros devuelve un objeto vacío", () => {
    expect(sumByCategoryYearMonth([])).toEqual({});
  });
});
