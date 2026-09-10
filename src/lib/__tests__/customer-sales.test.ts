import { describe, it, expect } from "vitest";
import {
  buildCustomerMatrix,
  mergeWithHistory,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
  sortCustomerMatrix,
  customerMatrixToExcel,
  hubCustomerNames,
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

describe("sortCustomerMatrix delta", () => {
  it("ordena por delta A vs B; null (B=0) al final en desc", () => {
    // entrada desordenada a propósito: un sort roto/no-op no pasaría por casualidad
    const matrix = [
      { customer: "C", byYear: { 2025: 100, 2024: 0 }, total: 100 },   // null (B=0)
      { customer: "B", byYear: { 2025: 100, 2024: 200 }, total: 300 }, // -50%
      { customer: "A", byYear: { 2025: 100, 2024: 50 }, total: 150 },  // +100%
    ];
    const desc = sortCustomerMatrix(matrix, "delta", "desc", { a: 2025, b: 2024 });
    expect(desc.map((r) => r.customer)).toEqual(["A", "B", "C"]); // +100, -50, null al final
    const asc = sortCustomerMatrix(matrix, "delta", "asc", { a: 2025, b: 2024 });
    expect(asc.map((r) => r.customer)).toEqual(["C", "B", "A"]);
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

describe("customerMatrixToExcel", () => {
  it("años dinámicos, % como ratio, total en negrita", () => {
    const matrix = [
      { customer: "A", byYear: { 2021: 100, 2022: 0 }, total: 100 },
      { customer: "B", byYear: { 2021: 0, 2022: 300 }, total: 300 },
    ];
    const sheet = customerMatrixToExcel(matrix, [2021, 2022], 400);
    expect(sheet.columns.map((c) => c.header)).toEqual(["Cliente", "2021", "2022", "Total", "%"]);
    expect(sheet.columns[4].numFmt).toBe("0.0%");
    expect(sheet.rows[0].cells).toEqual(["A", 100, 0, 100, 0.25]);
    const total = sheet.rows[sheet.rows.length - 1];
    expect(total.bold).toBe(true);
    expect(total.cells).toEqual(["TOTAL", 100, 300, 400, 1]);
  });
});

describe("hubCustomerNames", () => {
  it("incluye solo a los clientes con alguna fila del hub", () => {
    const rows: CustomerYearRow[] = [
      { customer: "Cliente Hub", year: 2021, ventas: 100, source: "hub" },
      { customer: "Cliente Historico", year: 2018, ventas: 50, source: "historical" },
    ];
    const set = hubCustomerNames(rows);
    expect(set.has("Cliente Hub")).toBe(true);
    expect(set.has("Cliente Historico")).toBe(false);
  });

  it("incluye al cliente que tiene filas de las DOS fuentes", () => {
    // Cliente presente en las dos fuentes: debe conservar su enlace al drill-down.
    const rows: CustomerYearRow[] = [
      { customer: "Cliente Mixto", year: 2015, ventas: 100, source: "historical" },
      { customer: "Cliente Mixto", year: 2025, ventas: 200, source: "hub" },
    ];
    expect(hubCustomerNames(rows).has("Cliente Mixto")).toBe(true);
  });

  it("trata las filas sin source como del hub (compatibilidad)", () => {
    // Los seis consumidores que no piden histórico no rellenan source.
    const rows: CustomerYearRow[] = [{ customer: "Cliente Hub", year: 2021, ventas: 100 }];
    expect(hubCustomerNames(rows).has("Cliente Hub")).toBe(true);
  });
});

describe("buildCustomerMatrix con dos fuentes", () => {
  it("colapsa hub e histórico del mismo cliente en UNA sola fila", () => {
    const rows: CustomerYearRow[] = [
      { customer: "Cliente Mixto", year: 2015, ventas: 100, source: "historical" },
      { customer: "Cliente Mixto", year: 2025, ventas: 200, source: "hub" },
    ];
    const matrix = buildCustomerMatrix(rows);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].byYear[2015]).toBe(100);
    expect(matrix[0].byYear[2025]).toBe(200);
    expect(matrix[0].total).toBe(300);
  });
});

describe("mergeWithHistory", () => {
  it("el histórico manda en su rango: descarta las filas del hub de esos años", () => {
    // El 2020 del hub es PARCIAL (Zoho se empezó a usar a mitad de 2020).
    // Si se sumara al histórico, 2020 quedaría inflado.
    const hub: CustomerYearRow[] = [
      { customer: "Cliente Mixto", year: 2020, ventas: 75_555, source: "hub" },
      { customer: "Cliente Mixto", year: 2021, ventas: 99_943, source: "hub" },
    ];
    const hist: CustomerYearRow[] = [
      { customer: "Cliente Mixto", year: 2020, ventas: 176_611, source: "historical" },
    ];

    const merged = mergeWithHistory(hub, hist, 2020);

    const de2020 = merged.filter((r) => r.year === 2020);
    expect(de2020).toHaveLength(1);
    expect(de2020[0].ventas).toBe(176_611);
    expect(de2020[0].source).toBe("historical");
  });

  it("conserva intactas las filas del hub posteriores al histórico", () => {
    const hub: CustomerYearRow[] = [
      { customer: "Cliente Hub", year: 2021, ventas: 100, source: "hub" },
      { customer: "Cliente Hub", year: 2026, ventas: 200, source: "hub" },
    ];
    const merged = mergeWithHistory(hub, [], 2020);
    expect(merged).toHaveLength(2);
    expect(merged.every((r) => r.source === "hub")).toBe(true);
  });

  it("el total tras fusionar no duplica ningún año", () => {
    const hub: CustomerYearRow[] = [
      { customer: "C", year: 2020, ventas: 500, source: "hub" },
      { customer: "C", year: 2021, ventas: 300, source: "hub" },
    ];
    const hist: CustomerYearRow[] = [
      { customer: "C", year: 2020, ventas: 1000, source: "historical" },
    ];
    const matrix = buildCustomerMatrix(mergeWithHistory(hub, hist, 2020));
    expect(matrix).toHaveLength(1);
    expect(matrix[0].byYear[2020]).toBe(1000);
    expect(matrix[0].total).toBe(1300);
  });
});
