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
  it("sheet sin filas → solo cabecera", () => {
    const sheet: ExcelSheet = { name: "X", columns: [{ header: "A" }, { header: "B" }], rows: [] };
    expect(sheetToTsv(sheet)).toBe("A\tB");
  });
});
