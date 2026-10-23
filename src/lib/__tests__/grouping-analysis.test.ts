import { describe, it, expect } from "vitest";
import {
  GROUPINGS_KEY,
  groupingAnalysisKey,
  keepYearsFrom,
  trimGroupingFromYear,
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
