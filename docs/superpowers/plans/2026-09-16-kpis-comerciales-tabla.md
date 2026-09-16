# KPIs comerciales · PR 3: la tabla en Comercial — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la pestaña Comercial de `/analytics`, encima de "Mix por macro-categoría", una tabla que compara cada KPI con su meta mes a mes, por ámbito, con promedio, aporte y una fila TOTAL que dice sobre cuánto peso está calculada.

**Architecture:** Una consulta nueva al hub que añade el filtro por vendedor a la de ventas por cliente y mes, su acción de servidor, y un componente cliente que junta esa consulta con las metas ya guardadas y con los helpers puros del PR anterior. No hay lógica de cálculo nueva: toda vive ya en `src/lib/kpi-score.ts` y en `stGrowthByQuarter`.

**Tech Stack:** Next 16, React 19, @tanstack/react-query, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-kpis-comerciales-design.md` (secciones 4 y 5)

**Tercero y último PR.** El primero (#6, #7) trajo la tabla `kpi_targets` y la pantalla de Configuración; el segundo (#8), los helpers de cálculo.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpis-tabla`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio ni nombre real de comercial en código, tests, comentarios ni documentación. Las metas y los vendedores de la semilla E2E son inventados.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración.** La `0008` ya está aplicada en producción.
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; 2 logins por ejecución con límite de 5 por minuto, así que **hay que esperar 60 s entre ejecuciones**.
- **Usuario E2E:** el aprobado es `admin`.

## Contexto verificado del código actual

