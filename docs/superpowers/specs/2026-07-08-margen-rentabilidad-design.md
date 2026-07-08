# Margen / Rentabilidad — Diseño

**Goal:** Nueva pestaña **"Margen"** en `/analytics` con 4 vistas de margen bruto estimado, calculado sobre ventas reales usando el costo estándar del maestro de ítems (`purchase_rate`), **solo para bienes** (ítems con `purchase_rate > 0`):
- **KPI + evolución anual** (ventas/costo/margen $/margen % + línea de margen % por año)
- **Margen por artículo** (top 15 por margen $)
- **Dispersión importe vs margen %** (punto por artículo)
- **Margen por cliente** (top 15 por margen $)

**Arquitectura:** 3 consultas nuevas al hub (por año, por artículo, por cliente) que unen líneas de venta con `books.items` para leer `raw->>'purchase_rate'`. Helpers puros testeables en un módulo nuevo `analytics-margin.ts`. 4 cards lazy-load con react-query en una pestaña propia. "Margen por artículo" y "Dispersión" comparten la misma consulta (dedup).

**Tech:** Next 16, react-query, recharts (line/bar/scatter), Tailwind + UI propios, pg, vitest.

**Feasibilidad (verificada en Zoho):** los ítems de Ambientalia (org `714421387`, Inventario activo) tienen `purchase_rate` poblado y variable (márgenes reales 20–50 % en muestra). El hub replica el payload del ítem (ya leemos `raw->>'manufacturer'`), por lo que `raw->>'purchase_rate'` debe existir — **se verifica como Tarea 1 del plan antes de construir las cards.**

---

## Cómputo del margen (definición única)

Por cada línea de venta de un bien:
- `ingreso = bcy_rate · quantity · factorDescuento` (neto, MISMA fórmula que `hub-customer-sales.ts`).
- `costo = purchase_rate · quantity` (del maestro; **no** se le aplica descuento).
- Filtro de bien: `NULLIF(it.raw->>'purchase_rate','')::numeric > 0` (excluye servicio/mano de obra sin costo y valores vacíos/nulos).

Agregado: `margen = Σingreso − Σcosto`; `margen% = margen / Σingreso` (0 si Σingreso = 0).

**Etiqueta obligatoria en UI:** "Margen bruto estimado — costo estándar del maestro, solo bienes". Es aproximación (no COGS al momento de venta) y **excluye servicios**, por lo que no representa el margen de toda la facturación.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | + filtros y filas de margen. |
| `src/db/hub-margin.ts` (crear) | 3 consultas: `getHubMarginByYear`, `getHubMarginByItem`, `getHubMarginByCustomer` (SOURCES + fórmula compartidos). |
| `src/actions/margin-actions.ts` (crear) | 3 actions con `requireApproved`. |
| `src/lib/analytics-margin.ts` (crear) | `deriveMargin` + `buildMarginByYear` / `buildMarginItems` / `buildMarginCustomers` + tipos derivados. |
| `src/lib/__tests__/analytics-margin.test.ts` (crear) | tests de los helpers. |
| `src/components/charts/margin/margin-kpi-card.tsx` (crear) | Vista 1. |
| `src/components/charts/margin/margin-by-item-card.tsx` (crear) | Vista 2. |
| `src/components/charts/margin/margin-scatter-card.tsx` (crear) | Vista 3. |
| `src/components/charts/margin/margin-by-customer-card.tsx` (crear) | Vista 4. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | Nueva pestaña "Margen": TabsTrigger + TabsContent + 4 dynamic imports. |

Reusa: `getHubPool` (`@/db/hub`), `requireApproved` (`@/lib/auth/guards`), `formatUSD`/`formatCompactUSD` (`@/lib/constants`), `ChartTooltipProps` (`@/lib/chart-types`), patrón SOURCES + fórmula neta de `hub-customer-sales.ts`.

---

## Tipos (añadir a `types/database.ts`)

```ts
// ===== Margen / rentabilidad (solo bienes, costo estándar) =====

export interface MarginByYearFilters { tipo: RecordType }
export interface MarginFilters { tipo: RecordType; anio: number }

export interface MarginYearRow { year: number; ventas: number; costo: number }
export interface MarginItemRow { item_id: string; sku: string | null; nombre: string; ventas: number; costo: number }
export interface MarginCustomerRow { customer: string; ventas: number; costo: number }
```

---

## Consultas hub (`src/db/hub-margin.ts`)

`SOURCES` idéntico al de `hub-customer-sales.ts`. Expresiones compartidas:
- `VENTAS = round(sum(l.bcy_rate * l.quantity * COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric,0)/NULLIF(h.bcy_sub_total,0),1))::numeric,2)::float8`
- `COSTO = round(sum(NULLIF(it.raw->>'purchase_rate','')::numeric * l.quantity)::numeric,2)::float8`
- JOIN `books.items it ON it.item_id = l.item_id`; filtros comunes `l.bcy_rate IS NOT NULL`, `h.status NOT IN ('void','draft')`, `NULLIF(it.raw->>'purchase_rate','')::numeric > 0`.

1. **`getHubMarginByYear({ tipo })`** → `MarginYearRow[]`
   - `SELECT extract(year from h.date)::int AS year, VENTAS, COSTO ... GROUP BY 1 ORDER BY 1`. Todos los años; sin parámetro de fecha.
