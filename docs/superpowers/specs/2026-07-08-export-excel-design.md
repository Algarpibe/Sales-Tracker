# Export Excel (.xlsx) — Diseño

**Goal:** Añadir export a Excel (.xlsx) en las 4 vistas que hoy exportan CSV (Artículos, Clientes, Cliente×Artículo, Tablas), vía un menú "Exportar ▾" que ofrece CSV y Excel. Formato: cabecera en negrita+congelada, moneda con formato numérico, anchos, y fila TOTAL en negrita.

**Arquitectura:**
- **Builders puros** (cliente, testeables) transforman los datos que la página ya tiene en un `ExcelSheet` (spec de hoja).
- **Server action** `generateXlsx(sheets)` → `requireApproved()`, construye el workbook con **exceljs (Node)**, devuelve **base64**. exceljs no entra al bundle del cliente.
- **Helper cliente** `downloadXlsx(sheets, filename)` → llama al action, decodifica base64 → Blob → descarga.
- **`ExportMenu`** (common) con `dropdown-menu` (ya existe) reemplaza a `CsvButton`.

**Tech:** Next 16 (server actions), exceljs (server-only), vitest.

---

## Modelo de datos (compartido cliente+servidor) — `src/lib/excel-types.ts`

```ts
export interface ExcelColumn { header: string; width?: number; numFmt?: string }
export interface ExcelRow { cells: (string | number | null)[]; bold?: boolean }
export interface ExcelSheet { name: string; columns: ExcelColumn[]; rows: ExcelRow[] }
```
- Los importes van como **números reales** en las celdas; el formato ($) lo pone `numFmt` de la columna. El % va como ratio (0..1) con `numFmt "0.0%"`.
- Filas de grupo/TOTAL llevan `bold: true`.

## Server action — `src/actions/export-actions.ts`

```ts
"use server";
export async function generateXlsx(sheets: ExcelSheet[]): Promise<string> // base64
```
- `await requireApproved()`; `const ExcelJS = (await import("exceljs")).default`.
- Por hoja: `ws.columns` (header+width), estilar fila 1 (negrita + relleno) y congelarla (`ws.views=[{state:"frozen",ySplit:1}]`), `addRow` por fila (negrita si `bold`), `numFmt` por columna. `wb.xlsx.writeBuffer()` → `Buffer.from(buf).toString("base64")`.

## Helper cliente — `src/lib/excel-client.ts`

```ts
"use client";
export async function downloadXlsx(sheets: ExcelSheet[], filename: string): Promise<void>
```
- `generateXlsx(sheets)` → base64 → `Uint8Array` → Blob (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) → descarga por `<a download>`.

## Componente — `src/components/common/export-menu.tsx`

`ExportMenu({ onCsv, onXlsx, disabled })`: botón "Exportar" con `DropdownMenu` → ítems **CSV** y **Excel (.xlsx)**. Reemplaza `CsvButton` en las 4 páginas; **se elimina `csv-button.tsx`**.

---

## Builders por vista (puros, testeables)

Añadir junto a las funciones `*ToCsv` existentes:

1. **`itemsToExcel(rows): ExcelSheet`** (`item-sales.ts`) — cols: SKU, Nombre, Categoría, Cantidad (`#,##0`), Importe (`"$"#,##0.00`), Precio promedio (`"$"#,##0.00`). Filas = items; TOTAL bold (cantidad+importe). name "Artículos".
2. **`customerMatrixToExcel(matrix, years, grand): ExcelSheet`** (`customer-sales.ts`) — cols: Cliente, [años…] (`"$"#,##0.00`), Total (`"$"#,##0.00`), % (`0.0%`, ratio value/grand). Filas = matrix; TOTAL bold. name "Clientes".
3. **`customerItemToExcel(groups, grand): ExcelSheet`** (`customer-item.ts`) — cols: SKU, Marca, Nombre, Categoría, Cantidad (`#,##0`), Mano de Obra/Cal, C&R, Equipos, Operación (4 buckets `"$"#,##0.00`). Por grupo: fila cabecera bold (nombre + totales de bucket) + filas de ítem (importe en la columna de su bucket, `null` en las otras). TOTAL bold. name "Cliente×Artículo".
4. **Tablas** — el pivote categoría×mes se construye **inline** en la página (como su CSV actual, que también es inline): cols Categoría + 12 meses (`"$"#,##0.00`) + Total; filas de `pivotRows`; fila TOTAL bold. Sin builder de lib (paridad con su CSV inline).

## Integración en las 4 páginas
- Reemplazar `<CsvButton onClick={exportCsv} .../>` por `<ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} disabled={...} />`.
- Añadir `exportXlsx = () => downloadXlsx([builder(...)], "<archivo>.xlsx")`.
- Nombres de archivo: reusar el patrón de los CSV (p. ej. `ventas_cliente_${tipo}_${desde}_${hasta}.xlsx`).

## Tests (`*.test.ts` de las libs)
Unit tests de `itemsToExcel`, `customerMatrixToExcel`, `customerItemToExcel`: columnas correctas (headers + numFmt), nº de filas, celdas de una fila de muestra, fila TOTAL con `bold:true`, importes como número (no string), % como ratio. El action/exceljs no lleva unit test (integración → build + descarga real).

## Dependencia
Añadir `exceljs` (server-only; se importa dinámicamente dentro del action, nunca en cliente).

## Fuera de alcance
"Copiar tabla" al portapapeles (lote hermano); export de gráficos; builder de lib para Tablas (queda inline como su CSV).
