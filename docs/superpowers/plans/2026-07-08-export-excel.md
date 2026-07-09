# Export Excel (.xlsx) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a Excel (.xlsx) en Artículos, Clientes, Cliente×Artículo y Tablas, vía un menú "Exportar ▾" (CSV + Excel). exceljs corre en el servidor.

**Architecture:** Builders puros → `ExcelSheet` spec; server action `generateXlsx` (exceljs, base64); helper cliente `downloadXlsx`; `ExportMenu` reemplaza `CsvButton`.

**Tech Stack:** Next 16 (server actions), exceljs (server-only), recharts n/a, vitest.

---

### Task 1: Dependencia + tipos + server action + helper cliente

**Files:** `package.json` (dep); Create `src/lib/excel-types.ts`, `src/actions/export-actions.ts`, `src/lib/excel-client.ts`

- [ ] **Step 1: Instalar exceljs**
```bash
npm install exceljs
```
(exceljs trae sus propios tipos; no hace falta @types.)

- [ ] **Step 2: Tipos compartidos** — crear `src/lib/excel-types.ts`:
```ts
export interface ExcelColumn { header: string; width?: number; numFmt?: string }
export interface ExcelRow { cells: (string | number | null)[]; bold?: boolean }
export interface ExcelSheet { name: string; columns: ExcelColumn[]; rows: ExcelRow[] }
```

- [ ] **Step 3: Server action** — crear `src/actions/export-actions.ts`:
```ts
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
```

- [ ] **Step 4: Helper cliente** — crear `src/lib/excel-client.ts`:
```ts
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
```

- [ ] **Step 5:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings).
- [ ] **Step 6:** Commit:
```bash
git add package.json package-lock.json src/lib/excel-types.ts src/actions/export-actions.ts src/lib/excel-client.ts
git commit -m "feat(export): exceljs + tipos ExcelSheet + action generateXlsx + downloadXlsx"
```

---

### Task 2: Componente ExportMenu

**Files:** Create `src/components/common/export-menu.tsx`

