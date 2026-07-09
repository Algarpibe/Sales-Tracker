# Comparador de periodos — Sub-lote 1: Clientes — Diseño

**Contexto:** Primer sub-lote de "comparador de periodos en las vistas nuevas" (las 3 vistas, modelo A vs B, en 3 sub-lotes secuenciales). Este establece el **motor de comparación compartido** y lo aplica a la vista Clientes (la de menor riesgo: su matriz ya tiene `byYear`).

**Goal:** En `/clientes`, elegir dos años **A** y **B** y ver una columna **Δ %** (variación A vs B) por cliente, ordenable y coloreada.

**Arquitectura:** Helper puro de comparación (reutilizable por los 3 sub-lotes); en Clientes, 2 selectores A/B + columna Δ, todo client-side sobre `buildCustomerMatrix` (sin SQL nuevo).

**Tech:** Next 16, React, vitest.

---

## Motor compartido — `src/lib/compare.ts`
```ts
export interface Delta { delta: number; deltaPct: number | null }
export function computeDelta(a: number, b: number): Delta;      // delta=a-b; deltaPct=(a-b)/b si b≠0, si no null
export function formatDeltaPct(pct: number | null): string;     // "+12.3%" / "−8.0%" / "0.0%" / "—" (null)
```
- Render de color (en la página): `deltaPct>0` verde, `<0` rojo, `=0`/`null` neutro.

## Vista Clientes — cambios
- **Estado nuevo:** `compareA` (default `hastaAnio`), `compareB` (default `hastaAnio - 1`).
- **Control:** dos `Select` de año ("Comparar A ▾ vs B ▾") con opciones = `years` (el rango desde/hasta actual).
- **Columna nueva "Δ {A}/{B}"** (tras la columna `%`): por fila, `formatDeltaPct(computeDelta(r.byYear[A] ?? 0, r.byYear[B] ?? 0).deltaPct)`, coloreada. En la fila TOTAL, Δ de `totals.byYear[A]` vs `totals.byYear[B]`.
- **Orden:** extender `CustomerSortKey` con `"delta"` y `sortCustomerMatrix` para aceptar un 4º parámetro opcional `compare?: { a: number; b: number }`; cuando `sortKey==="delta"`, ordena por `deltaPct` (null al final). La cabecera Δ usa el `SortHeader` existente con `colKey="delta"`.
- Reusa `buildCustomerMatrix` (ya calcula `byYear`). Sin consultas nuevas.

## Archivos
- **Crear:** `src/lib/compare.ts`, `src/lib/__tests__/compare.test.ts`.
- **Modificar:** `src/lib/customer-sales.ts` (extender `CustomerSortKey` + `sortCustomerMatrix`), su test; `src/app/(dashboard)/clientes/page.tsx` (selectores A/B + columna Δ + sort).

## Tests
- `computeDelta`: a=120,b=100 → {delta:20, deltaPct:0.2}; b=0 → deltaPct null; a=b → 0.
- `formatDeltaPct`: 0.2→"+20.0%"; -0.08→"−8.0%"; 0→"0.0%"; null→"—".
- `sortCustomerMatrix` con `sortKey="delta"` y `compare={a,b}`: ordena por deltaPct desc/asc; filas con B=0 (deltaPct null) al final.

## Notas
- El export (CSV/Excel) de Clientes se deja **sin** la columna Δ en v1 (es una vista de comparación derivada). Ampliable después.
- Si el usuario estrecha el rango y A/B quedan fuera, `byYear[A] ?? 0` lo trata como 0 (sin romper).

## Fuera de alcance (este sub-lote)
Artículos y Cliente×Artículo (sub-lotes 2 y 3); Δ en el export; comparación de más de 2 periodos.
