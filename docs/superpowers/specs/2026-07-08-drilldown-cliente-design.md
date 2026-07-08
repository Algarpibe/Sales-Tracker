# Drill-down de cliente — Diseño

**Goal:** Página "cliente 360" en `/clientes/[customer]` a la que se llega haciendo clic en una fila de la matriz de Clientes. Muestra, para un cliente: KPIs, evolución anual, mezcla por macro-categoría, top artículos, margen y estacionalidad.

**Arquitectura:** Client component que lee el nombre del cliente de la ruta (`useParams` + `decodeURIComponent`). **Sin SQL nuevo**: cada sección reutiliza una action existente y filtra client-side por el cliente; react-query deduplica con las vistas de lista. Matemática de filtrado/agregación en helpers puros testeables (`src/lib/customer-detail.ts`).

**Tech:** Next 16 (App Router, dynamic route), react-query, recharts, Tailwind + UI propios, vitest.

---

## Ruta y disparador

- Ruta dinámica: `src/app/(dashboard)/clientes/[customer]/page.tsx`.
- El segmento es el **nombre del cliente codificado** con `encodeURIComponent`. La página lo lee con `useParams<{ customer: string }>()` y lo decodifica.
- **Disparador:** en `src/app/(dashboard)/clientes/page.tsx`, la celda del nombre de cada fila pasa a ser un `Link` a `/clientes/${encodeURIComponent(r.customer)}` (con hover subrayado).
- Limitación conocida (aceptada en MVP): nombres con `/` no se enrutan bien (raros; ninguno en la base actual). Datos llaveados por nombre; migración a `customer_id` fuera de alcance.

## Controles (cabecera de la página)

- `RecordTypeSelect` (OV/FAC), **default FAC (`INVOICE`)**.
- Selector de **año** (2021 → año actual), **default año actual**. Reusa el patrón de `/cliente-articulo`.
- La **evolución** usa todos los años; las secciones por-año usan el año seleccionado. Estado local (no en URL) en MVP.

---

## Secciones / componentes

Todas las cards: `"use client"`, react-query, tooltip a nivel de módulo (`ChartTooltipProps`), skeleton en carga, "Sin datos" si vacío, error → boundary (`throwOnError`). Carpeta `src/components/customers/`.

1. **`CustomerKpiRow({ customer, recordType, year })`** — query `getCustomerSales({ tipo, desdeAnio: 2021, hastaAnio: <año actual> })` + `getMarginByCustomer({ tipo, anio: year })`. Tiles:
   - **Ventas {año}** = fila del cliente para ese año.
   - **Margen % {año}** (bienes) = de su fila en margin-customer.
   - **Ventas histórico** = suma de todos sus años.
   - **Cliente desde {primer año}** = mínimo año con ventas > 0.
