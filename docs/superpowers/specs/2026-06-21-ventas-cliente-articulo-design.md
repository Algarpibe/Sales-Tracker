# Ventas por cliente × artículo (4 macro-categorías) — Diseño

**Goal:** Nueva página `/cliente-articulo` que muestra, **por cliente**, sus artículos
vendidos en un año, con el importe de cada línea clasificado en una de **4 macro-columnas**
(**Mano de Obra/Cal · C&R · Equipos · Operación**) según la categoría del artículo.
Cabecera por cliente con los 4 subtotales y fila TOTAL general. Lee el zoho-hub en vivo.
Replica el informe Zoho "Ventas por artículo" agrupado por cliente.

**Arquitectura:** página cliente → action `getCustomerItemSales` (`requireApproved`) →
`getHubCustomerItemSales` agrega por (cliente, artículo) en el hub. La clasificación en
buckets, el agrupado por cliente y los totales son **helpers puros testeables**.
react-query + error boundary existentes.

**Tech:** Next 16, react-query, pg (pool hub), Tailwind + UI propios, vitest.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | `CustomerItemFilters`, `CustomerItemRow`. |
| `src/lib/customer-item.ts` (crear) | `Bucket`, `bucketForCategory`, `filterRows`, `groupByCustomer`, `computeGrandTotals`, `customerItemToCsv` + `CustomerGroup`. |
| `src/lib/__tests__/customer-item.test.ts` (crear) | Tests de los helpers. |
| `src/db/hub-customer-item-sales.ts` (crear) | `getHubCustomerItemSales(filters)`. |
| `src/actions/customer-item-actions.ts` (crear) | `getCustomerItemSales(filters)`. |
| `src/app/(dashboard)/cliente-articulo/page.tsx` (crear) | Página/UI. |
| `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` (mod) | Entrada "Cliente × Artículo". |

---

## Capa de datos

`CustomerItemFilters = { tipo: RecordType; anio: number }`.
`CustomerItemRow = { customer: string; sku: string | null; marca: string | null; nombre: string; categoria: string | null; cantidad: number; importe: number }`.

`getHubCustomerItemSales` elige tabla por `tipo` **en servidor**; `anio` parametrizado.
Importe **neto del descuento de cabecera** (igual que el resto; validado al céntimo).
Marca = `books.items.raw->>'manufacturer'` (confirmado: Horiba Ltd., GRIMM, Durag…).

```sql
-- FAC: invoice_line_items (l) + invoices (h) ; OV: salesorder_line_items + sales_orders
SELECT h.customer_name AS customer, it.sku, it.raw->>'manufacturer' AS marca,
       it.name AS nombre, it.category_name AS categoria,
       sum(l.quantity) AS cantidad,
       round(sum(l.bcy_rate * l.quantity *
         COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric,0) / NULLIF(h.bcy_sub_total,0), 1)
       )::numeric, 2)::float8 AS importe
FROM <lines> l
JOIN <header> h ON h.<id> = l.<id>
JOIN books.items it ON it.item_id = l.item_id
WHERE extract(year from h.date) = $1
  AND l.bcy_rate IS NOT NULL
  AND h.status NOT IN ('void','draft')
  AND h.customer_name IS NOT NULL
GROUP BY h.customer_name, it.sku, it.raw->>'manufacturer', it.name, it.category_name
```

---

## Helpers puros (`src/lib/customer-item.ts`)

```ts
export type Bucket = "mano_obra" | "cr" | "equipos" | "operacion";

export interface CustomerGroup {
  customer: string;
  items: CustomerItemRow[];          // ordenados por importe desc
  totals: Record<Bucket, number>;    // subtotales por bucket
}
```

- `bucketForCategory(categoria: string | null): Bucket` — reglas:
  - empieza por `"C&R "` → `cr`
  - empieza por `"CAL "`, o `=== "ST"`, o empieza por `"ST "`, o `=== "Alquileres"` → `mano_obra`
  - `=== "Operación de Redes"` o `=== "Consultoría"` → `operacion`
  - resto (incl. categoría null) → `equipos`
- `filterRows(rows, search)` — `search` (trim/lowercase) contra customer, sku o nombre.
- `groupByCustomer(rows)` — agrupa por `customer`; suma `importe` de cada artículo en
  `totals[bucketForCategory(categoria)]`; items ordenados por importe desc; **clientes en
  orden alfabético** (como el PDF).
- `computeGrandTotals(groups): Record<Bucket, number>` — suma de los 4 buckets sobre todos.
- `customerItemToCsv(groups, grand)` — CSV `;`: fila por cliente (nombre + 4 subtotales),
  filas de artículos (SKU; Marca; Nombre; Categoría; Cantidad; y el importe en la columna
  del bucket), y fila TOTAL con los 4 totales.

---

## Flujo de datos

1. Estado: `tipo` (OV/FAC), `anio` (por defecto año actual). 
2. `useQuery(["customer-item", { tipo, anio }], () => getCustomerItemSales(...))`.
3. `filterRows(rows, search)` → `groupByCustomer(...)` → secciones.
4. `computeGrandTotals(grupos)` → fila TOTAL.

---

## UI (como el PDF)

- **Cabecera:** título + selector **OV/FAC** + selector de **año** (2021..actual).
- **Barra:** buscar (cliente/artículo/SKU) + **CSV**.
- **Tabla** (scroll horizontal), columnas:
  **SKU · Marca · Nombre · Categoría · Cantidad · Mano de Obra/Cal · C&R · Equipos · Operación**.
  - Por cada cliente: una **fila de cabecera** (nombre del cliente ocupando SKU..Cantidad;
    los 4 subtotales en sus 4 columnas, en negrita).
  - Debajo, sus **artículos**: importe en `formatUSD` en la columna del bucket que
    corresponda; las otras 3 columnas vacías.
  - **Fila TOTAL** final: los 4 grandes totales.
- Estados: skeleton; vacío ("Sin ventas en el año"); error → error boundary del dashboard.
- Categoría null → "Sin categoría"; SKU null → "—"; Marca null → "—".

## Tests (`customer-item.test.ts`)
`bucketForCategory` (cada regla + null→equipos); `filterRows` (customer/sku/nombre);
`groupByCustomer` (agrupa, subtotales por bucket correctos, orden alfabético de clientes,
items por importe desc); `computeGrandTotals`; `customerItemToCsv` (cabecera por cliente +
artículos + TOTAL, separador `;`).

## Permisos
Solo lectura, `requireApproved`. Menú visible a todos los roles.

## Fuera de alcance
- % por bucket / por cliente; multimoneda; paginación.
- Requiere `HUB_DB_URL` (sin fallback por cliente/artículo en `sales_records`).
- Casos de categoría dudosos (Comisiones, Intereses, Obra Civil, Accesorios, Opcional*)
  caen en `equipos` por la regla "resto"; ajustar reglas en `bucketForCategory` si se desea.
