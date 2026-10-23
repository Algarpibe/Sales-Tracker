"use client";

import { generateXlsx } from "@/actions/export-actions";
import type { ExcelSheet } from "@/lib/excel-types";
import { sheetToTsv } from "@/lib/table-tsv";
import { downloadBlob } from "@/lib/download";
import { unwrapAction } from "@/lib/errors";

export async function downloadXlsx(sheets: ExcelSheet[], filename: string): Promise<void> {
  // { ok: false } → AppError con el mensaje ya saneado (runExport lo muestra).
  const b64 = unwrapAction(await generateXlsx(sheets));
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}

export async function copySheetToClipboard(sheet: ExcelSheet): Promise<void> {
  await navigator.clipboard.writeText(sheetToTsv(sheet));
}
