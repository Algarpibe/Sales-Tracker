# Widgets de Exploración y Forecast (dashboard v2) — Diseño

**Contexto:** El dashboard configurable v1 (22 widgets) dejó fuera los gráficos de Exploración y Forecast porque dependían de su página padre. Este lote los incorpora y elimina la ruta temporal `/spike-grid`.

**Goal:** Catálogo de 22 → 32 widgets (10 nuevos), con secciones nuevas "Exploración" y "Forecast".

**Arquitectura:** Extraer a **funciones puras** la lógica que hoy vive en `useMemo` de `analytics/page.tsx`, y que la usen **tanto la página como los widgets nuevos** (sin duplicar). Los componentes ya autónomos solo se registran.

**Tech:** Next 16, react-query, recharts, vitest. Sin BD ni migraciones.

---

## Hallazgos de la exploración (verificados)
- `HistoricalSalesCategory()` — sin props, carga sus datos. **Ya enchufable.**
- `ForecastSalesCategory({baseYear})` — autónomo. **Ya enchufable.**
- `GroupEvolutionCard` / `GroupForecastCard` — declaran `savedGroups` en su interfaz pero **nunca lo usan** (prop vestigial). Se elimina de ambas interfaces y de las llamadas en `analytics/page.tsx`.
- `GroupingAnalysisCard({categories, recordType})` — necesita `categories`, ya disponibles en el provider del dashboard.
- Pendientes de extracción: Análisis Financiero, las 2 tarjetas de forecast, el gráfico estacional y el "Global Mensual" (los dos últimos inline en la página).

## 1. Lib puro — `src/lib/tech-service.ts`
Mueve aquí `ST_CATEGORIES` / `CR_CATEGORIES` (hoy en `analytics/page.tsx:124-133`) y el cálculo del `useMemo` de `techServiceData`:
```ts
export type TechServiceViewMode = "MONTHLY" | "QUARTERLY" | "ANNUAL";
export function buildTechServiceData(
  recordsA: SalesRecord[],   // año A
  recordsB: SalesRecord[],   // año B
  catMap: Map<string,string>,
  recordType: RecordType,
  viewMode: TechServiceViewMode,
): TechServiceDataPoint[];
```
Devuelve los slots (12 meses / 4 trimestres / 1 anual) con `st, cr, total, acum, st_prev, cr_prev, total_prev, acum_prev`. `analytics/page.tsx` pasa a llamarla en lugar de su `useMemo`.

## 2. Lib puro — `src/lib/forecast-widget-data.ts`
```ts
export function monthlyTotals(records: SalesRecord[], year: number, recordType: RecordType): number[]; // 12
export function historicalMatrix(records: SalesRecord[], years: number[], recordType: RecordType): number[][];
```
Alimenta el `computeForecast` existente (`@/lib/forecast`) desde un conjunto de registros de todos los años.

## 3. Componentes nuevos (autónomos)
- **`src/components/charts/dashboard/tech-service-widget.tsx`** — `{recordType, yearA, yearB, records, prevRecords, catMap}`; estado interno `viewMode`; renderiza `TechServiceAnalysis` con los datos de `buildTechServiceData`.
- **`src/components/charts/dashboard/forecast-summary-widget.tsx`** — `{recordType, year, scope: "month"|"year"}`; `useQuery(["sales",{}])` → `computeForecast` → renderiza `PredictiveRunRateCard` con `info` del `CHART_HELP`. Un solo componente para las dos tarjetas.
- **`src/components/charts/dashboard/seasonal-forecast-chart.tsx`** — extraído del `ComposedChart` inline de la pestaña Forecast (barras reales + línea de proyección). Autónomo.
- **`src/components/charts/dashboard/monthly-comparison-chart.tsx`** — extraído del `BarChart` inline de Exploración (año A vs año B del tipo seleccionado). Autónomo.

## 4. Cambios de contexto y registro
- `WidgetContext` gana `categories: Category[]` (el provider ya las carga).
- `WIDGET_IDS` y `WIDGETS` suman **10 ids** (catálogo 22 → 32):
  - **Exploración (5):** `global-mensual`, `analisis-financiero`, `historico-categoria`, `agrupaciones`, `evolucion-grupos`
  - **Forecast (5):** `forecast-mes`, `forecast-anio`, `forecast-estacional`, `forecast-categoria`, `forecast-grupos`
- `WidgetSection` añade `"Exploración"` y `"Forecast"`; el `WidgetPicker` los muestra en ese orden.
- `CHART_HELP` gana las claves que falten para los widgets nuevos.

## 5. Limpieza
- Borrar `src/app/(dashboard)/spike-grid/page.tsx` (y el directorio). `react-grid-layout` permanece: lo usa el dashboard.
- Quitar `savedGroups` de las interfaces de `GroupEvolutionCard`/`GroupForecastCard` y de sus llamadas.
- `analytics/page.tsx`: usar los libs nuevos y los componentes extraídos, eliminando el código inline duplicado y los `useMemo` movidos.

## Testing
`src/lib/__tests__/tech-service.test.ts`: agrega ST/CR por slot; acumulados corrientes correctos; separa año A/B; los 3 viewModes devuelven 12/4/1 slots; categoría desconocida no suma.
`src/lib/__tests__/forecast-widget-data.test.ts`: `monthlyTotals` filtra por año y tipo, longitud 12; `historicalMatrix` devuelve una fila por año en el orden pedido.

## Fuera de alcance
- Refactor visual de los componentes extraídos (se mueven tal cual).
- Responsive por breakpoints del grid.

## Notas
- Todos los widgets nuevos heredan el patrón de altura flexible ya aplicado (`h-full` + `flex-1` + `minHeight` anulado dentro del widget).
- Degradación: los ids nuevos solo aparecen si el usuario los añade; los layouts guardados siguen válidos.
