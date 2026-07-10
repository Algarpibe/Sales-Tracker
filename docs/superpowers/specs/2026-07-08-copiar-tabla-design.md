# Copiar tabla al portapapeles — Diseño

**Goal:** Añadir "Copiar tabla" (al menú Exportar) en las 4 vistas con export (Artículos, Clientes, Cliente×Artículo, Tablas): copia la tabla como **TSV** al portapapeles para pegar en Excel/Sheets.

**Arquitectura:** Reutiliza los builders `*ToExcel` (`ExcelSheet`) que ya existen; un helper puro `sheetToTsv` los convierte a TSV; un helper client escribe al portapapeles; el `ExportMenu` gana el ítem.

**Tech:** Next 16, Clipboard API, vitest.

---

## Helper puro — `src/lib/table-tsv.ts`
```ts
import type { ExcelSheet } from "@/lib/excel-types";
export function sheetToTsv(sheet: ExcelSheet): string;
```
- Cabecera = `columns[].header`; filas = `rows[].cells`. Separador **tab** entre celdas, **\n** entre filas.
- `null` → `""`; números → `String(n)` (crudos, para análisis en hoja de cálculo). Limpia `\t`/`\n`/`\r` internos de las celdas (los sustituye por espacio) para no romper el TSV.

## Helper client — `src/lib/excel-client.ts` (añadir)
```ts
export async function copySheetToClipboard(sheet: ExcelSheet): Promise<void>;
```
- `await navigator.clipboard.writeText(sheetToTsv(sheet))`.

## `ExportMenu` — `src/components/common/export-menu.tsx`
- Nueva prop `onCopy: () => void`.
- Nuevo `DropdownMenuItem` **"Copiar tabla"** (arriba de CSV/Excel).

## Páginas (las 4)
- Añadir handler `onCopy` que construye el MISMO `ExcelSheet` que el export Excel y llama `copySheetToClipboard`, con `toast.success("Tabla copiada")` / `toast.error("No se pudo copiar")`.
  - Artículos: `itemsToExcel(view)`.
  - Clientes: `customerMatrixToExcel(visible, years, grandAll)`.
  - Cliente×Artículo: `customerItemToExcel(groups, grand)`.
  - Tablas: extraer el `ExcelSheet` inline de `handleExportXlsx` a un `makeSheet()` reutilizado por copy y export.
- Pasar `onCopy` al `<ExportMenu>`.

## Tests — `src/lib/__tests__/table-tsv.test.ts`
`sheetToTsv`: cabecera + filas con tabs; `null` → vacío; número → string; celda con tab/salto interno se limpia; sheet sin filas → solo cabecera.

## Notas
- Valores crudos (no formateados): importes como número, el `%` como ratio (0.25). Es lo más útil para pegar y analizar; el usuario aplica formato en la hoja.
- Clipboard API requiere contexto seguro (HTTPS, ya en prod) y gesto de usuario (el clic del menú lo es).

## Fuera de alcance
Copiar en las tablas de comparación (sin export); formato rico/HTML.