- [ ] **Step 1: Implementar** (READ `src/components/ui/dropdown-menu.tsx` para confirmar los nombres exportados: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`):
```tsx
"use client";

import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ExportMenu({
  onCsv,
  onXlsx,
  disabled,
}: {
  onCsv: () => void;
  onXlsx: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="mr-2 h-4 w-4" /> Exportar <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={onXlsx}>Excel (.xlsx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/common/export-menu.tsx
git commit -m "feat(export): ExportMenu (dropdown CSV / Excel)"
```

---

### Task 3: Builder itemsToExcel + test (TDD)

**Files:** Modify `src/lib/item-sales.ts`; Create/Modify `src/lib/__tests__/item-sales.test.ts`

- [ ] **Step 1: Test (falla)** — en `src/lib/__tests__/item-sales.test.ts`, añade `itemsToExcel` al import desde `@/lib/item-sales` y añade:
```ts
describe("itemsToExcel", () => {
  it("columnas, filas y total en negrita", () => {
    const rows: ItemSalesRow[] = [
      { item_id: "1", sku: "A", nombre: "uno", categoria: "Cat", cantidad: 2, importe: 100 },
    ];
    const sheet = itemsToExcel(rows);
    expect(sheet.name).toBe("Artículos");
    expect(sheet.columns.map((c) => c.header)).toEqual(["SKU", "Nombre", "Categoría", "Cantidad", "Importe", "Precio promedio"]);
    expect(sheet.columns[4].numFmt).toBe('"$"#,##0.00');
    expect(sheet.rows[0].cells).toEqual(["A", "uno", "Cat", 2, 100, 50]); // importe/cantidad numéricos
    const total = sheet.rows[sheet.rows.length - 1];
    expect(total.bold).toBe(true);
    expect(total.cells[0]).toBe("TOTAL");
    expect(total.cells[3]).toBe(2);
    expect(total.cells[4]).toBe(100);
  });
});
```
(Asegura que `ItemSalesRow` está importado en el test desde `@/types/database`.)

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/item-sales.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/item-sales.ts`, añade `import type { ExcelSheet } from "@/lib/excel-types";` arriba, y al final:
```ts
export function itemsToExcel(rows: ItemSalesRow[]): ExcelSheet {
  const t = computeItemTotals(rows);
  return {
    name: "Artículos",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Nombre", width: 40 },
      { header: "Categoría", width: 22 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      { header: "Importe", width: 16, numFmt: '"$"#,##0.00' },
      { header: "Precio promedio", width: 16, numFmt: '"$"#,##0.00' },
    ],
    rows: [
      ...rows.map((r) => ({ cells: [r.sku ?? "", r.nombre, categoriaLabel(r), r.cantidad, r.importe, precioPromedio(r)] })),
      { cells: ["TOTAL", "", "", t.cantidad, t.importe, null], bold: true },
    ],
  };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/item-sales.test.ts` → PASS. `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/item-sales.ts src/lib/__tests__/item-sales.test.ts
git commit -m "feat(export): itemsToExcel + test"
```

---

### Task 4: Builder customerMatrixToExcel + test (TDD)

**Files:** Modify `src/lib/customer-sales.ts`, `src/lib/__tests__/customer-sales.test.ts`

- [ ] **Step 1: Test (falla)** — añade `customerMatrixToExcel` al import y:
```ts
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
```
(Usa el tipo real de `matrix` según `CustomerMatrixRow`; si el test necesita el tipo, castea o constrúyelo como arriba — los campos usados son `customer`, `byYear`, `total`.)

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-sales.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/customer-sales.ts`, añade `import type { ExcelSheet } from "@/lib/excel-types";` y al final (reusa `computeColumnTotals`, ya en el archivo):
```ts
export function customerMatrixToExcel(matrix: CustomerMatrixRow[], years: number[], grand: number): ExcelSheet {
  const totals = computeColumnTotals(matrix, years);
  const ratio = (n: number) => (grand > 0 ? n / grand : 0);
  return {
    name: "Clientes",
    columns: [
      { header: "Cliente", width: 32 },
      ...years.map((y) => ({ header: String(y), width: 14, numFmt: '"$"#,##0.00' })),
      { header: "Total", width: 16, numFmt: '"$"#,##0.00' },
      { header: "%", width: 9, numFmt: "0.0%" },
    ],
    rows: [
      ...matrix.map((r) => ({ cells: [r.customer, ...years.map((y) => r.byYear[y] ?? 0), r.total, ratio(r.total)] })),
      { cells: ["TOTAL", ...years.map((y) => totals.byYear[y]), totals.grand, ratio(totals.grand)], bold: true },
    ],
  };
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/customer-sales.ts src/lib/__tests__/customer-sales.test.ts
git commit -m "feat(export): customerMatrixToExcel + test"
```

---

### Task 5: Builder customerItemToExcel + test (TDD)

**Files:** Modify `src/lib/customer-item.ts`, `src/lib/__tests__/customer-item.test.ts`

- [ ] **Step 1: Test (falla)** — añade `customerItemToExcel` al import desde `@/lib/customer-item` y añade. (Si TS se queja del literal, LEE el tipo `CustomerGroup`/`CustomerItemRow` en el código y ajusta los campos del literal; los usados son `customer`, `items`, `totals` y en cada ítem `sku/marca/nombre/categoria/cantidad/importe`.)
```ts
describe("customerItemToExcel", () => {
  it("cabecera de grupo bold, buckets por columna y total bold", () => {
    const groups = [
      {
        customer: "AGQ",
        items: [
          { customer: "AGQ", sku: "1", marca: "M", nombre: "uno", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
          { customer: "AGQ", sku: "2", marca: null, nombre: "dos", categoria: "CAL PM", cantidad: 3, importe: 40 },
        ],
        totals: { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 },
      },
    ];
    const grand = { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 };
    const sheet = customerItemToExcel(groups, grand);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de Obra/Cal", "C&R", "Equipos", "Operación",
    ]);
    expect(sheet.rows[0].bold).toBe(true);
    expect(sheet.rows[0].cells).toEqual(["AGQ", "", "", "", "", 40, 100, 0, 0]);
    expect(sheet.rows[1].cells).toEqual(["1", "M", "uno", "C&R EDM 180", 1, null, 100, null, null]);
    expect(sheet.rows[2].cells).toEqual(["2", "", "dos", "CAL PM", 3, 40, null, null, null]);
    const total = sheet.rows[sheet.rows.length - 1];
    expect(total.bold).toBe(true);
    expect(total.cells).toEqual(["TOTAL", "", "", "", "", 40, 100, 0, 0]);
  });
});
```

- [ ] **Step 2:** vitest → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/customer-item.ts`, añade `import type { ExcelSheet, ExcelRow } from "@/lib/excel-types";` y al final:
```ts
export function customerItemToExcel(groups: CustomerGroup[], grand: Record<Bucket, number>): ExcelSheet {
  const rows: ExcelRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.customer, "", "", "", "", g.totals.mano_obra, g.totals.cr, g.totals.equipos, g.totals.operacion], bold: true });
    for (const it of g.items) {
      const b = bucketForCategory(it.categoria);
      rows.push({
        cells: [
          it.sku ?? "", it.marca ?? "", it.nombre, it.categoria ?? "Sin categoría", it.cantidad,
          b === "mano_obra" ? it.importe : null,
          b === "cr" ? it.importe : null,
          b === "equipos" ? it.importe : null,
          b === "operacion" ? it.importe : null,
        ],
      });
    }
  }
  rows.push({ cells: ["TOTAL", "", "", "", "", grand.mano_obra, grand.cr, grand.equipos, grand.operacion], bold: true });
  return {
    name: "Cliente×Artículo",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Marca", width: 18 },
      { header: "Nombre", width: 40 },
      { header: "Categoría", width: 20 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      { header: "Mano de Obra/Cal", width: 16, numFmt: '"$"#,##0.00' },
      { header: "C&R", width: 16, numFmt: '"$"#,##0.00' },
      { header: "Equipos", width: 16, numFmt: '"$"#,##0.00' },
      { header: "Operación", width: 16, numFmt: '"$"#,##0.00' },
    ],
    rows,
  };
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/customer-item.ts src/lib/__tests__/customer-item.test.ts
git commit -m "feat(export): customerItemToExcel + test"
```

---

### Task 6: Integrar ExportMenu en las 4 páginas + eliminar CsvButton

**Files:** Modify `src/app/(dashboard)/articulos/page.tsx`, `clientes/page.tsx`, `cliente-articulo/page.tsx`, `tablas/page.tsx`; Delete `src/components/common/csv-button.tsx`

Patrón por página: quitar `import { CsvButton } ...`; añadir `import { ExportMenu } from "@/components/common/export-menu";` y `import { downloadXlsx } from "@/lib/excel-client";`; añadir el builder al import de su lib; crear `exportXlsx`; reemplazar `<CsvButton .../>` por `<ExportMenu .../>`.

- [ ] **Step 1: articulos/page.tsx**
  - Import: añade `itemsToExcel` al import desde `@/lib/item-sales` (junto a `itemsToCsv`).
  - Tras `exportCsv`, añade:
    ```tsx
    const exportXlsx = () => {
      downloadXlsx([itemsToExcel(view)], `ventas_articulo_${tipo}_${desde}_${hasta}.xlsx`);
      toast.success("Excel descargado");
    };
    ```
  - Reemplaza `<CsvButton onClick={exportCsv} disabled={view.length === 0} />` por
    `<ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} disabled={view.length === 0} />`.

- [ ] **Step 2: clientes/page.tsx**
  - Import `customerMatrixToExcel` desde `@/lib/customer-sales`.
  - `const exportXlsx = () => { downloadXlsx([customerMatrixToExcel(visible, years, grandAll)], `ventas_cliente_${tipo}_${desdeAnio}_${hastaAnio}.xlsx`); toast.success("Excel descargado"); };`
  - Reemplaza `<CsvButton onClick={exportCsv} disabled={visible.length === 0} />` por
    `<ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} disabled={visible.length === 0} />`.

- [ ] **Step 3: cliente-articulo/page.tsx**
  - Import `customerItemToExcel` desde `@/lib/customer-item`.
  - `const exportXlsx = () => { downloadXlsx([customerItemToExcel(groups, grand)], `ventas_cliente_articulo_${tipo}_${anio}.xlsx`); toast.success("Excel descargado"); };`
  - Reemplaza `<CsvButton onClick={exportCsv} disabled={groups.length === 0} />` por
    `<ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} disabled={groups.length === 0} />`.

- [ ] **Step 4: tablas/page.tsx**
  - Import `import type { ExcelSheet } from "@/lib/excel-types";` y `import { downloadXlsx } from "@/lib/excel-client";` y `import { ExportMenu } from "@/components/common/export-menu";` (quita `CsvButton`).
  - Tras `handleExportCSV`, añade:
    ```tsx
    const handleExportXlsx = () => {
      const sheet: ExcelSheet = {
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
      };
      downloadXlsx([sheet], `tabla_${typeFilter}_${year}.xlsx`);
      toast.success("Excel descargado");
    };
    ```
  - Reemplaza `<CsvButton onClick={handleExportCSV} />` por
    `<ExportMenu onCsv={handleExportCSV} onXlsx={handleExportXlsx} />`.

- [ ] **Step 5: Eliminar CsvButton** (ya sin importadores):
```bash
git rm src/components/common/csv-button.tsx
```

- [ ] **Step 6:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings). Verifica que `grep -rn "csv-button\|CsvButton" src/` no devuelve nada.
- [ ] **Step 7:** Commit:
```bash
git add -A
git commit -m "feat(export): menú Exportar (CSV/Excel) en las 4 vistas; eliminar CsvButton"
```

---

### Task 7: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- exceljs es **server-only**: solo se importa dinámicamente dentro de `export-actions.ts` (`"use server"`). El cliente solo llama al action (RPC) → no entra al bundle.
- Importes van como **números** en las celdas; el `$` lo pone el `numFmt` de la columna. El % va como ratio (0..1) con `numFmt "0.0%"`.
- El action valida `requireApproved()`.
- Deploy en EasyPanel al terminar; validar descarga real de las 4 vistas (Excel + CSV siguen funcionando).
