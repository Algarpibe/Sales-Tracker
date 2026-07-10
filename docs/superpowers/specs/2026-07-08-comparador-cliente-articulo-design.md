# Comparador de periodos — Sub-lote 3: Cliente×Artículo — Diseño

**Contexto:** Último sub-lote del comparador. Gemelo del de Artículos pero con tabla **agrupada por cliente**. Reusa el motor `compare.ts` y `DeltaCell`.

**Goal:** Toggle "Comparar años" en `/cliente-articulo`; en ON, por cliente y artículo: **Importe A · Importe B · Δ%**, con totales de grupo A/B/Δ.

**Arquitectura:** Helper puro que une dos años por (cliente, sku); componente de tabla agrupada autocontenido; toggle en la página. Sin SQL nuevo.

**Tech:** Next 16, react-query, vitest.

---

## Helper — `src/lib/customer-item-compare.ts`
```ts
export interface CustomerItemComparePoint {
  sku: string | null; marca: string | null; nombre: string; categoria: string | null;
  importeA: number; importeB: number; deltaPct: number | null;
}
export interface CustomerCompareGroup {
  customer: string;
  items: CustomerItemComparePoint[];
  totalA: number; totalB: number; deltaPct: number | null;
}
export function buildCustomerItemCompare(rowsA: CustomerItemRow[], rowsB: CustomerItemRow[]): CustomerCompareGroup[];
```
- Clave de ítem = `${customer}||${sku ?? nombre}`. Acumula `importe` por (cliente, ítem) y año.
- Agrupa por cliente. Por grupo: `items` ordenados por `importeA` desc (desempate `importeB` desc, `nombre`); `totalA`/`totalB` = suma; `deltaPct = computeDelta(totalA, totalB).deltaPct`; `deltaPct` por ítem igual.
- Grupos ordenados por `customer.localeCompare`. Conserva sku/marca/nombre/categoria (del año presente).

## Componente — `src/components/cliente-articulo/customer-item-compare-table.tsx`
`CustomerItemCompareTable({ tipo, yearA, yearB })` **autocontenido**:
- `search` propio.
- Dos `useQuery` `["customer-item", { tipo, anio }]` para A y B → dedup con la vista normal.
- `buildCustomerItemCompare(filterRows(dataA, search), filterRows(dataB, search))` (reusa `filterRows` de `@/lib/customer-item`).
- Grand totals = suma de `totalA`/`totalB` de los grupos + `computeDelta`.
- Tabla agrupada (mirror de la normal): cabecera de grupo bold = cliente (`<Link href={customerHref(...)}>`) en `colSpan={4}` + `totalA` + `totalB` + `<DeltaCell a={totalA} b={totalB} />`; filas de ítem = SKU · Marca · Nombre · Categoría · `formatUSD(importeA)` · `formatUSD(importeB)` · `<DeltaCell>`; fila TOTAL general. Columnas: 7. Skeleton / "Sin datos".

## Página — `cliente-articulo/page.tsx`
- Añadir `compareMode` (Switch), `yearA` (default `anio` = año foco global), `yearB` (default `anio - 1`).
- Toggle "Comparar años"; en compare mode: el `Select` de Año único se sustituye por Año A / Año B; se oculta la búsqueda/Export normal y la tabla normal; se renderiza `<CustomerItemCompareTable tipo={tipo} yearA={yearA} yearB={yearB} />`.
- Query normal `["customer-item", { tipo, anio }]` con `enabled: !compareMode`.

## Tests — `src/lib/__tests__/customer-item-compare.test.ts`
`buildCustomerItemCompare`: une por (cliente, sku); ítem solo en A (`importeB=0`, deltaPct null) y solo en B (`importeA=0`, deltaPct −1); dos clientes agrupados; `totalA`/`totalB` de grupo correctos; orden de grupos por cliente.

## Fuera de alcance
Export de la comparación; cantidad/buckets en modo compare.
