import { describe, it, expect } from "vitest";
import {
  buildCustomerMatrix,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
  sortCustomerMatrix,
} from "@/lib/customer-sales";
import type { CustomerYearRow } from "@/types/database";

const rows: CustomerYearRow[] = [
  { customer: "Alpha", year: 2024, ventas: 100 },
  { customer: "Alpha", year: 2025, ventas: 300 },
  { customer: "Beta", year: 2025, ventas: 50 },
  { customer: "Beta", year: 2024, ventas: -10 },
];
const years = [2024, 2025];

describe("buildCustomerMatrix", () => {
  it("pivota por cliente/año y ordena por total desc", () => {
    const m = buildCustomerMatrix(rows);
    expect(m.map((r) => r.customer)).toEqual(["Alpha", "Beta"]);
    expect(m[0]).toEqual({ customer: "Alpha", byYear: { 2024: 100, 2025: 300 }, total: 400 });
    expect(m[1].total).toBe(40);
  });
});

describe("computeColumnTotals", () => {
  it("totales por año y general (incluye negativos)", () => {
    const m = buildCustomerMatrix(rows);
    expect(computeColumnTotals(m, years)).toEqual({ byYear: { 2024: 90, 2025: 350 }, grand: 440 });
  });
});

describe("filterCustomers", () => {
  it("filtra por nombre (case-insensitive)", () => {
    const m = buildCustomerMatrix(rows);
    expect(filterCustomers(m, "bet").map((r) => r.customer)).toEqual(["Beta"]);
    expect(filterCustomers(m, "").length).toBe(2);
  });
});

describe("sortCustomerMatrix", () => {
  it("ordena por total, por año y por nombre (asc/desc), sin mutar", () => {
    const m = buildCustomerMatrix(rows);
    expect(sortCustomerMatrix(m, "total", "asc").map((r) => r.customer)).toEqual(["Beta", "Alpha"]);
    expect(sortCustomerMatrix(m, "total", "desc").map((r) => r.customer)).toEqual(["Alpha", "Beta"]);
    // 2024: Alpha 100, Beta -10
    expect(sortCustomerMatrix(m, 2024, "asc").map((r) => r.customer)).toEqual(["Beta", "Alpha"]);
    expect(sortCustomerMatrix(m, "customer", "asc").map((r) => r.customer)).toEqual(["Alpha", "Beta"]);
    expect(m.map((r) => r.customer)).toEqual(["Alpha", "Beta"]); // entrada intacta
  });
});

describe("customerMatrixToCsv", () => {
  it("cabecera + filas + TOTAL con ';' y %", () => {
    const m = buildCustomerMatrix(rows);
    const csv = customerMatrixToCsv(m, years, 440);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Cliente;2024;2025;Total;%");
    expect(lines[1]).toBe("Alpha;100.00;300.00;400.00;90.9%");
    expect(lines[lines.length - 1]).toBe("TOTAL;90.00;350.00;440.00;100.0%");
    expect(lines).toHaveLength(rows.length / 2 + 2); // 2 clientes + cabecera + total
  });
});
