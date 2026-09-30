# Ventas por cliente × categoría — Diseño

**Goal:** Añadir una sección nueva, **«Ventas por cliente × categoría»**, accesible desde el menú de la izquierda. Funciona igual que «Ventas por cliente × artículo», pero cada cliente se desglosa por categoría en lugar de por artículo.

**Arquitectura:** una página nueva, `/cliente-categoria`, que reutiliza la lectura existente `getCustomerItemSales`, con la misma clave de react-query, y agrega en el cliente por (cliente, categoría). No hay consultas nuevas al hub ni cambios en la base de datos. La macro-categoría de cada categoría sale de la configuración (`categories.macro_categoria`, #35).

---

## 1. Contexto verificado (2026-09-29)

- La sección de artículos es `src/app/(dashboard)/cliente-articulo/page.tsx`:
  - agrupa por cliente con `groupByCustomer` (`src/lib/customer-item.ts`);
  - muestra una fila de cabecera por cliente con los totales por macro-categoría y, debajo, una fila por artículo (SKU, marca, nombre, categoría, cantidad e importe en la columna de su macro-categoría), cerrando con una fila TOTAL;
  - sus controles son OV/FAC (`RecordTypeToggle`), el año, «Comparar años» (`Switch`), el buscador (`SearchInput`) y la exportación (`ExportMenu`: copiar, CSV y Excel);
  - la comparación la hacen `CustomerItemCompareTable` y `buildCustomerItemCompare` (`src/lib/customer-item-compare.ts`).
- `getCustomerItemSales({ tipo, anio })` requiere `requireApproved()`. Devuelve filas `CustomerItemRow` con `customer`, `sku`, `marca`, `nombre`, `categoria`, `cantidad` e `importe`. Su clave de react-query es `["customer-item", { tipo, anio }]`.
- La macro-categoría se obtiene con `mapaMacroCategorias` y `bucketForCategory(nombre, mapa)`, a partir de la consulta `MACRO_CATEGORIAS_KEY`. Los nombres de las macro-categorías están en `BUCKET_LABELS`.
- El menú está en `src/components/layout/sidebar.tsx` y `mobile-nav.tsx`. La entrada «Cliente × Artículo» apunta a `/cliente-articulo`.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Forma | La misma que la sección de artículos: una cabecera por cliente y una fila por categoría. |
| Comparar años | Incluido, igual que en la sección de artículos. |
| Cantidad | Se mantiene la columna: es la suma de unidades de los artículos de la categoría, aunque mezcle unidades de artículos distintos. |
| Datos | Se reutiliza `getCustomerItemSales` y se agrega en el cliente. Las cifras cuadran por construcción con las de la sección de artículos. |
| Menú | «Cliente × Categoría», justo debajo de «Cliente × Artículo», en la barra lateral y en el menú móvil. |
| Acceso | Todos los usuarios aprobados, como la sección de artículos. |

## 3. Lógica pura

**`src/lib/customer-category.ts`:**
- `CustomerCategoryRow { categoria: string | null; bucket: Bucket; cantidad: number; importe: number }`.
- `CustomerCategoryGroup { customer: string; categorias: CustomerCategoryRow[]; totals: Record<Bucket, number> }`.
- `groupByCustomerCategory(rows: CustomerItemRow[], mapa): CustomerCategoryGroup[]`:
  - suma la cantidad y el importe por (cliente, categoría);
  - calcula la macro-categoría con `bucketForCategory`, y con ella los totales del cliente;
  - ordena las categorías por importe descendente y los clientes alfabéticamente, como `groupByCustomer`;
  - las ventas sin categoría forman una sola fila con `categoria: null`, que se muestra como «Sin categoría».
- `filterCategoryRows(rows, search)`: filtra por cliente o por nombre de categoría, sin distinguir mayúsculas.
- `customerCategoryToCsv(groups, grand)` y `customerCategoryToExcel(groups, grand)` siguen el mismo formato que las de artículos:
  - columnas Categoría, Cantidad y las cuatro de `BUCKET_LABELS`;
  - una fila de cliente con sus totales y una fila TOTAL al final.
- Los totales generales se calculan con `computeGrandTotals` de `customer-item.ts`, que ya existe; se generaliza su tipo si hace falta, sin duplicarla.

**`src/lib/customer-category-compare.ts`:**
- `buildCustomerCategoryCompare(rowsA, rowsB)`: por cliente, una fila por categoría con el importe de cada año. Incluye las categorías que solo aparecen en uno de los dos años, con 0 en el otro. Cada cliente lleva sus totales por año. Sigue el mismo criterio de orden que `buildCustomerItemCompare`.

## 4. Página

`src/app/(dashboard)/cliente-categoria/page.tsx`:
- Título: «Ventas por cliente × categoría».
- Controles, igual que en la sección de artículos: OV/FAC, año, «Comparar años» con año A y año B, buscador («Buscar cliente o categoría…») y exportación.
- Mientras carga la clasificación de macro-categorías, la exportación se desactiva y la tabla muestra su esqueleto, como en la sección de artículos.
- Tabla de un año:
  - cabecera por cliente, con enlace al detalle del cliente como en la sección de artículos;
  - filas de categoría;
  - fila TOTAL.
- Modo comparación: `src/components/cliente-categoria/customer-category-compare-table.tsx`, con las columnas Categoría, Importe {año A}, Importe {año B} y Δ% (`DeltaCell`).
- Si hay patrones compartibles con la sección de artículos (los selectores de año, por ejemplo), se reutilizan. No se refactoriza la página de artículos más allá de lo que haga falta para compartir.

## 5. Menú

Se añade `{ href: "/cliente-categoria", label: "Cliente × Categoría", icon: <icono de lucide acorde> }` justo después de «Cliente × Artículo», en `sidebar.tsx` y `mobile-nav.tsx`. Si hay una lista de rutas protegidas o de títulos, como en el proxy o la navegación E2E, se añade también allí.

## 6. Pruebas

**vitest:**
- `groupByCustomerCategory`:
  - varios artículos de la misma categoría se suman en una fila, tanto la cantidad como el importe;
  - las ventas sin categoría forman una fila;
  - la macro-categoría sale del mapa, y sin entrada cuenta como Equipos;
  - los totales de cada cliente coinciden con los de `groupByCustomer` sobre las mismas filas (test de coherencia con la sección de artículos);
  - se cumple el orden establecido.
- `filterCategoryRows`: filtra por cliente y por categoría.
- `buildCustomerCategoryCompare`: una categoría que solo aparece en un año sale con 0 en el otro, y los totales por año son correctos.
- Exportación: cabeceras, fila de cliente y fila TOTAL.

**E2E** (`e2e/specs/cliente-categoria.spec.ts`):
- La entrada del menú abre la página y el título es visible.
- El total de un cliente de la semilla coincide con el de la sección de artículos.
- El modo «Comparar años» muestra las columnas de los dos años.
- Se añade `/cliente-categoria` al spec de navegación si lista las rutas.

## 7. Despliegue

Solo código: no necesita migración.

## 8. Fuera de alcance

- La vista en matriz, con una columna por categoría.
- Un filtro por macro-categoría.