- `getHubCustomerMonthSales` está en `src/db/hub-customer-month-sales.ts`. Elige tabla con la constante `SOURCES` a partir de `tipo` (nunca por entrada del usuario), excluye `void`/`draft` y prorratea el descuento de cabecera. Su acción es `getCustomerMonthSales(filters)` en `src/actions/customer-month-actions.ts`, con `requireApproved()` y sin envolver en `runAction` porque es lectura.
- `CustomerMonthFilters` es `{ tipo, anio }` y `CustomerMonthRow` es `{ customer, mes, importe }`.
- Los KPIs disponibles y su unidad están en `src/lib/commercial-kpis.ts`: `COMMERCIAL_KPIS`, `KPI_UNIT_LABEL`, `kpiDef`.
- Los helpers de cálculo ya existen (PR #8): `splitNewExisting`, `periodTotals`, `attainment`, `kpiAverage`, `kpiContribution`, `scoreboard` en `src/lib/kpi-score.ts`, `stGrowthByQuarter` en `src/lib/tech-service.ts` y `firstYearByCustomer` en `src/lib/analytics-comercial.ts`.
- Las metas se leen con `getKpiTargets(year, salesperson)` de `src/actions/kpi-actions.ts`, que devuelve `{ kpi_key, target_value, weight_pct }[]`. Los vendedores, con `getSalespeople()`. Sus queryKeys en uso son **posicionales**: `["kpi-targets", year, scope]` y `["kpi-salespeople"]`.
- El KPI `incremento_st` **no sale del hub**: sale de `sales_records` (caché `["sales", {}]` vía `getSalesData({})`) cruzado con las categorías (caché `["categories"]` vía `getCategories`), las dos ya cargadas por `analytics/page.tsx`.
- La pestaña Comercial está en `src/app/(dashboard)/analytics/page.tsx:357`, con `PeriodBar` primero y `BucketMixCard` justo después. `recordType` y `yearA` vienen de `usePeriod()`.
- Todas las tarjetas de esa pestaña se cargan con `next/dynamic`, `ssr: false` y `loading: chartSkeleton`.
- `CHART_HELP` (`src/lib/chart-help.ts`) tiene una sección `// --- Análisis: Comercial ---`.
- En `src/lib/constants.ts` hay `formatUSD` y `formatCompactUSD`, pero **no hay `formatPct`**: cada sitio lo formatea a mano.
- Semilla E2E: 5 clientes ficticios, 2 vendedores ficticios que rotan cada dos meses, facturas solo en meses pares, y 2 metas del total de compañía para el año en curso (`ventas_nuevos` y `ventas_existentes`, pesos 60 y 40). **No hay metas por vendedor a propósito.**

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/db/hub-kpi.ts` | Modificar | `getHubCustomerMonthByOwner`. |
| `src/actions/kpi-actions.ts` | Modificar | `getKpiMonthlySales`. |
| `e2e/specs/kpis-comerciales.spec.ts` | Crear | Tres tests de la tabla. |
| `src/lib/constants.ts` | Modificar | `formatPct`. |
| `src/lib/chart-help.ts` | Modificar | Texto de ayuda de la tabla. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Crear | La tabla. |
| `src/app/(dashboard)/analytics/page.tsx` | Modificar | Hueco en la pestaña Comercial. |

---

### Task 1: Ventas por mes filtradas por comercial

Esta consulta no la cubre vitest, que corre en `node` sin base de datos. Se verifica ejecutándola contra la base de test real, que es lo que sustituye aquí al test unitario.

**Files:**
- Modify: `src/db/hub-kpi.ts`
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: La consulta**

Antes de escribir, leer `src/db/hub-customer-month-sales.ts` entero y copiar su forma: la constante `SOURCES`, el prorrateo del descuento y los filtros. Añadir al final de `src/db/hub-kpi.ts`:

```ts
// Misma agregación que getHubCustomerMonthSales, con el vendedor como filtro
// opcional. Zoho guarda el comercial en el JSON de la cabecera, no en columna
// propia, así que el filtro va sobre raw->>'salesperson_name'.
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerMonthByOwner(f: {
  tipo: RecordType;
  anio: number;
  owner: string | null;
}): Promise<CustomerMonthRow[]> {
  // La tabla se elige en servidor a partir del tipo, nunca por entrada del usuario.
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
      AND ($2::text IS NULL OR h.raw->>'salesperson_name' = $2)
    GROUP BY h.customer_name, extract(month from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    customer: String(r.customer),
    mes: Number(r.mes),
    importe: Number(r.importe),
  }));
}
```

Añadir los imports de tipo que falten (`RecordType`, `CustomerMonthRow` de `@/types/database`) junto a los existentes.

- [ ] **Step 2: La acción**

Al final de `src/actions/kpi-actions.ts`:

```ts
/** Ventas por cliente y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiMonthlySales(
  tipo: RecordType,
  anio: number,
  owner: KpiScope
): Promise<CustomerMonthRow[]> {
  await requireApproved();
  return getHubCustomerMonthByOwner({ tipo, anio, owner });
}
```

Con sus imports. `requireApproved` ya está importado en ese fichero.

- [ ] **Step 3: Verificar el SQL contra la base de test**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`

Run, con el año en curso en lugar de `AAAA`:
```bash
docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT extract(month from h.date)::int AS mes, h.raw->>'salesperson_name' AS vendedor, count(*) FROM books.invoices h WHERE extract(year from h.date) = AAAA GROUP BY 1,2 ORDER BY 1"
```
Expected: meses pares repartidos entre los dos vendedores ficticios. **Pegar esta salida en el informe: la Task 2 la necesita para escribir asertos deterministas.**

Ejecutar además el SQL de la consulta nueva dos veces, una con `NULL` y otra con uno de los vendedores, y comprobar que la segunda devuelve un subconjunto estricto de la primera. Pegar ambas salidas.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/db/hub-kpi.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): ventas por mes filtradas por comercial"
```

---

### Task 2: Los tests E2E, en rojo

**Files:**
- Create: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Escribir los tests**

Usar la distribución real de vendedores por mes obtenida en la Task 1 para elegir un mes que pertenezca a **un solo** vendedor. Los asertos concretos se ajustan a esa realidad; lo que NO se puede cambiar es qué comprueba cada test.

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

async function abrirComercial(page) {
  await page.goto("/analytics");
  await page.getByRole("tab", { name: "Comercial" }).click();
  const card = page.locator('[data-slot="card"]', { hasText: "KPIs comerciales" });
  await expect(card).toBeVisible();
  return card;
}

test("la tabla muestra el TOTAL con su cobertura y los KPIs pendientes con su motivo", async ({ page }) => {
  const card = await abrirComercial(page);

  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();
  // La semilla pesa dos KPIs medibles al 60 y al 40.
  await expect(card.getByText(/cobertura: 100/)).toBeVisible();

  // Los cinco KPIs sin origen de datos dicen por qué están vacíos.
  await expect(card.getByText("Pendiente de Zoho CRM").first()).toBeVisible();
  await expect(card.getByText("Pendiente de Zoho Desk").first()).toBeVisible();
});

test("el selector de propietario filtra los importes", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Ventas clientes existentes/ });
  const mes = fila.getByRole("cell").nth(MES_ELEGIDO); // índice según la Task 1
  const conTodos = await mes.innerText();

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // Ese mes es de la otra comercial, así que al filtrar se queda sin importe.
  await expect(mes).not.toHaveText(conTodos);
});

test("un ámbito sin metas configuradas lo dice en vez de fingir cumplimiento", async ({ page }) => {
  const card = await abrirComercial(page);

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // La semilla deja los ámbitos por vendedor sin metas a propósito.
  await expect(card.getByText(/Configura las metas/)).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `3 failed` + `2 passed` (los de setup). Fallan por no encontrar la tarjeta. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): la tabla de kpis comerciales en la pestana Comercial"
```

---

### Task 3: La tabla

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/chart-help.ts`
- Create: `src/components/charts/comercial/commercial-kpi-table.tsx`
- Modify: `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: `formatPct`**

En `src/lib/constants.ts`, junto a `formatUSD`:

```ts
/** Porcentaje con un decimal. Existía repetido a mano en media docena de sitios. */
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
```

No reescribir los usos existentes: eso es otro cambio y ensuciaría este PR.

- [ ] **Step 2: Texto de ayuda**

En `src/lib/chart-help.ts`, en la sección de Comercial, en orden alfabético:

```ts
  kpisComerciales: "Cumplimiento de cada KPI frente a su meta, por periodo. El promedio es la media de los periodos medidos y el aporte aplica el peso, topado al 100%. El TOTAL se calcula solo sobre los KPIs que hoy tienen datos y la cobertura dice cuánto peso respalda esa nota.",
