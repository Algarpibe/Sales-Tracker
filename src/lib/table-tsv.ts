import type { ExcelSheet } from "@/lib/excel-types";

// Inyección de fórmulas (CSV/TSV injection): al pegar en Excel/Sheets, un texto que
// empieza por = + - @ (o tab/CR) se interpreta como fórmula. Se antepone un
// apóstrofo, que la hoja trata como "esto es texto" y no muestra. Solo afecta a
// celdas de texto: los números (también los negativos) van como `number` y siguen
// siendo números.
const FORMULA_START = /^[=+\-@\t\r]/;

export function sheetToTsv(sheet: ExcelSheet): string {
  const esc = (v: string | number | null): string => {
    if (v === null) return "";
    const s = String(v).replace(/[\t\n\r]+/g, " ");
    return typeof v === "string" && FORMULA_START.test(v) ? `'${s}` : s;
  };
  const header = sheet.columns.map((c) => esc(c.header)).join("\t");
  const body = sheet.rows.map((r) => r.cells.map(esc).join("\t")).join("\n");
  return body ? `${header}\n${body}` : header;
}
