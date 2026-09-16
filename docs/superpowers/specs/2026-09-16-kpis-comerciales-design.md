# Tabla de KPIs comerciales — Diseño

**Goal:** En la pestaña Comercial de `/analytics`, encima de "Mix por macro-categoría (evolución anual)", una tabla de KPIs comerciales que sustituya al Excel de seguimiento: KPIs por mes, cumplimiento por periodo, promedio, aporte ponderado y total.

**Arquitectura:** Catálogo de KPIs en código (claves, etiqueta, periodicidad y si es automático), cálculo en helpers puros aparte, metas y pesos en una tabla nueva por empresa y año que edita un administrador desde Configuración, y cálculo en servidor a partir del zoho-hub. En esta primera versión se calculan 3 de los 8 KPIs; los otros 5 se muestran vacíos con su motivo.

**Tech:** Next 16, React 19, Drizzle, @tanstack/react-query, vitest, Playwright.

---

## 1. Contexto verificado

- El hub solo replica Zoho Books: `books.items`, `books.sales_orders`, `books.salesorder_line_items`, `books.invoices`, `books.invoice_line_items`. **No hay Zoho CRM ni Zoho Desk**, así que tratos, conversión y tickets no son calculables hoy.
- Las cabeceras de órdenes y facturas **sí llevan el vendedor** en `raw->>'salesperson_name'`, sin filas vacías: en producción aparecen tres nombres, uno de ellos un proceso interno, y las facturas repiten los mismos.
- El proyecto no tiene ningún concepto de meta, peso ni límite: hay que crearlo.
- "Cliente nuevo" ya está definido en la app (`buildNewVsRecurring`, `src/lib/analytics-comercial.ts:119`): su primer año con ventas es el año analizado.
- El análisis de Servicio Técnico ya existe: `ST_CATEGORIES` y `CR_CATEGORIES` y `buildTechServiceData` (`src/lib/tech-service.ts`), que acumula por trimestre y compara dos años.
- Configuración es `/settings`, un componente cliente con formularios en `_components`.
- La última migración es la `0007`. La `0008` estaba reservada por el spec del reset de contraseña, que no se ha implementado: ese spec pasa a `0009`.

## 2. Catálogo de KPIs — `src/lib/commercial-kpis.ts` (nuevo)

Ocho KPIs con clave estable, en el orden del modelo. La definición vive en código; en la base de datos solo van meta y peso.

| Clave | Etiqueta | Periodicidad | Unidad | Origen |
|---|---|---|---|---|
| `ventas_nuevos` | Ventas clientes nuevos | Trimestral | USD | Automático |
| `ventas_existentes` | Ventas clientes existentes | Trimestral | USD | Automático |
| `tratos_nuevos` | Generación de tratos · clientes nuevos | Mensual | Conteo | Pendiente (Zoho CRM) |
| `tratos_existentes` | Generación de tratos · clientes existentes | Mensual | Conteo | Pendiente (Zoho CRM) |
| `tratos_ganados` | Tratos cerrados ganados | Mensual | Conteo | Pendiente (Zoho CRM) |
| `tickets_st` | Tickets de Servicio Técnico en plazo | Mensual | Porcentaje | Pendiente (Zoho Desk) |
| `incremento_st` | Incremento de ventas de Servicio Técnico | Trimestral | Porcentaje | Automático |
| `ingresos_proyectos` | Ingresos por proyectos | Semestral | USD | Pendiente (manual) |

**Ninguna meta real va en el repositorio.** El repositorio es público y las metas son objetivos de negocio: la migración crea la tabla vacía y los valores los introduce el administrador. La semilla E2E usa metas sintéticas.

## 3. Metas y pesos

### 3.1 Migración `drizzle/0008_kpi_targets.sql` (nueva)
Tabla `kpi_targets` con `id`, `company_id` (FK a `companies`, `ON DELETE CASCADE`), `record_year` (integer), `kpi_key` (text), `salesperson` (text, nulo), `target_value` (`numeric(15,2)`), `weight_pct` (`numeric(5,2)`) y `updated_at`.

**Las metas son por vendedor y también del total de la compañía.** `salesperson` nulo significa el total; con nombre, la meta de ese comercial. La unicidad es `UNIQUE NULLS NOT DISTINCT (company_id, record_year, kpi_key, salesperson)`, disponible desde Postgres 15 (producción va por la 17 y la base de test por la 16), para que el nulo cuente como un valor más y no admita dos filas del total.

