# Histórico 2015-2020 en la ficha de cliente — Diseño

**Goal:** En la ficha de cliente (`/clientes/[customer]`), "Cliente desde", "Ventas histórico" y "Evolución anual" reflejan también el histórico 2015-2020, igual que la vista `/clientes`. "Cliente desde" deja de poder mostrar 2021 para un cliente que compraba antes.

**Arquitectura:** Sin cambios de servidor, SQL ni migraciones: `getCustomerSales` ya mezcla el histórico cuando recibe `includeHistory: true`. Cambian dos componentes de la ficha (`CustomerKpiRow` y `CustomerEvolutionCard`), que piden los datos desde 2015 con el histórico, y un helper puro nuevo en `src/lib/customer-detail.ts` calcula "Cliente desde" combinando Facturas (con histórico) y Órdenes de Venta.

**Tech:** Next 16, @tanstack/react-query, vitest, Playwright.

**Revierte en parte** el alcance de `2026-09-10-historico-ventas-cliente-design.md` (líneas 19 y 180-193), que dejaba la ficha en "solo 2021+". El resto de consumidores de `getCustomerSales` no cambia.

---

## Contexto verificado
- `customer-kpi-row.tsx:12` y `customer-evolution-card.tsx:14` fijan `FIRST_YEAR = 2021` y llaman a `getCustomerSales` sin `includeHistory` (líneas 27-30 y 28-31). La consulta al hub filtra `year BETWEEN desdeAnio AND hastaAnio` (`hub-customer-sales.ts:20`).
- `customerFirstYear` (`customer-detail.ts:14-17`) devuelve el año mínimo con `ventas > 0` de las filas recibidas: con datos desde 2021 nunca puede devolver un año anterior.
- `getCustomerSales` (`customer-sales-actions.ts:21-36`) solo aplica el histórico si `includeHistory === true`, `tipo === "INVOICE"` y `desdeAnio <= 2020`. En ese caso `mergeWithHistory` descarta las filas del hub de 2020 o antes y usa las históricas.
- `/clientes` pide `["customer-sales", { tipo, desdeAnio, hastaAnio, includeHistory: true }]` (`clientes/page.tsx:138-139`).
- El reseteo E2E aplica todas las migraciones de `drizzle/` (`e2e/db/apply-migrations.mjs`), así que la tabla `historical_customer_sales` existe en la BD de test, pero la semilla no le mete filas.
- Semilla del hub: "Alfa Industrial" tiene una Orden de Venta en noviembre de 2020 sin factura, y su primera factura es de 2021. "Gamma Agro" no tiene filas de 2020 (`e2e/db/seed-hub.mjs`).

## Helper — `src/lib/customer-detail.ts`
- Nuevo `customerSinceYear(invoiceRows: CustomerYearRow[], orderRows: CustomerYearRow[], customer: string): number | null`.
- Devuelve el primer año con ventas del cliente en cualquiera de los dos conjuntos: `customerFirstYear([...invoiceRows, ...orderRows], customer)`.
- `customerFirstYear`, `customerYearSeries` y `customerTotalVentas` no cambian.

## Componentes
Constante nueva en ambos componentes: `HISTORY_FIRST_YEAR = 2015`, con un comentario que explique que es el primer año del histórico previo al hub. Sustituye a su `FIRST_YEAR = 2021` local.

### `src/components/customers/customer-kpi-row.tsx`
- Dos consultas, siempre, independientes del conmutador:
  - Facturas con histórico: `["customer-sales", { tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }]`.
  - Órdenes de Venta: `["customer-sales", { tipo: "SALES_ORDER", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }]` (el servidor ignora el histórico para OV; se pasa el flag para usar la misma forma de clave que `/clientes`).
