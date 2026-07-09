# Búsqueda global (cmd-k) — Diseño

**Goal:** Un palette (Cmd/Ctrl+K) accesible en todo el dashboard que busca **clientes**, **artículos** y **páginas**, y navega al elegir.

**Arquitectura:**
- **`CommandProvider`** (client, en el layout del dashboard): estado `open`, listener global **Cmd/Ctrl+K** (toggle), renderiza el `CommandDialog` y provee `useCommand()` (para abrir desde el header).
- Datos cargados **al abrir** (`enabled: open`) vía react-query, tipo **FAC**, rango 2021→año actual; clientes deduplicados. cmdk filtra en vivo por el texto visible.
- Al elegir: cierra + `router.push`.

**Tech:** Next 16 (App Router, next/navigation), cmdk (`command.tsx` ya existe), react-query, vitest.

---

## Componentes

### `src/components/common/command-palette.tsx`
- Exporta `CommandProvider` (envuelve el contenido del layout) y `useCommand()` (→ `{ setOpen }`).
- Listener `keydown`: `(e.metaKey || e.ctrlKey) && e.key === "k"` → `preventDefault` + toggle.
- Queries (react-query, `enabled: open`, `staleTime` ~5 min):
  - `["search-customers"]` → `getCustomerSales({ tipo:"INVOICE", desdeAnio:2021, hastaAnio:<año> })` → `dedupeCustomers`.
  - `["search-items"]` → `getItemSales({ tipo:"INVOICE", desde:"2021-01-01", hasta:"<año>-12-31" })`.
- `CommandDialog open onOpenChange` con `CommandInput` + `CommandList`:
  - `CommandEmpty` "Sin resultados."
  - Grupo **"Ir a…"**: páginas estáticas (Inicio, Tablas, Artículos, Clientes, Cliente×Artículo, Análisis, Categorías, Configuración; + Usuarios si `profile.role==="admin"` vía `useAuth`) → `go(href)`.
  - Grupo **"Clientes"** (si hay): cada nombre → `go(customerHref(name))`.
  - Grupo **"Artículos"** (si hay): cada ítem muestra nombre + sku → `go(articleHref(it))`.
- `go = (href) => { setOpen(false); router.push(href); }`.
- **Sin prop `value`** en los `CommandItem`: cmdk deriva el texto buscable del contenido visible (nombre/sku/label) → sin ruido de prefijos.

### Helper puro — `src/lib/global-search.ts`
```ts
export function dedupeCustomers(rows: CustomerYearRow[]): string[]; // nombres únicos, orden localeCompare
export function articleHref(item: { sku: string | null; nombre: string }): string; // /articulos?q=<encode(sku ?? nombre)>
```
Reusa `customerHref` de `@/lib/customer-detail` para clientes.

---

## Integración

- **`src/app/(dashboard)/layout.tsx`**: envolver `<Header/>` + `<main>` con `<CommandProvider>` (client dentro de layout server — ok).
- **`src/components/layout/header.tsx`**: botón "Buscar… ⌘K" → `useCommand().setOpen(true)` (descubribilidad; el atajo funciona igual sin él).
- **`src/app/(dashboard)/articulos/page.tsx`**: leer `?q` con `useSearchParams` y usarlo como valor inicial de `search`. Como `useSearchParams` exige límite Suspense, dividir: `ArticulosContent` (cuerpo actual) + `export default ArticulosPage` que envuelve en `<Suspense fallback={<Skeleton/>}>` (patrón ya usado en Análisis).

---

## Tests (`src/lib/__tests__/global-search.test.ts`)
- `dedupeCustomers`: deduplica y ordena; ignora vacíos.
- `articleHref`: usa `sku` si existe, si no `nombre`; codifica (espacios/acentos).

El palette es UI (sin unit test; validación en build + uso real).

## Notas / rendimiento
- Se renderizan todos los ítems al abrir (probablemente varios cientos; cmdk lo maneja). Si creciera mucho, se acota después.
- FAC como fuente canónica; clientes/artículos solo-OV podrían no aparecer (ampliable).

## Fuera de alcance
Búsqueda en servidor / índice; incluir OV; historial de recientes; resultados de categorías; detalle de artículo.
