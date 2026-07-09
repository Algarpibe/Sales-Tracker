# Estacionalidad por categoría (bucket × mes) — Diseño

**Goal:** Card en la pestaña Comercial de `/analytics` que muestra los 4 macro-buckets (Mano de Obra/Cal, C&R, Equipos, Operación) apilados a lo largo de los 12 meses del año seleccionado.

**Arquitectura:** Consulta nueva al hub (mes × `category_name`) que replica la fórmula neta; el cliente mapea categoría→bucket con `bucketForCategory` y agrega en un helper puro. Card lazy con react-query, patrón Comercial.

**Tech:** Next 16, react-query, recharts, Tailwind, pg, vitest.

---

## Tipos (añadir a `types/database.ts`)
```ts
export interface CategoryMonthFilters { tipo: RecordType; anio: number }
export interface CategoryMonthRow { mes: number; categoria: string | null; importe: number } // mes 1..12
```

## Consulta hub — `src/db/hub-category-month-sales.ts`
Misma plantilla que `hub-customer-month-sales.ts` (SOURCES por tipo, fórmula neta), pero:
- `JOIN books.items it ON it.item_id = l.item_id` para la categoría.
- `SELECT extract(month from h.date)::int AS mes, it.category_name AS categoria, <VENTAS neto> AS importe`.
- `WHERE extract(year from h.date) = $1 AND l.bcy_rate IS NOT NULL AND h.status NOT IN ('void','draft')`.
- `GROUP BY extract(month from h.date), it.category_name`.
- Map: `{ mes:Number, categoria: r.categoria ?? null, importe:Number }`.

## Action — `src/actions/category-month-actions.ts`
`getCategoryMonthSales(f): Promise<CategoryMonthRow[]>` con `await requireApproved()` (patrón `customer-month-actions.ts`).

## Helper — añadir a `analytics-comercial.ts`
```ts
export interface BucketSeasonRow { mes: number; mano_obra: number; cr: number; equipos: number; operacion: number }
export function buildBucketSeason(rows: CategoryMonthRow[]): BucketSeasonRow[];
```
- Inicializa 12 filas (mes 1..12) con los 4 buckets a 0.
- Por fila de entrada: `bucketForCategory(categoria)` → suma `importe` al bucket de `months[mes-1]` (guard 1..12).
- Devuelve las 12 filas en orden.
- Reusa `bucketForCategory` (`@/lib/customer-item`).

## Card — `src/components/charts/comercial/season-by-bucket-card.tsx`
`SeasonByBucketCard({ recordType, year })`:
- `useQuery(["category-month", { tipo: recordType, anio: year }], () => getCategoryMonthSales({ tipo: recordType, anio: year }))`.
- `buildBucketSeason(rows)`; map a `{ mesLabel, ...buckets }` con `MESES = ["Ene"…"Dic"]`.
- **BarChart apilado**: X = `mesLabel`; 4 `Bar` con `stackId="1"` (Mano de Obra/Cal `#6366f1`, C&R `#10b981`, Equipos `#f59e0b`, Operación `#ef4444`); `Legend`; tooltip módulo-level (`ChartTooltipProps`) con importe por bucket (`formatUSD`) + total. Eje Y `formatCompactUSD`.
- Skeleton en carga; "Sin datos" si todos los meses en 0; error → boundary.
- Ancho completo.

## Integración — `analytics/page.tsx`
- `dynamic(() => import(".../season-by-bucket-card").then(m => m.SeasonByBucketCard), { ssr:false, loading: chartSkeleton })`.
- En `TabsContent value="comercial"`, dentro del `div.space-y-6`, tras las cards actuales: `<SeasonByBucketCard recordType={recordType} year={yearA} />`.

## Tests (`analytics-comercial.test.ts`)
`buildBucketSeason`: dado filas de varios meses/categorías, verifica 12 filas, asignación a bucket correcta por mes (usa categorías conocidas: `"CAL PM"`→mano_obra, `"C&R X"`→cr, default→equipos), y meses sin datos en 0.

## Permisos / seguridad
Solo lectura (`requireApproved`); tablas por `tipo` en servidor; año en `$1`. Sin credenciales en código.

## Fuera de alcance
Categorías de ítem crudas (heatmap); estacionalidad por cliente (ya está C4); comparación interanual.
