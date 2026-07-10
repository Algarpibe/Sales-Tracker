# Copiar tabla al portapapeles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Copiar tabla" (TSV al portapapeles) en el menú Exportar de las 4 vistas, reutilizando los builders `*ToExcel`.

**Architecture:** `sheetToTsv` (puro) + `copySheetToClipboard` (client) + ítem en `ExportMenu` + handler `onCopy` por página.

**Tech Stack:** Next 16, Clipboard API, vitest.

---

### Task 1: sheetToTsv + test (TDD)

**Files:** Create `src/lib/table-tsv.ts`, `src/lib/__tests__/table-tsv.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/table-tsv.test.ts`:
```ts
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
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/table-tsv.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/table-tsv.ts`:
```ts
import type { ExcelSheet } from "@/lib/excel-types";

export function sheetToTsv(sheet: ExcelSheet): string {
  const esc = (v: string | number | null): string =>
    v === null ? "" : String(v).replace(/[\t\n\r]+/g, " ");
  const header = sheet.columns.map((c) => esc(c.header)).join("\t");
  const body = sheet.rows.map((r) => r.cells.map(esc).join("\t")).join("\n");
  return body ? `${header}\n${body}` : header;
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/table-tsv.ts src/lib/__tests__/table-tsv.test.ts
git commit -m "feat(copiar): sheetToTsv + test"
```

---

### Task 2: copySheetToClipboard + ExportMenu + wire 4 páginas (un commit atómico)

**Files:** Modify `src/lib/excel-client.ts`, `src/components/common/export-menu.tsx`, `articulos/page.tsx`, `clientes/page.tsx`, `cliente-articulo/page.tsx`, `tablas/page.tsx`

Hacer TODO antes de un único commit (la prop `onCopy` requerida rompe compilación hasta que las 4 páginas la pasan → no commitees a medias). Orden sugerido: excel-client → export-menu → las 4 páginas → `tsc`/`lint`/`vitest` → commit.

- [ ] **Step A: excel-client** — en `src/lib/excel-client.ts`, añade `import { sheetToTsv } from "@/lib/table-tsv";` y al final:
```ts
export async function copySheetToClipboard(sheet: ExcelSheet): Promise<void> {
  await navigator.clipboard.writeText(sheetToTsv(sheet));
}
```

- [ ] **Step B: ExportMenu** — en `src/components/common/export-menu.tsx`, añade `onCopy: () => void;` a las props (destructura `onCopy`) y añade como PRIMER `DropdownMenuItem` (antes de CSV/Excel):
```tsx
        <DropdownMenuItem onClick={onCopy}>Copiar tabla</DropdownMenuItem>
```

En cada página: `import { copySheetToClipboard } from "@/lib/excel-client";` (junto a `downloadXlsx`), añade el handler `onCopy`, y pásalo al `<ExportMenu>`.

- [ ] **Step 1: articulos/page.tsx** — tras `exportXlsx`:
```tsx
  const onCopy = async () => {
    try { await copySheetToClipboard(itemsToExcel(view)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };
```
En el `<ExportMenu ... />` añade `onCopy={onCopy}`.

- [ ] **Step 2: clientes/page.tsx** — tras `exportXlsx`:
```tsx
  const onCopy = async () => {
    try { await copySheetToClipboard(customerMatrixToExcel(visible, years, grandAll)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };
```
`<ExportMenu ... onCopy={onCopy} />`.

- [ ] **Step 3: cliente-articulo/page.tsx** — tras `exportXlsx`:
```tsx
  const onCopy = async () => {
    try { await copySheetToClipboard(customerItemToExcel(groups, grand)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };
```
`<ExportMenu ... onCopy={onCopy} />`. (El `<ExportMenu>` está dentro del bloque de modo normal.)

- [ ] **Step 4: tablas/page.tsx** — refactor: extrae el `ExcelSheet` inline de `handleExportXlsx` a un `makeSheet`:
```tsx
  const makeSheet = (): ExcelSheet => ({
    name: "Tabla",
    columns: [
      { header: "Categoría", width: 24 },
      ...MONTHS.map((m) => ({ header: m.label, width: 12, numFmt: '"$"#,##0.00' })),
      { header: "Total", width: 16, numFmt: '"$"#,##0.00' },
    ],
    rows: [
      ...pivotRows.map((row) => ({ cells: [row.category_name, ...MONTHS.map((m) => row.months[m.value]?.amount ?? 0), row.total] })),
      { cells: ["TOTAL", ...MONTHS.map((m) => monthlyTotals[m.value]), grandTotal], bold: true },
    ],
  });
  const handleExportXlsx = () => {
    downloadXlsx([makeSheet()], `tabla_${typeFilter}_${year}.xlsx`);
    toast.success("Excel descargado");
  };
  const onCopy = async () => {
    try { await copySheetToClipboard(makeSheet()); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };
```
(Sustituye el `handleExportXlsx` actual por estas tres piezas.) En `<ExportMenu onCsv={handleExportCSV} onXlsx={handleExportXlsx} />` añade `onCopy={onCopy}`.

- [ ] **Step 5:** `npx tsc --noEmit` (limpio ya, con onCopy en las 4) + `npm run lint` (0 errores, sin nuevos warnings) + `npx vitest run` (verde).
- [ ] **Step 6:** Commit único (excel-client + export-menu de Task 2 + las 4 páginas):
```bash
git add src/lib/excel-client.ts src/components/common/export-menu.tsx "src/app/(dashboard)/articulos/page.tsx" "src/app/(dashboard)/clientes/page.tsx" "src/app/(dashboard)/cliente-articulo/page.tsx" "src/app/(dashboard)/tablas/page.tsx"
git commit -m "feat(copiar): opción 'Copiar tabla' (TSV) en las 4 vistas"
```

---

### Task 3: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Valores crudos en el TSV (números como número, `%` como ratio) → pegado analizable en Excel/Sheets.
- `copySheetToClipboard` usa `navigator.clipboard.writeText` (contexto seguro + gesto de usuario, ambos OK).
- Commit conjunto de export-menu + páginas para no dejar tsc en rojo entre pasos.
- Deploy en EasyPanel; validar: menú Exportar → "Copiar tabla" → pegar en Excel/Sheets cae en columnas.
