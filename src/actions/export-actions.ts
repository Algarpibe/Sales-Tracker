"use server";

import { requireApproved } from "@/lib/auth/guards";
import type { ExcelSheet } from "@/lib/excel-types";

// Genera un .xlsx en el servidor (exceljs) y lo devuelve en base64.
export async function generateXlsx(sheets: ExcelSheet[]): Promise<string> {
  await requireApproved();
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of sheet.rows) {
      const row = ws.addRow(r.cells.map((c) => (c === null ? "" : c)));
      if (r.bold) row.font = { bold: true };
    }

    sheet.columns.forEach((c, i) => {
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString("base64");
}
