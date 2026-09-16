# Generación de tratos · clientes nuevos y existentes — Diseño

**Goal:** Las dos filas de "Generación de tratos" de la tabla de KPIs comerciales dejan de estar vacías: se calculan desde el zoho-hub, por mes, siguiendo el selector de propietario.

**Arquitectura:** Consulta nueva a `crm.deals` en el hub, un helper puro que reparte los tratos entre clientes nuevos y existentes reutilizando la antigüedad que ya calcula la app desde Books, y dos filas del catálogo que pasan de `pendiente` a `auto`. Sin migración y sin tocar el repositorio del worker.

**Tech:** Next 16, Drizzle no (consulta directa con `pg`), @tanstack/react-query, vitest, Playwright.

---

## 1. Contexto verificado contra el hub de producción

La premisa con la que se escribió el catálogo —"el hub solo replica Zoho Books"— **está obsoleta**. Verificado el 2026-09-16 contra `zoho-hub`:

- El hub tiene cinco esquemas: `public`, `books`, `crm`, `desk` y `portal`. El worker ya replica CRM y Desk.
- `crm.deals` existe con 21 columnas. Las que importan: `id`, `deal_name`, `account_id`, `account_name`, `owner_id`, `owner_name`, `stage`, `amount`, `closing_date`, `created_time` (`timestamptz`), `modified_time`, `raw`.
- **`hub_reader` puede leerlas**: `has_schema_privilege` sobre `crm` y `desk` y `has_table_privilege` sobre `crm.deals` y `desk.tickets` devuelven `t`. No hace falta ningún `GRANT`.
- **No existe `crm.accounts`**, así que el NIT de las cuentas no está disponible en el hub. El cruce con Books tiene que ser por nombre.
- El cruce por nombre es **suficiente**: de las cuentas con trato desde 2025, 58 de 124 casan exacto con un cliente de Books, y normalizando a fondo (minúsculas y sin nada que no sea letra o número) se pasa solo a 60 de 123. Que machacar la puntuación apenas gane nada demuestra que el resto **no son errores de escritura**: son cuentas que de verdad no están en Books, es decir clientes potenciales que aún no han comprado.
- Esas 124 grafías colapsan en 123 claves normalizadas, así que hay una cuenta duplicada con dos escrituras en CRM. Normalizar es barato y evita ese fallo silencioso.
- **Los comerciales se escriben igual en los dos sistemas.** Los valores de `crm.deals.owner_name` coinciden carácter por carácter con los de `raw->>'salesperson_name'` de Books. No hace falta traducir nombres. El tercer valor de Books, el proceso interno, no tiene tratos, lo que encaja con que ya esté excluido del selector por `KPI_EXCLUDED_SALESPEOPLE`.

## 2. Definición de cliente nuevo para los tratos

La app define nuevo como "su primer año con ventas es el año analizado" (`firstYearByCustomer`, `src/lib/analytics-comercial.ts`). Para los tratos hay que extenderla, porque la mitad de las cuentas no ha comprado nunca y no aparece en ese mapa.

**Regla acordada con el usuario:**

> Un trato cuenta como **existente** si su cuenta tiene ventas en Books en algún año **anterior** al analizado. En cualquier otro caso cuenta como **nuevo**: nunca compró, o compró por primera vez este mismo año.

Un prospecto al que se le abren tratos año tras año sin que llegue a comprar sigue contando como nuevo: mientras no compre, el esfuerzo sigue siendo de captación, que es lo que el KPI mide.

## 3. Consulta — `src/db/hub-kpi.ts`

`getHubDealsMonth({ anio, owner })`: devuelve `{ account_name, mes, tratos }[]`, agrupado por cuenta y mes.

```sql
SELECT d.account_name,
       extract(month from d.created_time)::int AS mes,
       count(*)::int AS tratos
FROM crm.deals d
WHERE extract(year from d.created_time) = $1
  AND d.account_name IS NOT NULL
  AND ($2::text IS NULL OR d.owner_name = $2)
GROUP BY d.account_name, extract(month from d.created_time)
```

Sin normalizar en SQL: la clave se calcula en JavaScript para que sea la **misma función** en los dos lados del cruce y se pueda probar con vitest.

Acción `getKpiDealsMonthly(anio, owner)` en `src/actions/kpi-actions.ts`, con `requireApproved()`, igual que `getKpiMonthlySales`.

## 4. Helpers puros — `src/lib/kpi-score.ts`

- `normalizeCustomerKey(nombre: string): string` — minúsculas y fuera todo lo que no sea letra o número (`[^a-z0-9]`, con las tildes reducidas antes). Una sola definición, usada para las cuentas de CRM y para los clientes de Books.
- `splitDealsNewExisting(rows, firstYearByCustomer, year): MonthlySplit` — devuelve las dos series de doce meses. Una fila va a `existentes` solo si la clave normalizada de su cuenta está en el mapa **con un año estrictamente anterior** a `year`; en cualquier otro caso va a `nuevos`.

El mapa de antigüedad se construye normalizando las claves de `firstYearByCustomer`, que hoy vienen con el nombre crudo de Books.

## 5. Catálogo y tabla

- `tratos_nuevos` y `tratos_existentes` pasan a `source: "auto"` y pierden `pendingReason`.
- `commercial-kpi-table.tsx` añade la consulta de tratos y alimenta esas dos filas con las series. La unidad ya es `conteo`, así que se pintan como números enteros, no como importes.
- Los tres KPIs que siguen pendientes (`tratos_ganados`, `tickets_st`, `ingresos_proyectos`) no cambian.
- El motivo de los pendientes de CRM deja de ser cierto para las filas que se calculan; `tratos_ganados` conserva el suyo porque necesita decidir qué `stage` cuenta como ganado, y eso es otra conversación.

## 6. Pruebas

### Vitest — `src/lib/__tests__/kpi-score.test.ts`
`normalizeCustomerKey`: minúsculas, tildes, puntuación, espacios, y que dos grafías de la misma empresa colapsan. `splitDealsNewExisting`: cuenta con compra anterior va a existentes; cuenta cuya primera compra es el año analizado va a nuevos; cuenta que no está en Books va a nuevos; suma varios tratos del mismo mes; ignora meses fuera de rango; devuelve doce posiciones en ambas series.

### E2E — `e2e/specs/kpis-comerciales.spec.ts`
Un test nuevo: las dos filas de generación de tratos muestran números y ya no el aviso de pendiente. La semilla del hub falso necesita el esquema `crm` con `deals` y unas filas ficticias.

## 7. Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest: los 183 actuales más los nuevos.
- E2E: los 42 actuales más 1.

## 8. Entrega
- Rama `feat/kpi-tratos`. Un solo PR: la consulta, los helpers, el catálogo y la tabla son una unidad pequeña, y partirla dejaría filas a medio calcular.
- Sin migración. Sin variables de entorno nuevas.

## 9. Fuera de alcance
- `tratos_ganados`: hay que acordar qué valores de `stage` cuentan como ganado.
- `tickets_st`: el esquema `desk` está disponible y `desk.tickets` tiene 69 columnas, pero "en plazo" necesita definirse contra los campos reales de Desk.
- `ingresos_proyectos`: sigue necesitando una carga manual.
- Replicar `crm.accounts` en el hub para cruzar por NIT en vez de por nombre. Hoy no hace falta, pero sería el camino si algún día el cruce por nombre se degrada.
- Tocar la definición de cliente nuevo del gráfico "Nuevos vs recurrentes".
