# Análisis "Comercial" — Lote 2 (A2 · M3 · A3) — Diseño

**Goal:** Añadir 3 gráficos más a la pestaña **Comercial** de `/analytics`, reutilizando actions
existentes y el patrón de cards ya montado:
- **A2 — Pareto de SKUs**: barras (importe por artículo) + línea de % acumulado.
- **M3 — Macro-categoría × top clientes**: barras apiladas de los 4 buckets por cliente.
- **A3 — Mix por marca**: dona del importe por fabricante.

**Arquitectura:** 3 cards cliente autocontenidas (lazy-load) que reutilizan `getItemSales` y
`getCustomerItemSales` vía react-query, respetando `recordType`/`yearA`. Matemática en helpers
puros testeables (en `src/lib/analytics-comercial.ts`). Sin nuevas consultas SQL ni tipos.

**Tech:** Next 16, react-query, recharts, Tailwind + UI propios, vitest.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/analytics-comercial.ts` (mod) | + `buildItemPareto`, `buildBrandMix`, `buildBucketByClient` + tipos. |
| `src/lib/__tests__/analytics-comercial.test.ts` (mod) | + tests de los 3 helpers. |
| `src/components/charts/comercial/sku-pareto-card.tsx` (crear) | A2. |
| `src/components/charts/comercial/bucket-by-client-card.tsx` (crear) | M3. |
| `src/components/charts/comercial/brand-mix-card.tsx` (crear) | A3. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | 3 dynamic imports + 3 cards en `TabsContent value="comercial"`. |

Reusa: `bucketForCategory` de `@/lib/customer-item`; actions `getItemSales`
(`@/actions/item-sales-actions`) y `getCustomerItemSales` (`@/actions/customer-item-actions`);
`formatUSD`/`formatCompactUSD`; `ChartTooltipProps`.

---

## Helpers puros (añadir a `analytics-comercial.ts`)

```ts
export interface ItemParetoRow { label: string; sku: string | null; importe: number; cumPct: number }
export interface BrandMixRow { marca: string; importe: number }
export interface BucketClientRow { customer: string; mano_obra: number; cr: number; equipos: number; operacion: number; total: number }
```

- `buildItemPareto(rows: ItemSalesRow[]): ItemParetoRow[]`
  - `getItemSales` ya devuelve 1 fila por artículo. Ordena por `importe` desc (desempate por
    `nombre`), calcula `cumPct` (% acumulado sobre el total). `label = nombre`. Devuelve completo;
    la card recorta top 30.
- `buildBrandMix(rows: CustomerItemRow[]): BrandMixRow[]`
  - Agrega `importe` por `marca` (`marca ?? "Sin marca"`), orden desc. La card muestra top 8 +
    "Otros" (agrupa el resto).
- `buildBucketByClient(rows: CustomerItemRow[]): BucketClientRow[]`
  - Por `customer`, suma `importe` en el bucket de `bucketForCategory(categoria)`; `total` = suma
    de los 4. Orden por `total` desc. La card recorta top 15.

---

## Cards (autocontenidas, lazy-load)

**A2 `SkuParetoCard({ recordType, year })`:**
- `useQuery(["top-items", { recordType, year }], () => getItemSales({ tipo, desde: \`${year}-01-01\`, hasta: \`${year}-12-31\` }))`
  (misma key que `TopItemsCard` → dedup).
- `buildItemPareto(rows).slice(0, 30)` → **ComposedChart**: `Bar` importe (eje izq) + `Line` cumPct
  (eje der 0–100) + `ReferenceLine y=80`. X = `label` (rotado). Tooltip con `formatUSD` y `%`.

**M3 `BucketByClientCard({ recordType, year })`:**
- `useQuery(["customer-item", { tipo: recordType, anio: year }], () => getCustomerItemSales(...))`
  (misma key que `cliente-articulo` y `BrandMixCard` → dedup).
- `buildBucketByClient(rows).slice(0, 15)` → **BarChart horizontal apilado** (Y = cliente),
  4 `Bar` con `stackId` (Mano de Obra/Cal · C&R · Equipos · Operación) usando los **mismos 4
  colores** que `BucketMixCard`. Tooltip con `formatUSD`.

**A3 `BrandMixCard({ recordType, year })`:**
- Misma query `["customer-item", { tipo, anio }]` (dedup con M3).
- `buildBrandMix(rows)`; la card toma top 8 y agrupa el resto en "Otros" → **PieChart** (dona,
  `innerRadius`) con paleta categórica fija; tooltip con `formatUSD` y % del total.

Todas: skeleton en carga; vacío ("Sin datos"); error → error boundary (react-query `throwOnError`).

---

## Integración `analytics/page.tsx`
- 3 `dynamic(() => import(...).then(m => m.X), { ssr:false, loading: chartSkeleton })`.
- En `TabsContent value="comercial"`, tras las 3 cards actuales, añadir las 3 nuevas
  (A2 a ancho completo; M3 y A3 en `grid lg:grid-cols-2`), pasando `recordType` y `year={yearA}`.

## Colores (consistencia)
- **M3** reutiliza los 4 colores de bucket de `BucketMixCard` (mano_obra `#6366f1`, cr `#10b981`,
  equipos `#f59e0b`, operacion `#ef4444`).
- **A3** paleta categórica fija de 8: `#6366f1 #10b981 #f59e0b #ef4444 #06b6d4 #a855f7 #ec4899 #84cc16`
  + gris `#94a3b8` para "Otros".
- **A2** barra `oklch(0.65 0.2 255)`, línea `#f59e0b`, referencia `#ef4444` (igual que C2).

## Tests (añadir a `analytics-comercial.test.ts`)
`buildItemPareto` (orden desc + cumPct, último 100%); `buildBrandMix` (agrega por marca, null→"Sin
marca", orden desc); `buildBucketByClient` (buckets por cliente correctos, orden por total desc).

## Permisos / fuera de alcance
- Solo lectura (actions con `requireApproved`). Requiere `HUB_DB_URL`.
- Fuera de alcance: Lote 3 (C3 nuevos vs recurrentes, C4 heatmap, margen/rentabilidad).
