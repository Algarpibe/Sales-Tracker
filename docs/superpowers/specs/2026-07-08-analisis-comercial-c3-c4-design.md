# Análisis "Comercial" — Lote 2 (C3 · C4) — Diseño

**Goal:** Añadir 2 gráficos a la pestaña **Comercial** de `/analytics`:
- **C3 — Nuevos vs recurrentes**: barras apiladas de importe (clientes nuevos vs base recurrente) por año + línea con el conteo de altas nuevas.
- **C4 — Heatmap cliente × mes**: mapa de calor de importe por cliente (top 15) y mes, para el año seleccionado.

**Arquitectura:** 2 cards cliente autocontenidas (lazy-load) en el patrón ya montado. C3 reutiliza `getCustomerSales` (sin SQL nuevo). C4 requiere una consulta nueva al hub (cliente × mes) que replica la fórmula neta de `hub-customer-sales.ts`, garantizando reconciliación con los totales anuales de la vista Clientes. Matemática en helpers puros testeables en `src/lib/analytics-comercial.ts`.

**Tech:** Next 16, react-query, recharts (C3), grid CSS (C4), Tailwind + UI propios, vitest.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/hub-customer-month-sales.ts` (crear) | SQL cliente × mes (importe neto) para un año. |
| `src/actions/customer-month-actions.ts` (crear) | Action `getCustomerMonthSales` con `requireApproved`. |
| `src/types/database.ts` (mod) | + `CustomerMonthRow`, `CustomerMonthFilters`. |
| `src/lib/analytics-comercial.ts` (mod) | + `buildNewVsRecurring`, `buildMonthHeatmap` + tipos. |
| `src/lib/__tests__/analytics-comercial.test.ts` (mod) | + tests de los 2 helpers. |
| `src/components/charts/comercial/new-vs-recurring-card.tsx` (crear) | C3. |
| `src/components/charts/comercial/month-heatmap-card.tsx` (crear) | C4. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | 2 dynamic imports + 2 cards en `TabsContent value="comercial"` (ambas full-width, tras el bloque Lote 1). |

Reusa: `getCustomerSales` (`@/actions/customer-sales-actions`); `formatUSD`/`formatCompactUSD` (`@/lib/constants`); `ChartTooltipProps` (`@/lib/chart-types`); patrón de `hub-customer-sales.ts`.

---

## C3 — Nuevos vs recurrentes

**Definición (acordada):** un cliente es **nuevo** en el año de su **primera venta histórica** (desde 2021); en años posteriores es **recurrente**. El primer año del rango (2021) sale 100% "nuevos" por definición — se indica en el subtítulo de la card.

**Helper** (añadir a `analytics-comercial.ts`):
```ts
export interface NewVsRecurringRow {
  year: number;
  nuevos: number;        // importe de clientes cuya 1ª venta fue este año
  recurrentes: number;   // importe de clientes con 1ª venta anterior
  countNuevos: number;   // nº de clientes nuevos ese año
}
export function buildNewVsRecurring(rows: CustomerYearRow[]): NewVsRecurringRow[]
```
- `CustomerYearRow = { customer, year, ventas }` (1 fila por cliente-año).
- Por cliente: `firstYear` = mínimo `year` con `ventas > 0`; mapa `year → ventas`.
- Conjunto de años = todos los `year` presentes, orden asc.
- Por año Y, sobre todos los clientes: si `firstYear === Y` → `nuevos += ventas` y `countNuevos++`; si `ventas > 0` y `firstYear < Y` → `recurrentes += ventas`.
- Devuelve ordenado por `year` asc.

**Card** `NewVsRecurringCard({ recordType })` (sin prop `year`):
- `thisYear = new Date().getFullYear()`; `FIRST_YEAR = 2021`.
- `useQuery(["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }], () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }))` (misma key que la vista Clientes → dedup cuando el rango coincide).
- `buildNewVsRecurring(rows)` → **ComposedChart**: X = `year`; `Bar nuevos` (stackId "1", `#10b981`) + `Bar recurrentes` (stackId "1", `#6366f1`); `Line countNuevos` (eje derecho, `#f59e0b`, sin dot area). Tooltip módulo-level con `formatUSD` (nuevos/recurrentes) y `countNuevos`.
- Estados: skeleton en carga; "Sin datos" si vacío; error → error boundary (`throwOnError`).

---

## C4 — Heatmap cliente × mes

**Consulta nueva** `hub-customer-month-sales.ts` (misma estructura y fórmula neta que `hub-customer-sales.ts`, agrupando por mes):
```sql
SELECT h.customer_name AS customer,
       extract(month from h.date)::int AS mes,
       round(sum(l.bcy_rate * l.quantity *
         COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
       )::numeric, 2)::float8 AS importe
FROM <lines> l JOIN <header> h ON h.<fk> = l.<fk>
WHERE extract(year from h.date) = $1
  AND l.bcy_rate IS NOT NULL
  AND h.status NOT IN ('void','draft')
  AND h.customer_name IS NOT NULL
GROUP BY h.customer_name, extract(month from h.date)
```
Tablas por tipo elegidas en servidor (patrón SOURCES, sin inyección). `SALES_ORDER` → salesorder_line_items/sales_orders/salesorder_id; resto → invoice_*.

**Tipos** (añadir a `types/database.ts`):
```ts
export interface CustomerMonthFilters { tipo: RecordType; anio: number }
export interface CustomerMonthRow { customer: string; mes: number; importe: number } // mes 1..12
```

**Action** `getCustomerMonthSales(filters: CustomerMonthFilters): Promise<CustomerMonthRow[]>` — `await requireApproved()` y delega en `getHubCustomerMonthSales` (patrón idéntico a `customer-sales-actions.ts`).

**Helper** (añadir a `analytics-comercial.ts`):
```ts
export interface MonthHeatmapRow { customer: string; months: number[]; total: number } // months.length === 12, índice 0 = enero
export function buildMonthHeatmap(rows: CustomerMonthRow[]): MonthHeatmapRow[]
```
- Por cliente: array `months` de 12 ceros; `months[mes-1] += importe`; `total += importe`.
- Devuelve ordenado por `total` desc (desempate `customer.localeCompare`).

**Card** `MonthHeatmapCard({ recordType, year })`:
- `useQuery(["customer-month", { tipo: recordType, anio: year }], () => getCustomerMonthSales({ tipo: recordType, anio: year }))`.
- `buildMonthHeatmap(rows).slice(0, 15)`; `max` = mayor valor de celda entre las filas mostradas (0 → sin color).
- **Render (no recharts):** tabla/grid. Cabecera: columna "Cliente" + 12 meses `Ene…Dic`. Cada celda: fondo emerald con opacidad `v > 0 ? 0.08 + 0.92 * (v / max) : 0` (escala global = importe absoluto); si `v > 0` muestra `formatCompactUSD(v)` en fuente pequeña; `title` nativo con `formatUSD(v)` exacto. Contenedor `overflow-x-auto`.
- Ancho completo. Estados: skeleton; "Sin datos"; error → boundary.

**Etiquetas de mes:** `["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]`.

---

## Integración `analytics/page.tsx`
- 2 `dynamic(() => import(...).then(m => m.X), { ssr:false, loading: chartSkeleton })` (`NewVsRecurringCard`, `MonthHeatmapCard`).
- En `TabsContent value="comercial"`, dentro del `div.space-y-6`, tras el bloque del Lote 1, añadir:
  - `<NewVsRecurringCard recordType={recordType} />` (full width)
  - `<MonthHeatmapCard recordType={recordType} year={yearA} />` (full width)

---

## Tests (añadir a `analytics-comercial.test.ts`)
- **`buildNewVsRecurring`**: dado clientes con distintos `firstYear`, verifica por año la partición nuevos/recurrentes y `countNuevos`; caso de cliente con hueco (compra 2021, no 2022, sí 2023) sigue siendo recurrente en 2023.
- **`buildMonthHeatmap`**: agrega importes al índice `mes-1`, `total` correcto, orden por total desc; array de 12 posiciones.

---

## Permisos / seguridad
- Solo lectura vía actions con `requireApproved`. `getHubCustomerMonthSales` usa `getHubPool()` (hub_reader). Tablas elegidas en servidor por tipo (sin inyección); año parametrizado (`$1`).
- Requiere `HUB_DB_URL` (operador). Nunca hardcodear credenciales.

## Fuera de alcance
- Margen/rentabilidad (lote propio; tarea 1 = verificar `books.items.raw->>'purchase_rate'` en el hub).
- Definición "reactivado" (sin ventas el año previo): descartada a favor de "primera venta histórica".
