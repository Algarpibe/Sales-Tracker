import { describe, it, expect } from "vitest";
import { sheetToTsv } from "@/lib/table-tsv";
import type { ExcelSheet } from "@/lib/excel-types";

describe("sheetToTsv", () => {
  it("cabecera + filas con tabs; null→vacío; número→string", () => {
    const sheet: ExcelSheet = {
      name: "X",
      columns: [{ header: "A" }, { header: "B" }],
      rows: [{ cells: ["x", 10] }, { cells: [null, 20.5], bold: true }],
    };
    expect(sheetToTsv(sheet)).toBe("A\tB\nx\t10\n\t20.5");
  });
  it("limpia tabs/saltos internos de las celdas", () => {
    const sheet: ExcelSheet = { name: "X", columns: [{ header: "A" }], rows: [{ cells: ["u\tno\ndos"] }] };
    expect(sheetToTsv(sheet)).toBe("A\nu no dos");
  });
  it("neutraliza fórmulas en celdas de texto (= + - @ tab CR) con un apóstrofo", () => {
    const sheet: ExcelSheet = {
      name: "X",
      columns: [{ header: "A" }],
      rows: [
        { cells: ['=HYPERLINK("http://x")'] },
        { cells: ["+1+1"] },
        { cells: ["-2+3"] },
        { cells: ["@SUM(A1)"] },
        { cells: ["\t=1"] },
        { cells: ["\r=1"] },
      ],
    };
    expect(sheetToTsv(sheet).split("\n").slice(1)).toEqual([
      `'=HYPERLINK("http://x")`,
      "'+1+1",
      "'-2+3",
      "'@SUM(A1)",
      "' =1",
      "' =1",
    ]);
  });
  it("también neutraliza la cabecera si empieza por un carácter de fórmula", () => {
    const sheet: ExcelSheet = { name: "X", columns: [{ header: "=A" }], rows: [] };
    expect(sheetToTsv(sheet)).toBe("'=A");
  });
  it("los números (también negativos) siguen siendo números, sin apóstrofo", () => {
    const sheet: ExcelSheet = {
      name: "X",
      columns: [{ header: "A" }, { header: "B" }],
      rows: [{ cells: [-1234.5, 0] }],
    };
    expect(sheetToTsv(sheet)).toBe("A\tB\n-1234.5\t0");
  });
  it("no toca el texto normal ni el que lleva esos caracteres en medio", () => {
    const sheet: ExcelSheet = {
      name: "X",
      columns: [{ header: "A" }],
      rows: [{ cells: ["Cliente S.A. = bueno"] }, { cells: ["a-b"] }],
    };
    expect(sheetToTsv(sheet)).toBe("A\nCliente S.A. = bueno\na-b");
  });
  it("sheet sin filas → solo cabecera", () => {
    const sheet: ExcelSheet = { name: "X", columns: [{ header: "A" }, { header: "B" }], rows: [] };
    expect(sheetToTsv(sheet)).toBe("A\tB");
  });
});
