import type { ExcelSheet } from "@/lib/excel-types";

export function sheetToTsv(sheet: ExcelSheet): string {
  const esc = (v: string | number | null): string =>
    v === null ? "" : String(v).replace(/[\t\n\r]+/g, " ");
  const header = sheet.columns.map((c) => esc(c.header)).join("\t");
  const body = sheet.rows.map((r) => r.cells.map(esc).join("\t")).join("\n");
  return body ? `${header}\n${body}` : header;
}