2. **`getHubMarginByItem({ tipo, anio })`** → `MarginItemRow[]`
   - `SELECT it.item_id, it.sku, it.name AS nombre, VENTAS, COSTO ... WHERE extract(year from h.date) = $1 GROUP BY it.item_id, it.sku, it.name`.
3. **`getHubMarginByCustomer({ tipo, anio })`** → `MarginCustomerRow[]`
   - `SELECT h.customer_name AS customer, VENTAS, COSTO ... WHERE extract(year from h.date) = $1 AND h.customer_name IS NOT NULL GROUP BY h.customer_name`.

Todas seleccionan tabla por `tipo` en servidor (sin inyección); año parametrizado (`$1`). Mapear numéricos con `Number()`.

---

## Actions (`src/actions/margin-actions.ts`)

3 funciones `"use server"`, cada una `await requireApproved()` y delega en la consulta hub correspondiente. Patrón idéntico a `customer-month-actions.ts`.

---

## Helpers (`src/lib/analytics-margin.ts`)

```ts
export interface MarginDerived { margen: number; margenPct: number }
export function deriveMargin(ventas: number, costo: number): MarginDerived; // margen=ventas-costo; margenPct=ventas>0?margen/ventas*100:0

export interface MarginYearPoint { year: number; ventas: number; costo: number; margen: number; margenPct: number }
export interface MarginTotals { ventas: number; costo: number; margen: number; margenPct: number }
export function buildMarginByYear(rows: MarginYearRow[]): { series: MarginYearPoint[]; totals: MarginTotals };
// series ordenada por year asc con deriveMargin por fila; totals = deriveMargin sobre Σventas/Σcosto.

export interface MarginItemPoint { label: string; sku: string | null; ventas: number; costo: number; margen: number; margenPct: number }
export function buildMarginItems(rows: MarginItemRow[]): MarginItemPoint[];
// label=nombre; deriveMargin por fila; orden por margen desc (desempate label.localeCompare). La card recorta top 15 / usa todos para scatter.

export interface MarginCustomerPoint { customer: string; ventas: number; costo: number; margen: number; margenPct: number }
export function buildMarginCustomers(rows: MarginCustomerRow[]): MarginCustomerPoint[];
// deriveMargin por fila; orden por margen desc (desempate customer.localeCompare). La card recorta top 15.
```

---

## Cards (`src/components/charts/margin/`)

Todas: skeleton en carga; "Sin datos" si vacío; error → error boundary (`throwOnError`); subtítulo con la etiqueta de "estimado, solo bienes".

1. **`MarginKpiCard({ recordType })`** — query `["margin-year",{tipo}]` → `getMarginByYear`. `buildMarginByYear`. Tiles: Ventas, Costo, Margen $ (`formatUSD`), Margen % (`totals.margenPct.toFixed(1)%`). Debajo, **LineChart** de `margenPct` por año (eje 0–100). Ancho completo.
2. **`MarginByItemCard({ recordType, year })`** — query `["margin-item",{tipo,anio}]` → `getMarginByItem`. `buildMarginItems(rows).slice(0,15)`. **BarChart horizontal** de `margen` (color emerald `#10b981`); tooltip con ventas, costo, margen $ y margen %. 
3. **`MarginScatterCard({ recordType, year })`** — MISMA query `["margin-item",{tipo,anio}]` (dedup con #2). **ScatterChart**: X=`ventas` (`formatCompactUSD`), Y=`margenPct` (0–100), punto por artículo; `ReferenceLine y=` margen % global (de `deriveMargin` sobre Σ de los puntos). Tooltip con label, ventas, margen %.
4. **`MarginByCustomerCard({ recordType, year })`** — query `["margin-customer",{tipo,anio}]` → `getMarginByCustomer`. `buildMarginCustomers(rows).slice(0,15)`. **BarChart horizontal** de `margen` (emerald); tooltip con ventas, costo, margen $, margen %.

Tooltips a nivel de módulo (evitar `react-hooks/static-components`), tipados con `ChartTooltipProps`.

---

## Integración `analytics/page.tsx`
- 4 `dynamic(() => import(...).then(m => m.X), { ssr:false, loading: chartSkeleton })`.
- Añadir `<TabsTrigger value="margen">` a la `TabsList` (mismo estilo que los triggers existentes) y un `<TabsContent value="margen">` con: `MarginKpiCard` (full width) → `grid lg:grid-cols-2` con `MarginByItemCard` + `MarginScatterCard` → `MarginByCustomerCard` (full width). Pasar `recordType` y, donde aplique, `year={yearA}`.

---

## Tests (`analytics-margin.test.ts`)
- `deriveMargin`: caso normal (100/40 → margen 60, 60 %); `ventas=0` → margenPct 0 (sin división por cero).
- `buildMarginByYear`: series ordenada + totales correctos (Σ y % global).
- `buildMarginItems`: orden por margen desc, label=nombre, margen%/margen por fila.
- `buildMarginCustomers`: orden por margen desc.

---

## Permisos / seguridad
- Solo lectura vía actions con `requireApproved`; `getHubPool()` (hub_reader). Tablas por `tipo` en servidor; año en `$1`. Nunca hardcodear credenciales.

## Fuera de alcance
- Margen real por lote / COGS histórico al momento de venta.
- Rentabilidad de servicios/mano de obra (sin costo en el maestro).
- Márgenes por marca/categoría (posible lote posterior).
