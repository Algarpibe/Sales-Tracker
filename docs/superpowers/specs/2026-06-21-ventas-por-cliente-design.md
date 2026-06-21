# Ventas por cliente — Diseño

**Goal:** Nueva página `/clientes` con una **matriz cliente × año** (filas = clientes,
columnas = años) de ventas leídas en vivo del zoho-hub, con selector OV/FAC, rango de
años, búsqueda por cliente, columna Total + % del total, fila TOTAL y export CSV.
Replica el informe Zoho "Ventas por cliente" (general).

**Arquitectura:** página cliente (App Router) → server action `getCustomerSales`
(`requireApproved`) → `getHubCustomerSales` agrega en el pool del hub. La página
**pivota** las filas (customer, year, ventas) a matriz y calcula totales/% en cliente
con helpers puros testeables. react-query para caché; error boundary existente.

**Tech:** Next 16, react-query, pg (pool hub), Tailwind + UI propios, vitest.

---

## Componentes / archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | `CustomerSalesFilters`, `CustomerYearRow`. |
| `src/lib/customer-sales.ts` (crear) | Helpers puros: `buildCustomerMatrix`, `computeColumnTotals`, `filterCustomers`, `customerMatrixToCsv` + tipo `CustomerMatrixRow`. |
| `src/lib/__tests__/customer-sales.test.ts` (crear) | Tests de los helpers. |
| `src/db/hub-customer-sales.ts` (crear) | `getHubCustomerSales(filters)`: consulta agregada (cliente × año) en el hub. |
| `src/actions/customer-sales-actions.ts` (crear) | Action `getCustomerSales(filters)` (`requireApproved`). |
| `src/app/(dashboard)/clientes/page.tsx` (crear) | Página/UI (matriz). |
| `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` (mod) | Entrada "Clientes". |

---

## Capa de datos

`CustomerSalesFilters = { tipo: RecordType; desdeAnio: number; hastaAnio: number }`.
`CustomerYearRow = { customer: string; year: number; ventas: number }`.

`getHubCustomerSales` elige tabla por `tipo` **en servidor** (no input de usuario);
`desdeAnio`/`hastaAnio` van **parametrizados**. Importe **neto del descuento de
cabecera** (igual que el transform; validado: Endémica 209.945,13 ≈ CSV 209.945,14):

```sql
-- FAC: books.invoice_line_items (l) + books.invoices (h)
-- OV:  books.salesorder_line_items (l) + books.sales_orders (h)
SELECT h.customer_name AS customer,
       extract(year from h.date)::int AS year,
       round(sum(
         l.bcy_rate * l.quantity *
         COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0)
                    / NULLIF(h.bcy_sub_total, 0), 1)
       )::numeric, 2)::float8 AS ventas
FROM <line_items> l
JOIN <header> h ON h.<id> = l.<id>
WHERE extract(year from h.date) BETWEEN $1 AND $2
  AND l.bcy_rate IS NOT NULL
  AND h.status NOT IN ('void','draft')
  AND h.customer_name IS NOT NULL
GROUP BY h.customer_name, extract(year from h.date)
```

- FAC: `<line_items>`=`books.invoice_line_items`, `<header>`=`books.invoices`, `<id>`=`invoice_id`.
- OV: `<line_items>`=`books.salesorder_line_items`, `<header>`=`books.sales_orders`, `<id>`=`salesorder_id`.
- **Nota de implementación:** verificar que `books.sales_orders` tenga `customer_name`,
  `bcy_sub_total` y `raw->>'bcy_discount_total'` (la de facturas ya está confirmada).
  Si `sales_orders` no tuviera `bcy_sub_total`, usar el factor de descuento solo si
  existe (el `COALESCE(...,1)` ya lo neutraliza cuando es NULL).
- `ventas` se convierte a `number` en JS.

---

## Helpers puros (`src/lib/customer-sales.ts`)

```ts
export interface CustomerMatrixRow {
  customer: string;
  byYear: Record<number, number>;
  total: number;
}

// Pivota filas (customer, year, ventas) a matriz; ordena por total desc.
buildCustomerMatrix(rows: CustomerYearRow[], years: number[]): CustomerMatrixRow[]

// Totales por año + total general sobre la matriz.
computeColumnTotals(matrix: CustomerMatrixRow[], years: number[]): { byYear: Record<number, number>; grand: number }

// Filtro por nombre de cliente (case-insensitive, includes).
filterCustomers(matrix: CustomerMatrixRow[], search: string): CustomerMatrixRow[]

// CSV: cabecera (Cliente; años; Total; %) + filas + fila TOTAL; separador ';'.
customerMatrixToCsv(matrix: CustomerMatrixRow[], years: number[], grand: number): string
```

`% del total` por cliente = `row.total / grand * 100` (se calcula en el render, no se
almacena).

---

## Flujo de datos

1. Estado servidor: `tipo` (OV/FAC), `desdeAnio`, `hastaAnio`. Por defecto
   `desdeAnio = 2015`, `hastaAnio = año actual` (en cliente con `new Date()`).
2. `years = [desdeAnio..hastaAnio]` (ascendente).
3. `useQuery(["customer-sales", { tipo, desdeAnio, hastaAnio }], () => getCustomerSales(...))`.
4. `buildCustomerMatrix(rows, years)` → matriz ordenada por total desc.
5. `filterCustomers(matrix, search)` (cliente) → filas visibles.
6. `computeColumnTotals(visibles, years)` → fila TOTAL + total general para %.

---

## UI

- **Cabecera:** título "Ventas por cliente" + selector OV/FAC + dos selects de año
  (Desde / Hasta) poblados de 2015 a año actual.
- **Barra:** buscar por cliente + botón CSV.
- **Tabla (matriz):** 1ª columna **Cliente** (sticky), una columna por año del rango
  (importe `formatUSD`, "—" si 0), **Total** (negrita) y **%** (del total general).
  Filas ordenadas por Total desc. Fila **TOTAL** al final (suma por año + total).
  Contenedor con scroll horizontal (como Tablas).
- **Estados:** skeleton en carga; vacío ("Sin ventas en el rango"); error → error
  boundary del dashboard (react-query `throwOnError` ya activo).

## Tests (`customer-sales.test.ts`)
`buildCustomerMatrix` (pivote correcto + orden por total desc + años sin dato a 0);
`computeColumnTotals` (por año y general, incl. negativos); `filterCustomers`
(case-insensitive); `customerMatrixToCsv` (cabecera + filas + TOTAL + separador ';').

## Permisos
Solo lectura, `requireApproved`. Entrada de menú visible para todos los roles.

## Fuera de alcance
- Columna **"% Part"** (tramos Pareto acumulados del CSV general): no se incluye.
- Edición, multimoneda, paginación.
- Requiere `HUB_DB_URL` (sin fallback por cliente en `sales_records`).