```

- [ ] **Step 3: El componente**

Antes de escribirlo, leer `src/components/charts/comercial/new-vs-recurring-card.tsx` y `month-heatmap-card.tsx` enteros: el primero para la estructura de `Card` y el segundo porque es el precedente de una tabla HTML dentro de una tarjeta de esta pestaña.

Crear `src/components/charts/comercial/commercial-kpi-table.tsx`, componente cliente que:

- Recibe `{ recordType, year }`.
- Estado local `owner`, con el centinela `"__total__"` para "Total compañía", igual que hace la pantalla de Configuración.
- Consultas:
  - `["kpi-salespeople"]` → `getSalespeople()`, para el selector. Comparte caché con Configuración.
  - `["kpi-targets", year, owner]` → `getKpiTargets(year, salesperson)`.
  - `["kpi-monthly", recordType, year, owner]` → `getKpiMonthlySales(recordType, year, salesperson)`.
  - `["customer-sales", { tipo: "INVOICE", desdeAnio: 2015, hastaAnio: thisYear, includeHistory: true }]` → `getCustomerSales(...)`, **exactamente esa clave** para compartir caché con `/clientes` y con la ficha de cliente. De ahí sale `firstYearByCustomer`.
  - `["sales", {}]` → `getSalesData({})` y `["categories"]` → `getCategories()`, las mismas claves que ya usa `analytics/page.tsx`, para `incremento_st`.
- Calcula, en `useMemo`:
  - `splitNewExisting(mensuales, firstYearByCustomer(facturasHistoricas), year)` → las series de `ventas_nuevos` y `ventas_existentes`.
  - `stGrowthByQuarter(registrosDelAnio, registrosDelAnioAnterior, catMap, recordType)` → los cuatro valores de `incremento_st`. Es de compañía: **no** se filtra por vendedor, y la fila debe indicarlo.
  - Para cada KPI del catálogo con meta: `periodTotals` → `attainment` por cubo → `kpiAverage` → `kpiContribution`.
  - `scoreboard` con todos ellos para la fila TOTAL.
- Renderiza una tabla con una fila por KPI del catálogo, en su orden:
  - Etiqueta, periodicidad y unidad a la izquierda.
  - Doce columnas de mes con el valor, y bajo el último mes de cada periodo el cumplimiento de ese periodo.
  - Promedio y aporte a la derecha.
  - KPIs pendientes: celdas con guion y su `pendingReason` en gris.
  - KPIs sin meta en ese ámbito: valores sí, cumplimiento no.
  - Fila TOTAL con la puntuación y, al lado, `cobertura: X % del peso`.
- Si el ámbito no tiene ninguna meta, muestra el aviso "Configura las metas en Configuración", enlazando a `/settings` si el perfil es `admin`.
- Estilo: `Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm"`, cabecera con `CardTitle` + `InfoTooltip text={CHART_HELP.kpisComerciales}` y el selector de propietario con `aria-label="Propietario"`, `CardContent className="min-h-0 flex-1"` con la cascada `Skeleton` → "Sin datos." → tabla, y la tabla dentro de `<div className="overflow-auto">` con celdas numéricas `text-right tabular-nums`.