Restricciones adicionales: `target_value > 0` y `weight_pct` entre 0 y 100. No hace falta un índice aparte por `(company_id, record_year)`: es prefijo del índice único. Se añade `kpiTargets` al final de `src/db/schema.ts`, después de `historicalCustomerSales`.

### 3.2 Acciones — `src/actions/kpi-actions.ts` (nuevo)
- `getKpiTargets(year)`: `requireApproved`, devuelve las filas de la empresa para ese año.
- `saveKpiTargets({ year, salesperson, items })`: `requireRole("admin")`, valida con zod que cada clave existe en el catálogo, que `target_value > 0`, que los pesos están entre 0 y 100, que ambos traen como mucho dos decimales (la columna es `numeric` y redondear por detrás dejaría la pantalla bloqueada) y que los pesos **suman exactamente 100 dentro de ese ámbito**; hace upsert por `(company_id, record_year, kpi_key, salesperson)` en una transacción y borra las claves de ese ámbito que ya no se envían. Devuelve `ActionResult`.
- `getSalespeople()`: nombres de vendedor del hub, para el selector de ámbito.

### 3.3 Pantalla — `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx` (nuevo)
- Solo para administradores: para el resto la tarjeta no se muestra.
- Dos selectores: año (mismo rango que `getYearRange()`) y **ámbito**: "Total compañía" o uno de los vendedores del hub. Cada ámbito tiene sus metas y sus pesos suman 100 por separado.
- Una fila por KPI del catálogo con su etiqueta, periodicidad, meta y peso.
- Muestra la suma de pesos en vivo y deja guardar solo si es 100. Al guardar, `toast` de éxito o el error de la acción.

## 4. Cálculo

### 4.1 Consultas al hub — `src/db/hub-kpi.ts` (nuevo)
- `getHubSalespeople()`: nombres distintos de `raw->>'salesperson_name'` en órdenes y facturas no anuladas, ordenados. Alimenta los dos selectores: el de ámbito en Configuración y el de propietario en la tabla. **Entra en el primer PR**, porque la pantalla de metas ya lo necesita.
- `getHubCustomerMonthByOwner({ tipo, anio, owner })`: igual que `getHubCustomerMonthSales`, que vive en `src/db/hub-customer-month-sales.ts` (mismo neto de descuento de cabecera y misma exclusión de `void`/`draft`), añadiendo `AND h.raw->>'salesperson_name' = $2` cuando llega `owner`. La tabla se elige en servidor con la constante `SOURCES` a partir de `tipo`, nunca por entrada del usuario.

### 4.2 Helpers puros — `src/lib/kpi-score.ts` (nuevo)
- `splitNewExisting(rows, firstYearByCustomer, year)`: reparte los importes mensuales en dos series de 12 según si el primer año del cliente es el año analizado.
- `periodTotals(monthly, period)`: suma los 12 meses en 12, 4 o 2 cubos según la periodicidad.
- `attainment(value, target)`: cumplimiento en porcentaje.
- `kpiAverage(values)`: media simple de los cumplimientos del año.
- `kpiContribution(average, weight)`: `min(average, 100) × peso ÷ 100`.
- `scoreboard(rows)`: total renormalizado sobre los KPIs con datos y `coverage` con el peso cubierto.

### 4.3 Antigüedad del cliente

El reparto usa `firstYearByCustomer`, extraído de `buildNewVsRecurring` y exportado desde `src/lib/analytics-comercial.ts` en el segundo PR, en vez de duplicar ese cálculo.

`firstYearByCustomer` sale de `getCustomerSales({ tipo: "INVOICE", desdeAnio: 2015, hastaAnio: thisYear, includeHistory: true })`, la misma clave que ya usan `/clientes` y la ficha, así que comparte caché. Es **de compañía y con histórico**: quien compró en 2018 no es nuevo aunque sea la primera vez que le vende ese comercial, y no depende del conmutador OV/FAC.

### 4.4 Incremento de Servicio Técnico

**Ojo con la fuente:** estas líneas no salen del hub sino de la tabla local `sales_records`, clasificadas por *nombre* de categoría con un `Map<category_id, category_name>`. La tabla de KPIs mezcla por tanto dos orígenes, y reutiliza las cachés `["sales", {}]` y `["categories"]` que `analytics/page.tsx` ya carga.

Variación acumulada del año frente al mismo periodo del año anterior, por trimestre, sobre las categorías de `ST_CATEGORIES`. Helper nuevo `stGrowthByQuarter(recordsA, recordsB, catMap, recordType)` en `src/lib/tech-service.ts`, que reutiliza esas listas sin tocar `buildTechServiceData`. Es un KPI **de compañía**: no se filtra por vendedor y la fila lo indica.

