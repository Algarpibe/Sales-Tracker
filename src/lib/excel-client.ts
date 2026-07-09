"use client";

import { generateXlsx } from "@/actions/export-actions";
import type { ExcelSheet } from "@/lib/excel-types";

export async function downloadXlsx(sheets: ExcelSheet[], filename: string): Promise<void> {
  const b64 = await generateXlsx(sheets);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
