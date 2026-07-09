import { describe, it, expect } from "vitest";
import { dedupeCustomers, articleHref } from "@/lib/global-search";
import type { CustomerYearRow } from "@/types/database";

describe("dedupeCustomers", () => {
  it("deduplica, ordena y descarta vacíos", () => {
    const rows: CustomerYearRow[] = [
      { customer: "Beta", year: 2021, ventas: 1 },
      { customer: "Alfa", year: 2021, ventas: 1 },
      { customer: "Beta", year: 2022, ventas: 1 },
      { customer: "", year: 2022, ventas: 1 },
    ];
    expect(dedupeCustomers(rows)).toEqual(["Alfa", "Beta"]);
  });
});

describe("articleHref", () => {
  it("usa sku si existe, codifica", () => {
    expect(articleHref({ sku: "3200 862", nombre: "x" })).toBe("/articulos?q=3200%20862");
  });
  it("usa nombre si no hay sku", () => {
    expect(articleHref({ sku: null, nombre: "Electrodo pH" })).toBe("/articulos?q=Electrodo%20pH");
  });
});