- Conjunto del tipo seleccionado: el de Facturas si `recordType === "INVOICE"`, el de Órdenes si no.
- "Ventas {año}" y "Ventas histórico" salen del conjunto del tipo seleccionado (como hoy, pero ahora desde 2015).
- "Cliente desde" sale de `customerSinceYear(facturas, ordenes, customer)`: no cambia al pulsar el conmutador. Sin ventas, "—" como hoy.
- El skeleton se muestra mientras cargue cualquiera de las tres consultas (las dos de ventas y la de margen).

### `src/components/customers/customer-evolution-card.tsx`
- Una consulta, la del tipo seleccionado, con la misma clave que la fila de KPIs: `["customer-sales", { tipo: recordType, desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }]`. React Query la comparte con la fila de KPIs.
- Con Facturas pinta también las barras de 2015-2020 que tenga el cliente. Con Órdenes, lo que haya en Zoho (2020 aparece parcial, igual que en `/clientes`).
- El resaltado del año seleccionado (`Cell`) no cambia.
- Los años sin ventas no se pintan, como ya ocurre hoy.

### `src/app/(dashboard)/clientes/[customer]/page.tsx`
- No cambia: el selector de año sigue empezando en 2021, porque el resto de tarjetas de la ficha necesitan datos por línea y el histórico solo tiene totales anuales.

## Pruebas
TDD: cada test se escribe primero y debe fallar por el motivo esperado antes de implementar.

### Vitest — `src/lib/__tests__/customer-detail.test.ts`
Cinco tests nuevos para `customerSinceYear`:
1. Gana el año del histórico: facturas con 2017 y 2021, órdenes con 2021 → 2017.
2. Una Orden de Venta anterior a la primera factura gana: facturas con 2022, órdenes con 2021 → 2021.
3. Solo órdenes: facturas vacías, órdenes con 2020 → 2020.
4. Sin ventas del cliente (otro cliente o importes a 0) → `null`.
5. Un año a cero anterior a uno con ventas no cuenta como inicio.

Resultado esperado: 129 pasados + 1 saltado.

### Semilla E2E — `e2e/db/seed-app.mjs`
- Filas ficticias en `historical_customer_sales` para la empresa sembrada: "Gamma Agro" en 2017 y 2019, con importes sintéticos y redondos.
- Ningún test existente lee el histórico (solo `navigation.spec.ts` visita una ficha, y comprueba el título), así que no altera la suite actual.

### E2E — `e2e/specs/customer-detail.spec.ts` (nuevo)
Usa `test.use({ storageState: APPROVED_STATE })`: sin login.
1. **"la ficha incluye el histórico en Cliente desde y en la evolución anual"**: `/clientes/Gamma%20Agro` con Facturas → el tile "Cliente desde" muestra `2017` y la tarjeta "Evolución anual" tiene la marca de eje `2017`. Hoy falla: muestra 2021 y el eje empieza en 2021.
2. **"Cliente desde no depende del conmutador OV/FAC"**: `/clientes/Alfa%20Industrial` → con Facturas el tile muestra `2020`; tras pasar a Órdenes (OV) sigue mostrando `2020`. Hoy falla: muestra 2021.

## Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest: 129 pasados + 1 saltado.
- E2E: 34/34 (32 actuales + 2 nuevos), con `E2E_PG_PORT=55433`.

## Entrega
- Rama `feat/ficha-cliente-historico` creada desde `main`; spec, plan e implementación viven en la rama.
- PR contra `main` con CI en verde y fusión con merge commit `título (#N)`.
- Despliega el usuario en EasyPanel después de la fusión. Sin migración ni SQL.

## Fuera de alcance
- Selector de año de la ficha anterior a 2021 y resto de tarjetas de la ficha (mix, artículos, margen, estacionalidad).
- Otros consumidores de `getCustomerSales` (command palette, pareto, nuevos vs recurrentes).
- Consulta de servidor dedicada para "Cliente desde" (facturas de 2020 en Zoho de clientes que no están en el histórico).
- Rellenar con barras a 0 los años sin ventas o distinguir visualmente las barras del histórico.
