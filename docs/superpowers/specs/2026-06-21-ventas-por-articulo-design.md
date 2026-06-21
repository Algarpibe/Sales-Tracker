# Ventas por artículo — Diseño

**Goal:** Nueva página read-only que muestra ventas agregadas **por artículo** (SKU,
nombre, categoría, cantidad, importe, precio promedio) leídas **en vivo del zoho-hub**,
con filtros de tipo (OV/FAC), **rango de fechas**, artículo (SKU/nombre) y categoría;
orden por columnas, fila TOTAL y export CSV. Replica el informe Zoho "Análisis de
Ventas por Artículo".

**Arquitectura:** página cliente (App Router) + una server action que agrega en el
hub vía una consulta `pg` dedicada. react-query para caché; error boundary existente.

**Tech:** Next 16 (App Router, "use client"), react-query, pg (pool del hub ya
existente en `src/db/hub.ts`), Tailwind + componentes UI existentes.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/hub-item-sales.ts` (nuevo) | `getHubItemSales({ tipo, desde, hasta })`: ejecuta la agregación por artículo en el pool del hub y devuelve `ItemSalesRow[]`. |
| `src/actions/item-sales-actions.ts` (nuevo) | Server action `getItemSales(filters)`: `requireApproved` + llama a `getHubItemSales`. Acción de **lectura** (lanza en error; react-query lo maneja — NO usa `ActionResult`, coherente con las demás lecturas). |
| `src/types/database.ts` | Añadir `ItemSalesRow` e `ItemSalesFilters`. |
| `src/lib/item-sales.ts` (nuevo) | Helpers **puros** y testeables: `filterAndSortItems`, `computeItemTotals`, `itemsToCsv`. |
| `src/app/(dashboard)/articulos/page.tsx` (nuevo) | La página: filtros, tabla, total, export. |
| `src/components/layout/sidebar.tsx` y `mobile-nav.tsx` | Entrada de menú "Artículos". |
| `src/lib/__tests__/item-sales.test.ts` (nuevo) | Tests de los helpers puros. |

---

## Capa de datos

`ItemSalesFilters = { tipo: RecordType; desde: string; hasta: string }` (fechas `YYYY-MM-DD`).
`ItemSalesRow = { item_id: string; sku: string | null; nombre: string; categoria: string | null; cantidad: number; importe: number }`.

`getHubItemSales` elige tabla por `tipo` **en servidor** (no es input de usuario → sin
inyección); `desde`/`hasta` van **parametrizados**:

```sql
-- FAC (tipo = INVOICE): books.invoice_line_items + books.invoices
-- OV  (tipo = SALES_ORDER): books.salesorder_line_items + books.sales_orders
SELECT it.item_id, it.sku, it.name AS nombre, it.category_name AS categoria,
       sum(l.quantity)                                  AS cantidad,
       round(sum(l.bcy_rate * l.quantity)::numeric, 2)  AS importe
FROM <line_items> l
JOIN <header> h   ON h.<id> = l.<id>
JOIN books.items it ON it.item_id = l.item_id
WHERE h.date BETWEEN $1 AND $2
  AND l.bcy_rate IS NOT NULL
  AND h.status NOT IN ('void','draft')
GROUP BY it.item_id, it.sku, it.name, it.category_name
ORDER BY importe DESC
```

- **Importe = `bcy_rate*quantity` (BRUTO)** para igualar el informe Zoho "Ventas por
  artículo". *Decisión explícita:* difiere ligeramente de las vistas por categoría,
  que netean el descuento de cabecera. Validado contra el CSV al céntimo por artículo
  (EDM 180C: 418.719,89 vs 418.719,91).
- Filas con `bcy_rate` nulo se excluyen. Cantidades/importes negativos (notas de
  crédito) se incluyen (netean, como en el informe Zoho).
- `cantidad` e `importe` se convierten a `number` en JS (vienen como string/NUMERIC).

---

## Flujo de datos

1. Estado de filtros servidor: `tipo` (OV/FAC), `desde`, `hasta`. Por defecto
   `desde = ${añoActual}-01-01`, `hasta = hoy` (calculado en cliente con `new Date()`).
2. `useQuery(["item-sales", { tipo, desde, hasta }], () => getItemSales(...))`.
3. Filtros **cliente** (sobre las filas traídas, en `useMemo`): búsqueda por
   SKU/nombre (case-insensitive, `includes`), filtro por categoría (select de las
   categorías presentes), y orden por columna (`filterAndSortItems`).
4. `computeItemTotals` → fila TOTAL (suma cantidad, suma importe; precio promedio del
   total = importeTotal/cantidadTotal).
5. Export CSV con `itemsToCsv` (mismas columnas, separador `;` como el informe Zoho).

---

## UI

- **Cabecera:** título "Ventas por artículo" + selector OV/FAC + dos `<input type="date">`
  (desde / hasta).
- **Barra:** input de búsqueda (SKU/nombre) + select de categoría + botón "CSV".
- **Tabla:** columnas **SKU · Nombre · Categoría · Cantidad** (der) **· Importe** (der,
  `formatUSD`) **· Precio promedio** (der, `formatUSD` = importe/cantidad). Cabeceras
  ordenables (toggle asc/desc, por defecto Importe desc). Fila **TOTAL** al final.
- **Estados:** skeleton en carga; vacío ("Sin resultados para el rango/criterios");
  error → sube al error boundary del dashboard (react-query `throwOnError` ya activo).
- Categoría nula → "Sin categoría"; SKU nulo → "—".

---

## Helpers puros (testeables)

```ts
// src/lib/item-sales.ts
filterAndSortItems(rows, { search, categoria, sortKey, sortDir }): ItemSalesRow[]
computeItemTotals(rows): { cantidad: number; importe: number }
itemsToCsv(rows): string   // cabecera + filas + TOTAL, separador ';'
```

## Tests
`item-sales.test.ts`: filtra por búsqueda/categoría, ordena por cada columna, total
correcto (incl. negativos), CSV con cabecera + TOTAL. (La consulta al hub es
integración — fuera de unit/CI, ya validada manualmente contra el CSV.)

## Permisos
Solo lectura, cualquier usuario aprobado (`requireApproved`), igual que los demás
dashboards. Entrada de menú visible para todos los roles.

## Fuera de alcance
Edición, backlog por artículo, multi-moneda, paginación (volumen ~180 filas).