2. **`CustomerEvolutionCard({ customer, recordType, year })`** — `getCustomerSales` (rango completo) filtrado → **BarChart** de ventas por año (todos), resaltando el año seleccionado (barra en color primario vs atenuado). Tooltip con `formatUSD`.
3. **`CustomerBucketMixCard({ customer, recordType, year })`** — `getCustomerItemSales({ tipo, anio: year })` filtrado → 4 buckets vía `bucketForCategory` → **PieChart** dona con los colores estándar de bucket (`#6366f1 #10b981 #f59e0b #ef4444`). Tooltip con importe y % del total.
4. **`CustomerTopItemsCard({ customer, recordType, year })`** — misma query `["customer-item", { tipo, anio }]` (**dedup** con #3) → top 15 artículos por importe → **BarChart horizontal**.
5. **`CustomerMarginCard({ customer, recordType, year })`** — `getMarginByCustomer({ tipo, anio: year })` filtrado a su fila → tiles **Ventas / Costo / Margen $ / Margen %** (bienes) del año. Subtítulo "estimado, solo bienes".
6. **`CustomerSeasonCard({ customer, recordType, year })`** — `getCustomerMonthSales({ tipo, anio: year })` filtrado → array de 12 meses → **BarChart** de importe por mes (Ene–Dic). Tooltip con `formatUSD`.

### Layout de la página
```
← Volver a Clientes
[Nombre]                         [OV/FAC] [Año ▾]
[CustomerKpiRow — 4 tiles]
[CustomerEvolutionCard — full width]
grid lg:cols-2:  [CustomerBucketMixCard] [CustomerTopItemsCard]
grid lg:cols-2:  [CustomerMarginCard]    [CustomerSeasonCard]
```
Cada card se lazy-loadea con `dynamic(..., { ssr:false })` o import directo (client component); seguir el patrón de la carpeta.

---

## Helpers puros (`src/lib/customer-detail.ts`)

```ts
export interface CustomerYearPoint { year: number; ventas: number }
export function customerYearSeries(rows: CustomerYearRow[], customer: string): CustomerYearPoint[]; // filtra + ordena por año asc
export function customerFirstYear(rows: CustomerYearRow[], customer: string): number | null;        // min año con ventas>0, null si ninguno
export function customerTotalVentas(rows: CustomerYearRow[], customer: string): number;             // suma de sus años

export interface CustomerBuckets { mano_obra: number; cr: number; equipos: number; operacion: number; total: number }
export function customerBuckets(rows: CustomerItemRow[], customer: string): CustomerBuckets;         // suma por bucketForCategory

export interface CustomerItemPoint { label: string; sku: string | null; importe: number }
export function customerTopItems(rows: CustomerItemRow[], customer: string, n: number): CustomerItemPoint[]; // orden importe desc, top n

export function customerMonths(rows: CustomerMonthRow[], customer: string): number[];                // array 12, índice 0=enero

export interface CustomerMarginKpi { ventas: number; costo: number; margen: number; margenPct: number }
export function customerMarginKpi(rows: MarginCustomerRow[], customer: string): CustomerMarginKpi;   // find fila + deriveMargin
```
Reusa `bucketForCategory` (`@/lib/customer-item`) y `deriveMargin` (`@/lib/analytics-margin`). Tipos de `@/types/database`.

## Tests (`src/lib/__tests__/customer-detail.test.ts`)
- `customerYearSeries` (filtra al cliente, orden asc), `customerFirstYear` (min con ventas>0; null si vacío), `customerTotalVentas`.
- `customerBuckets` (suma correcta por bucket con categorías de ejemplo).
- `customerTopItems` (orden desc + slice).
- `customerMonths` (índice mes-1, longitud 12).
- `customerMarginKpi` (find + deriveMargin; cliente inexistente → todo 0).

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/app/(dashboard)/clientes/[customer]/page.tsx` (crear) | Página: params, selectores, layout, compone las cards. |
| `src/lib/customer-detail.ts` (crear) | Helpers puros de filtrado/agregación por cliente. |
| `src/lib/__tests__/customer-detail.test.ts` (crear) | Tests de los helpers. |
| `src/components/customers/customer-kpi-row.tsx` (crear) | KPIs. |
| `src/components/customers/customer-evolution-card.tsx` (crear) | Evolución anual. |
| `src/components/customers/customer-bucket-mix-card.tsx` (crear) | Dona de buckets. |
| `src/components/customers/customer-top-items-card.tsx` (crear) | Top artículos. |
| `src/components/customers/customer-margin-card.tsx` (crear) | Tiles de margen. |
| `src/components/customers/customer-season-card.tsx` (crear) | Barras por mes. |
| `src/app/(dashboard)/clientes/page.tsx` (mod) | Nombre de fila → `Link` al detalle. |

Reusa: `getCustomerSales`, `getCustomerItemSales`, `getCustomerMonthSales`, `getMarginByCustomer`; `RecordTypeSelect` (`@/components/common/record-type-select`); `formatUSD`/`formatCompactUSD`; `ChartTooltipProps`; `bucketForCategory`; `deriveMargin`.

## Permisos / seguridad
- Solo lectura (actions con `requireApproved`). Sin credenciales en código. Sin SQL nuevo.

## Fuera de alcance
- `customer_id` en consultas; sincronizar selectores con la URL; enlazar el drill-down desde Análisis / Cliente×Artículo (se puede añadir después); nombres con `/` en la ruta.
