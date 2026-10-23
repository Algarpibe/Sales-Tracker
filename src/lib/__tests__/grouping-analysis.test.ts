import { describe, it, expect } from "vitest";
import {
  GROUPINGS_KEY,
  groupingAnalysisKey,
  keepYearsFrom,
  trimGroupingFromYear,
  aggregateGroupingAnalysis,
} from "@/lib/grouping-analysis";
import type { GroupingAnalysisResult } from "@/types/database";

const raw: GroupingAnalysisResult = {
  years: [2020, 2021, 2022],
  yearTotals: { 2020: 100, 2021: 200, 2022: 400 },
  rows: [
    {
      groupId: "g1",
      groupName: "Grupo 1",
      color: "#111",
      years: {
        2020: { amount: 50, percentage: 50 },
        2021: { amount: 100, percentage: 50 },
        2022: { amount: 100, percentage: 25 },
      },
      average: { amount: 83.33, percentage: 41.67 },
    },
  ],
};

describe("claves de react-query de agrupaciones", () => {
  it("el análisis cuelga de ['groupings'] para que invalidar las agrupaciones lo refresque", () => {
    expect(GROUPINGS_KEY).toEqual(["groupings"]);
    expect(groupingAnalysisKey("INVOICE")).toEqual(["groupings", "analysis", { recordType: "INVOICE" }]);
    expect(groupingAnalysisKey("SALES_ORDER").slice(0, 1)).toEqual(GROUPINGS_KEY);
  });
});

describe("keepYearsFrom", () => {
  it("recorta solo la lista de años y deja las filas intactas", () => {
    const out = keepYearsFrom(raw, 2021);
    expect(out.years).toEqual([2021, 2022]);
    expect(out.rows).toBe(raw.rows);
  });
});

describe("trimGroupingFromYear", () => {
  it("recorta años y recalcula el promedio de cada fila sin los años ocultos", () => {
    const out = trimGroupingFromYear(raw, 2021);
    expect(out.years).toEqual([2021, 2022]);
    expect(Object.keys(out.rows[0].years)).toEqual(["2021", "2022"]);
    expect(out.rows[0].average).toEqual({ amount: 100, percentage: 37.5 });
  });

  it("una fila sin años en el rango deja promedio cero", () => {
    const out = trimGroupingFromYear(raw, 2030);
    expect(out.years).toEqual([]);
    expect(out.rows[0].average).toEqual({ amount: 0, percentage: 0 });
  });
});

describe("aggregateGroupingAnalysis (ARQ-079: lógica pura sacada de la acción)", () => {
  const groups = [
    { id: "g1", name: "Grupo 1", color: "#111111" },
    { id: "g2", name: "Grupo 2", color: null },
  ];
  const mappings = [
    { group_id: "g1", category_id: "a" },
    { group_id: "g1", category_id: "b" },
  ];
  const records = [
    { category_id: "a", record_year: 2025, record_month: 1, amount_usd: 30 },
    { category_id: "libre", record_year: 2025, record_month: 1, amount_usd: 70 },
  ];

  it("expone las categorías de cada grupo (para derivar el forecast por grupo)", () => {
    const r = aggregateGroupingAnalysis(groups, mappings, records);
    expect(r.rows.map((row) => row.categoryIds)).toEqual([["a", "b"], []]);
  });

  it("% sobre el total del año, que incluye las categorías sin grupo", () => {
    const r = aggregateGroupingAnalysis(groups, mappings, records);
    expect(r.rows[0].years[2025]).toEqual({ amount: 30, percentage: 30 });
    expect(r.rows[1].color).toBe("#6366f1");
  });

  it("sin grupos → vacío", () => {
    expect(aggregateGroupingAnalysis([], mappings, records)).toEqual({ rows: [], years: [], yearTotals: {} });
  });
});
