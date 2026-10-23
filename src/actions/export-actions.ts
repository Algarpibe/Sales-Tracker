"use server";

import { requireApproved } from "@/lib/auth/guards";
import type { ExcelSheet } from "@/lib/excel-types";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";

// Genera un .xlsx en el servidor (exceljs) y lo devuelve en base64.
// Con runAction: un error esperado (p. ej. el límite de exportaciones) llega al
// usuario con su mensaje en vez del genérico que Next deja de una excepción.
export async function generateXlsx(sheets: ExcelSheet[]): Promise<ActionResult<string>> {
  return runAction(async () => {
    const { user, profile } = await requireApproved();
    // SEC-006: generar el libro es lo más caro que puede pedir un usuario; cupo propio,
    // más estricto que el de las lecturas.
    assertRateLimit("export", user.id);
    // Quién exporta qué: nombres de hoja y nº de filas, nunca el contenido de las celdas.
    audit({
      action: "export.xlsx",
      actorId: profile.id,
      companyId: profile.company_id,
      meta: { sheets: sheets.map((s) => ({ sheet: s.name, rows: s.rows.length })) },
    });
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
  });
}
