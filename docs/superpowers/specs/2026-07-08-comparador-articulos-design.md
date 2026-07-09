# Comparador de periodos — Sub-lote 2: Artículos — Diseño

**Contexto:** Segundo sub-lote del comparador (reusa el motor `compare.ts` del sub-lote 1). Añade un **modo comparación por año A vs B** a la vista Artículos.

**Goal:** Toggle "Comparar años" en `/articulos`; en ON, elegir Año A/B y ver por artículo **Importe A · Importe B · Δ%**.

**Arquitectura:** Helper puro que une dos años por `item_id`; un componente de tabla de comparación autocontenido; el resto client-side (sin SQL nuevo). Reusa `computeDelta`/`formatDeltaPct` y un `DeltaCell` compartido.

**Tech:** Next 16, react-query, vitest.

---

## Helper — `src/lib/item-compare.ts`
```ts
export interface ItemCompareRow {
  item_id: string; sku: string | null; nombre: string; categoria: string | null;
  importeA: number; importeB: number; deltaPct: number | null;
}
export function buildItemCompare(rowsA: ItemSalesRow[], rowsB: ItemSalesRow[]): ItemCompareRow[];
```
- Une por `item_id` (unión de ambos años). Ítem solo en A → `importeB=0`; solo en B → `importeA=0`.
- `deltaPct = computeDelta(importeA, importeB).deltaPct`.
- Conserva sku/nombre/categoria (de A si existe, si no de B).

## `DeltaCell` compartido — `src/components/common/delta-cell.tsx`
Extraer el `DeltaCell` que hoy vive local en `clientes/page.tsx` a un componente compartido (`{ a, b }` → % coloreado verde/rojo/neutro vía `computeDelta`+`formatDeltaPct`). Actualizar `clientes/page.tsx` para importarlo (quitar la copia local). Reutilizado por la tabla de Artículos.

## Componente — `src/components/articulos/item-compare-table.tsx`
`ItemCompareTable({ tipo, yearA, yearB })` **autocontenido**:
- Dos `useQuery` `["item-sales", { tipo, desde, hasta }]` para A (`{A}-01-01`..`{A}-12-31`) y B → dedup con la vista normal cuando coincide.
- `buildItemCompare(rowsA, rowsB)`.
- Controles propios: búsqueda (SKU/nombre) + filtro de categoría (opciones derivadas de las filas de comparación).
- Orden propio: por `importeA` (default desc), `importeB`, `delta`, `sku`, `nombre`, `categoria`.
- Tabla: SKU · Nombre · Categoría · **Importe {A}** · **Importe {B}** · **Δ%** (`DeltaCell`). Skeleton / "Sin datos".

## Página — `articulos/page.tsx`
- Añadir `year` de `usePeriod()` (default de A) + estado `compareMode` (Switch), `yearA` (default `year`), `yearB` (default `year - 1`).
- **Toggle "Comparar años"** (`Switch` de `@/components/ui/switch`) junto a los controles.
- **compareMode ON:** ocultar inputs de fecha, mostrar `Select` Año A / Año B; ocultar búsqueda/categoría/Export normales y la tabla normal; renderizar `<ItemCompareTable tipo={tipo} yearA={yearA} yearB={yearB} />`.
- **compareMode OFF:** comportamiento actual intacto.
- La query normal `["item-sales", {tipo,desde,hasta}]` se puede dejar como está (o `enabled: !compareMode` para no pedir en modo compare).

## Tests — `src/lib/__tests__/item-compare.test.ts`
`buildItemCompare`: une por item_id; ítem solo-A (`importeB=0`, deltaPct null); solo-B (`importeA=0`, deltaPct −1); ítem en ambos (deltaPct correcto); conserva nombre del año presente.

## Fuera de alcance
Export de la comparación; cantidades/precio en modo compare; sub-lote 3 (Cliente×Artículo).
