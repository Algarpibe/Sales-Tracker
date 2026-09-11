# Barra de periodo en la pestaña Margen — Diseño

**Goal:** En la pestaña Margen de `/analytics` (Análisis Inteligente), la misma barra de controles que ya tiene Comercial: conmutador Órdenes (OV) / Facturas (FAC) y selector de año.

**Arquitectura:** La barra de Comercial se extrae a un componente presentacional compartido, `PeriodBar`, que usan Comercial y Margen, conectado al periodo compartido (`usePeriod()`). Las cuatro tarjetas de margen ya reciben `recordType` (y tres de ellas `year`), y las consultas al hub ya eligen las líneas de órdenes o de facturas según el tipo. No hay datos, servidor, migraciones ni SQL nuevos.

**Tech:** Next 16, React 19, base-ui, Playwright.

---

## Contexto verificado
- Exploración, Forecast y Comercial pintan `RecordTypeToggle` en su cabecera (`analytics/page.tsx:234`, `:309`, `:360`). Margen no tiene cabecera de controles (`:392-401`).
- El spec original (`2026-07-08-margen-rentabilidad-design.md:125`) solo indica pasar `recordType` y `year={yearA}` a las tarjetas. No hubo una decisión de dejar Margen sin controles.
- `src/db/hub-margin.ts` elige `books.salesorder_line_items` o `books.invoice_line_items` según `tipo`.

## Componente — `src/components/common/period-bar.tsx` (nuevo)
- `"use client"`. Presentacional: sin estado propio y sin leer contexto.
- Firma: `PeriodBar({ recordType, onRecordTypeChange, year, onYearChange, className? })`, con `recordType: RecordTypeValue`, `onRecordTypeChange: (v: RecordTypeValue) => void`, `year: number` y `onYearChange: (y: number) => void`.
- Pinta exactamente el bloque actual de Comercial (`page.tsx:358-375`), con las mismas clases:
  - Contenedor: `flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3`, combinado con `className` mediante `cn`.
  - `RecordTypeToggle` con `value={recordType}` y `onValueChange={onRecordTypeChange}`.
  - Envoltorio del año: `flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm`.
  - `Select` con `value={String(year)}` y `onValueChange={(v) => { if (v) onYearChange(Number(v)); }}`; trigger `w-[125px] border-none bg-transparent shadow-none h-8 font-semibold`; opciones de `getYearRange()` con la etiqueta `Año {y}`.
- El comentario del componente lo describe como controlado: el padre es dueño del tipo y del año y recibe los cambios.

## Página — `src/app/(dashboard)/analytics/page.tsx`
- **Comercial:** el bloque de controles se sustituye por `<PeriodBar recordType={recordType} onRecordTypeChange={setRecordType} year={yearA} onYearChange={setYearA} />`. Sin cambio visual.
- **Margen:** el mismo `<PeriodBar>`, con las mismas props, como primer hijo del `div.space-y-6` de `TabsContent value="margen"`, antes de `MarginKpiCard`.
- Exploración (años A y B) y Forecast (solo tipo) no cambian.
- Sin imports sin uso: el lint no puede pasar de 10 warnings.

## Comportamiento
- Tipo y año son el periodo compartido de `usePeriod()`: cambiarlos en Margen también los cambia en Exploración, Forecast y Comercial, y se guardan en `localStorage` (`salestracker.period`). Es lo mismo que ya ocurre hoy entre esas pestañas.
- El año afecta a "Margen por artículo", "Importe vs margen" y "Margen por cliente". "Margen bruto estimado" muestra todos los años y solo responde al tipo; eso no cambia.
- Los widgets de margen del dashboard general no cambian.

## Pruebas — `e2e/specs/margin.spec.ts` (nuevo)
TDD: los tests se escriben primero y el de Margen debe fallar antes de implementar. Los recoge el proyecto `chromium` (`testDir: ./e2e/specs`). Usan `test.use({ storageState: APPROVED_STATE })`, así que no hacen login ni consumen el rate limit.

Los localizadores se acotan a la pestaña activa, para no confundir la barra de Margen con los controles de otras pestañas.

1. **"Comercial y Margen muestran la barra de periodo".** En cada una de las dos pestañas son visibles el conmutador ("ÓRDENES (OV)" y "FACTURAS (FAC)") y el selector de año. En Comercial ya pasa antes del cambio y protege el refactor; en Margen falla antes del cambio.
2. **"En Margen, el tipo y el año cambian los datos".**
   - Seleccionar FAC explícitamente y leer el valor del tile "Ventas (bienes)". Pasar a OV y comprobar que el valor es estrictamente mayor. Es determinista por la semilla del hub (`e2e/db/seed-hub.mjs`): las órdenes cubren todos los meses y las facturas solo los pares, con las mismas líneas.
   - Elegir "Año 2024" y comprobar que se ve el título "Margen por artículo 2024".
   - Sin excepciones de página (`pageerror`), como en `charts.spec.ts`.

## Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest sin cambios: 124 pasados + 1 saltado.
- E2E: 31/31 (29 actuales + 2 nuevos), con `E2E_PG_PORT=55433`.

## Entrega
- Rama `feat/margen-barra-periodo`, un commit por tarea, PR contra `main` con CI en verde.
- Despliega el operador. Sin migración ni SQL.

## Fuera de alcance
- Selector de año B (comparación) en Margen.
- Tipo o año independientes por pestaña o por tarjeta.
- Filtrar "Margen bruto estimado" por año.
- Cambios en los widgets de margen del dashboard general.
