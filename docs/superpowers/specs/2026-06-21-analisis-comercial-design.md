# Análisis — pestaña "Comercial" (3 gráficos nuevos) — Diseño

**Goal:** Añadir una tercera pestaña **Comercial** a `/analytics` con 3 gráficos que
explotan las dimensiones nuevas (macro-categoría, cliente, artículo):
- **M2 — Mix por macro-categoría (evolución anual)**: área apilada de las 4 macro-categorías
  (Mano de Obra/Cal · C&R · Equipos · Operación) por año.
- **C2 — Pareto de clientes**: barras (ventas por cliente del año) + línea de % acumulado.
- **A1 — Top artículos**: barras de los top N artículos por **importe** o por **unidades** (toggle).

**Arquitectura:** 3 cards cliente autocontenidas (lazy-load) en la tab nueva; cada una
reutiliza una **action existente** vía react-query y respeta el `recordType` (OV/FAC) y
`yearA` de la página. La matemática va en **helpers puros testeables**. Sin nuevas consultas
SQL ni nuevos tipos de dominio.

**Tech:** Next 16, react-query, recharts, Tailwind + UI propios, vitest.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/analytics-comercial.ts` (crear) | Helpers puros: `buildBucketMixByYear`, `buildClientPareto`, `topItems` + tipos `BucketMixYear`, `ParetoRow`. |
| `src/lib/__tests__/analytics-comercial.test.ts` (crear) | Tests de los helpers. |
| `src/components/charts/comercial/bucket-mix-card.tsx` (crear) | M2 (área apilada). |
| `src/components/charts/comercial/client-pareto-card.tsx` (crear) | C2 (barras + línea %). |
| `src/components/charts/comercial/top-items-card.tsx` (crear) | A1 (barras, toggle $/uds). |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | Nueva `TabsTrigger`/`TabsContent` "comercial" + dynamic imports de las 3 cards. |

Reusa: `bucketForCategory` de `@/lib/customer-item`; actions `getSalesData`,
`getCustomerSales`, `getItemSales`; `formatUSD` de `@/lib/constants`;
`ChartTooltipProps` de `@/lib/chart-types` para tooltips.

---

## Helpers puros (`src/lib/analytics-comercial.ts`)

```ts
export interface BucketMixYear { year: number; mano_obra: number; cr: number; equipos: number; operacion: number }
export interface ParetoRow { customer: string; ventas: number; cumPct: number }
```

- `buildBucketMixByYear(records, tipo)`:
  - `records`: filas tipo `{ categories?: { name: string } | null; record_type: string; record_year: number; amount_usd: number }` (compatible con `SalesRecord` de `getSalesData({})`).
  - Filtra `record_type === tipo` y `record_year >= 2021`; clasifica `categories?.name` con
    `bucketForCategory`; agrega `amount_usd` por (año, bucket). Devuelve `BucketMixYear[]`
    ordenado por año asc, con los 4 buckets (0 si no hay).
- `buildClientPareto(rows)`:
  - `rows`: `CustomerYearRow[]` (de `getCustomerSales` para un solo año). Suma `ventas` por
    `customer`, ordena desc, calcula `cumPct` (% acumulado sobre el total). Devuelve
    `ParetoRow[]` completo (la card recorta top N para mostrar).
- `topItems(rows, metric, n)`:
  - `rows`: `ItemSalesRow[]` (de `getItemSales`). `metric: "importe" | "cantidad"`. Ordena
    desc por la métrica y devuelve los primeros `n`.

---

## Cards (autocontenidas, lazy-load)

**M2 `BucketMixCard({ recordType })`:**
- `useQuery(["sales", {}], () => getSalesData({}))` (mismo key que la página → dedup).
- `buildBucketMixByYear(records, recordType)` → **AreaChart apilado** (recharts), X=año,
  4 `Area` apiladas (Mano de Obra/Cal, C&R, Equipos, Operación) con 4 colores fijos;
  tooltip con `formatUSD`; leyenda.

**C2 `ClientParetoCard({ recordType, year })`:**
- `useQuery(["customer-pareto", { recordType, year }], () => getCustomerSales({ tipo: recordType, desdeAnio: year, hastaAnio: year }))`.
- `buildClientPareto(rows)` → **ComposedChart**: `Bar` (ventas, eje izq) de los **top 20** +
  `Line` (cumPct, eje der 0–100%) + `ReferenceLine y=80` (eje der). Tooltip con `formatUSD` y `%`.

**A1 `TopItemsCard({ recordType, year })`:**
- `useState<"importe"|"cantidad">("importe")` (toggle $/uds).
- `useQuery(["top-items", { recordType, year }], () => getItemSales({ tipo: recordType, desde: \`${year}-01-01\`, hasta: \`${year}-12-31\` }))`.
- `topItems(rows, metric, 15)` → **BarChart** horizontal (nombre en Y, valor en X);
  valor con `formatUSD` ($) o entero (uds) según toggle.

Todas: skeleton en `isLoading`; vacío ("Sin datos"); error → error boundary (react-query
`throwOnError` global). Reciben props desde la página; no tienen estado de servidor propio
salvo su `useQuery`.

---

## Integración en `analytics/page.tsx`
- Añadir `dynamic(() => import(...).then(m => m.X), { ssr:false, loading: skeleton })` para las 3.
- En `TabsList`: `<TabsTrigger value="comercial">Comercial</TabsTrigger>`.
- `<TabsContent value="comercial">`: las 3 cards apiladas, pasando `recordType` (y `year={yearA}`
  a C2/A1). Respeta el selector OV/FAC existente.

## Tests (`analytics-comercial.test.ts`)
`buildBucketMixByYear` (filtra por tipo y año≥2021, clasifica buckets, agrega por año);
`buildClientPareto` (suma por cliente, orden desc, cumPct correcto, último=100%);
`topItems` (orden por importe y por cantidad, recorte top N).

## Permisos / fuera de alcance
- Solo lectura (las actions ya hacen `requireApproved`).
- Requiere `HUB_DB_URL`. 
- Fuera de alcance: los demás análisis propuestos (C1/C3/C4/A2/A3/M1/M3); edición.