## 5. Tabla — `src/components/charts/comercial/commercial-kpi-table.tsx` (nuevo)

- Se coloca en `analytics/page.tsx`, pestaña Comercial, entre `PeriodBar` y `BucketMixCard`.
- Sigue el conmutador OV/FAC y el año del selector de la pestaña.
- Cabecera con el título, un `InfoTooltip` que explica el cálculo y el **selector de propietario**: "Total compañía" más los nombres que devuelva el hub. No van escritos en el código. El cumplimiento se mide contra las metas de ese mismo ámbito: las del vendedor elegido, o las del total.
- Una fila por KPI del catálogo: etiqueta, los 12 meses, promedio y aporte.
  - **KPIs automáticos:** importe o porcentaje por mes y el cumplimiento bajo el último mes de cada periodo.
  - **KPIs pendientes:** celdas con guion y el motivo ("pendiente de Zoho CRM", "pendiente de Zoho Desk", "pendiente de carga manual"), en gris.
- Fila final **TOTAL**: puntuación renormalizada sobre los KPIs con datos, con la etiqueta "cobertura: X % del peso" al lado. La nota explica que el total solo mide lo que hoy se puede medir y que la cobertura cambiará cuando lleguen CRM y Desk.
- Si el año no tiene metas configuradas, la tabla muestra los valores sin porcentajes y un aviso: "Configura las metas en Configuración". A los administradores se les enlaza la pantalla.
- Estilo de tarjeta del proyecto: `Card` con `flex h-full flex-col`, `CardContent` con `min-h-0 flex-1`, y `Skeleton` mientras carga.

## 6. Pruebas

### 6.1 Vitest — `src/lib/__tests__/kpi-score.test.ts` (nuevo)
Cubre los helpers puros: reparto nuevo/existente (incluido el cliente con primer año anterior), cubos por periodicidad (mensual, trimestral, semestral), cumplimiento con meta cero, media simple, aporte con tope del 100 %, y `scoreboard` (renormalización y cobertura, incluido el caso sin ningún KPI con datos).

### 6.2 Semilla E2E
- `e2e/db/seed-hub.mjs` añade `salesperson_name` al `raw` de órdenes y facturas, repartiendo dos vendedores ficticios.
- `e2e/db/seed-app.mjs` siembra metas y pesos sintéticos en `kpi_targets` para el año en curso, con los pesos sumando 100.

### 6.3 E2E — `e2e/specs/kpis-comerciales.spec.ts` (nuevo)
1. La pestaña Comercial muestra la tabla con la fila TOTAL y la cobertura, y las filas pendientes aparecen con su motivo.
2. El selector de propietario filtra: al elegir un vendedor, el importe de un mes concreto baja respecto a "Total compañía".
3. En Configuración, un administrador guarda metas y la pantalla rechaza guardar si los pesos no suman 100.

## 7. Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest: los actuales más los nuevos del módulo de KPIs.
- E2E: los 34 actuales más 3.

## 8. Entrega
- Rama `feat/kpis-comerciales`, spec y plan dentro de la rama.
- **Tres PR encadenados**, partidos por la prueba que cubre cada mitad. Juntos pasan de 600 líneas, y además el cálculo se prueba con vitest mientras que el SQL solo se ejerce de verdad con Playwright:
  1. Migración, catálogo, consulta de vendedores, acciones y pantalla de Configuración. *(fusionado en #6; las etiquetas de columna y unidad, en #7)*
  2. Helpers puros: reparto nuevo/existente, cubos por periodicidad, cumplimiento, aporte, total renormalizado e incremento de Servicio Técnico. Solo vitest, sin cambios visibles.
  3. Consulta al hub por vendedor, acción y tabla en Comercial, cubiertas por E2E.
- La migración `0008` ya está ejecutada en producción. El spec del reset de contraseña se renumera a `0009`.

## 9. Fuera de alcance
- Tratos de Zoho CRM, tickets de Zoho Desk e ingresos por proyectos: quedan como filas vacías hasta que el worker del hub replique esas fuentes o se defina una carga manual.
- Desglose por vendedor del incremento de Servicio Técnico.
- Exportación de la tabla, histórico de cumplimiento entre años y widget del dashboard configurable.
- Cambiar la definición de cliente nuevo del gráfico "Nuevos vs recurrentes".