Importes con `formatUSD`, porcentajes con `formatPct`, conteos tal cual. La unidad de cada fila sale de `KPI_UNIT_LABEL`.

- [ ] **Step 4: El hueco en la pestaña**

En `src/app/(dashboard)/analytics/page.tsx`, declarar el componente con `next/dynamic` junto a los demás:

```tsx
const CommercialKpiTable = dynamic(
  () => import("@/components/charts/comercial/commercial-kpi-table").then((m) => m.CommercialKpiTable),
  { ssr: false, loading: chartSkeleton }
);
```

y colocarlo en la pestaña Comercial **entre `PeriodBar` y `BucketMixCard`**:

```tsx
                <CommercialKpiTable recordType={recordType} year={yearA} />
```

- [ ] **Step 5: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`. Si el componente añade warnings, arreglarlos en vez de subir el baseline.

- [ ] **Step 6: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la ejecución de la Task 2 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `5 passed`.

Si algún aserto falla por cómo quedó el DOM y no por el comportamiento, ajustar el **selector** del test, nunca lo que comprueba, y explicarlo en el informe.

- [ ] **Step 7: Commit**

```bash
git add src/lib/constants.ts src/lib/chart-help.ts "src/components/charts/comercial/commercial-kpi-table.tsx" "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(kpis): tabla de kpis comerciales en la pestana Comercial"
```

---

### Task 4: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: `170 passed | 1 skipped`, sin cambios: este PR no añade tests unitarios.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `41 passed` (los 38 actuales más 3).

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpis-tabla` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los apellidos reales de los comerciales y las metas
> reales de negocio son justo lo que no puede acabar en un repositorio público: meterlos dentro del
> propio comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un
> fichero fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no
> existe, la comprobación no está hecha: no se puede dar por buena.

---

### Task 5: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Este PR **sí cambia lo que se ve** y no trae migración, así que el usuario querrá desplegarlo. Recordarle que no despliegue hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpis-tabla
```

PR contra `main` titulado `feat(kpis): tabla de kpis comerciales en la pestana Comercial`, explicando que cierra la serie de tres, qué se calcula hoy y qué queda esperando a que el hub replique CRM y Desk, con las cifras reales de los gates. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Los 5 KPIs sin origen de datos: siguen como filas con su motivo hasta que el worker del hub replique Zoho CRM y Zoho Desk o se defina una carga manual.
- Desglose por vendedor del incremento de Servicio Técnico: esas líneas no llevan comercial asignado.
- Exportar la tabla, histórico de cumplimiento entre años y widget del dashboard.
- Reescribir los porcentajes que hoy se formatean a mano en otros componentes para que usen `formatPct`.
