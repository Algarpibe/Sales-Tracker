# Histórico 2015-2020 en la ficha de cliente — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `/clientes/[customer]`, "Cliente desde", "Ventas histórico" y "Evolución anual" incluyen el histórico 2015-2020, y "Cliente desde" deja de depender del conmutador OV/FAC.

**Architecture:** Sin cambios de servidor, SQL ni migraciones. Un helper puro nuevo (`customerSinceYear`) combina facturas y órdenes; `CustomerKpiRow` y `CustomerEvolutionCard` piden los datos desde 2015 con `includeHistory: true`, con la misma clave de react-query que usa `/clientes`.

**Tech Stack:** Next.js 16, React 19, @tanstack/react-query, vitest, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-11-ficha-cliente-historico-design.md`

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/` (la carpeta padre no es un repo git). Todos los comandos se lanzan desde ahí.
- **Rama:** `feat/ficha-cliente-historico` ya existe y tiene el commit del spec y el de este plan. No cambiar de rama.
- **Shell:** comandos en sintaxis de Git Bash. En PowerShell, la variable de entorno se fija con `$env:E2E_PG_PORT = "55433"; <comando>`.
- **Repo público:** ni nombres de clientes reales ni importes reales en código, tests, comentarios ni docs. Los nombres que se usan aquí ("Gamma Agro", "Alfa Industrial") son de la semilla ficticia de `e2e/db/seed-hub.mjs`, y los importes del histórico de prueba son sintéticos.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni ninguna atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset` (el sistema de permisos los bloquea). Si un commit sale mal, parar y reportar.
- **Lint:** baseline de exactamente 10 warnings y 0 errores. No puede subir.
- **E2E, trampas ya pagadas:**
  - Docker Desktop tiene que estar arrancado; si `docker info` no responde, parar y reportar.
  - El puerto 55432 lo ocupa otro proyecto local. Usar siempre `E2E_PG_PORT=55433`.
  - `playwright.config.ts` ejecuta `npm run build && npm run start` en el 3100 y **reutiliza** un servidor que ya esté escuchando ahí. Comprobar antes de cada ejecución que está libre.
  - Cada ejecución gasta 2 logins (proyecto `setup`) y el rate limit es de 5 por minuto: esperar 60 s entre ejecuciones seguidas. Nunca relajarlo.
  - `npm run test:e2e` resiembra la base de datos de test.
- **Patrón de datos compartidos en E2E:** `e2e/fixtures/users.json` lo lee la semilla con `JSON.parse(await readFile(...))` (`seed-app.mjs:8`) y los tests lo importan desde `e2e/constants.ts` (`import users from "./fixtures/users.json"`, con `resolveJsonModule` activo). El histórico de prueba sigue ese mismo patrón.
- **Datos de la semilla que se usan aquí:** "Alfa Industrial" tiene una Orden de Venta de noviembre de 2020 sin factura (mes impar) y su primera factura es de 2021; "Gamma Agro" no tiene filas de 2020.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/customer-detail.ts` | Modificar (añadir función) | `customerSinceYear`: primer año con ventas mirando facturas y órdenes. |
| `src/lib/__tests__/customer-detail.test.ts` | Modificar (añadir bloque) | Tests del helper nuevo. |
| `e2e/fixtures/historical.json` | Crear | Datos del histórico de prueba, compartidos por semilla y tests. |
| `e2e/db/seed-app.mjs` | Modificar | Sembrar esas filas en `historical_customer_sales`. |
| `e2e/constants.ts` | Modificar | Constantes que usan los tests E2E. |
| `e2e/specs/customer-detail.spec.ts` | Crear | Dos tests de la ficha de cliente. |
| `src/components/customers/customer-kpi-row.tsx` | Modificar | Dos consultas desde 2015 y "Cliente desde" con el helper. |
| `src/components/customers/customer-evolution-card.tsx` | Modificar (`:14`, `:29-30`) | Serie anual desde 2015 con histórico. |

---

### Task 1: Helper `customerSinceYear` (TDD con vitest)

**Files:**
- Modify: `src/lib/__tests__/customer-detail.test.ts`
- Modify: `src/lib/customer-detail.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/customer-detail.test.ts`, añadir `customerSinceYear` a la lista de imports de `@/lib/customer-detail` (línea 3, junto a `customerFirstYear`) y añadir este bloque justo después del `describe("customerTotalVentas", ...)` que termina en la línea 29:

```ts

describe("customerSinceYear", () => {
  const facturas: CustomerYearRow[] = [
    { customer: "A", year: 2017, ventas: 300 },
    { customer: "A", year: 2021, ventas: 100 },
  ];
  const ordenes: CustomerYearRow[] = [{ customer: "A", year: 2021, ventas: 80 }];

  it("gana el anio del historico", () => {
    expect(customerSinceYear(facturas, ordenes, "A")).toBe(2017);
  });
  it("una orden anterior a la primera factura gana", () => {
    expect(
      customerSinceYear(
        [{ customer: "A", year: 2022, ventas: 100 }],
        [{ customer: "A", year: 2021, ventas: 80 }],
        "A",
      ),
    ).toBe(2021);
  });
  it("solo ordenes", () => {
    expect(customerSinceYear([], [{ customer: "A", year: 2020, ventas: 40 }], "A")).toBe(2020);
  });
  it("un anio a cero no cuenta como inicio", () => {
    expect(
      customerSinceYear(
        [{ customer: "A", year: 2019, ventas: 0 }, { customer: "A", year: 2021, ventas: 100 }],
        [],
        "A",
      ),
    ).toBe(2021);
  });
  it("null si el cliente no tiene ventas", () => {
    expect(customerSinceYear(facturas, ordenes, "Z")).toBeNull();
    expect(customerSinceYear([{ customer: "A", year: 2021, ventas: 0 }], [], "A")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npm test -- src/lib/__tests__/customer-detail.test.ts`
Expected: los tests nuevos fallan porque `customerSinceYear` no existe (error de importación o "is not a function"). El resto de tests del fichero sigue pasando.

- [ ] **Step 3: Implementar el helper**

En `src/lib/customer-detail.ts`, justo después de `customerFirstYear` (termina en la línea 17), añadir:

```ts

/**
 * Primer año con ventas del cliente mirando a la vez facturas y órdenes de
 * venta, para que "Cliente desde" no dependa del conmutador OV/FAC.
 *
 * Requiere que `invoiceRows` venga de getCustomerSales con includeHistory y
 * desdeAnio <= 2020; si no, nunca puede devolver un año previo al hub. Un
 * cliente con factura de 2020 en Zoho, sin fila en el histórico y sin orden de
 * venta de ese año, sigue saliendo como 2021: mergeWithHistory descarta las
 * filas del hub de ese año.
 */
export function customerSinceYear(
  invoiceRows: CustomerYearRow[],
  orderRows: CustomerYearRow[],
  customer: string
): number | null {
  return customerFirstYear([...invoiceRows, ...orderRows], customer);
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test -- src/lib/__tests__/customer-detail.test.ts`
Expected: todos los tests del fichero pasan.

- [ ] **Step 5: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin salida y código de salida 0.

Run: `npm run lint`
Expected: `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customer-detail.ts src/lib/__tests__/customer-detail.test.ts
git commit -m "feat(clientes): helper customerSinceYear combina facturas y ordenes"
```

---

### Task 2: La ficha usa el histórico (TDD con Playwright)

**Files:**
- Create: `e2e/fixtures/historical.json`
- Modify: `e2e/db/seed-app.mjs`
- Modify: `e2e/constants.ts`
- Create: `e2e/specs/customer-detail.spec.ts`
- Modify: `src/components/customers/customer-kpi-row.tsx`
- Modify: `src/components/customers/customer-evolution-card.tsx`

- [ ] **Step 1: Datos de prueba del histórico**

Crear `e2e/fixtures/historical.json`:

```json
{
  "customer": "Gamma Agro",
  "rows": [
    { "year": 2017, "amount": 1000 },
    { "year": 2019, "amount": 2500 }
  ]
}
```

En `e2e/db/seed-app.mjs`, debajo de la línea 8 (`const USERS = JSON.parse(...)`), añadir:

```js
// Historico ficticio previo al hub (tabla de la migracion 0007). Solo lo leen
// /clientes y la ficha de cliente. Importes sinteticos.
const HISTORICAL = JSON.parse(await readFile(path.resolve(HERE, "../fixtures/historical.json"), "utf8"));
```

En la función `seedApp`, justo después del bucle de `GROUPS` (termina en la línea 87) y antes de `await seedUser(...)`, añadir:

```js
    for (const row of HISTORICAL.rows) {
      await client.query(
        `INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd)
         VALUES ($1, $2, $3, $4)`,
        [company.id, HISTORICAL.customer, row.year, row.amount],
      );
    }
```

Y sustituir el `console.log` final de `seedApp` por:

```js
    console.log(`  app sembrada: 1 empresa, ${CATEGORIES.length} categorias, ${GROUPS.length} grupos, 2 usuarios, ${HISTORICAL.rows.length} filas de historico`);
```

- [ ] **Step 2: Constantes para los tests**

En `e2e/constants.ts`, añadir debajo del import de `users` (línea 1):

```ts
import historical from "./fixtures/historical.json";
```

y al final del fichero:

```ts

/**
 * Cliente con histórico ficticio previo al hub (tabla historical_customer_sales).
 * Solo lo ven /clientes y la ficha de cliente.
 */
export const HISTORICAL_CUSTOMER = historical.customer;
export const HISTORICAL_FIRST_YEAR = Math.min(...historical.rows.map((r) => r.year));

/**
 * Cliente cuyo documento más antiguo en el hub es una Orden de Venta de 2020,
 * sin factura ese año (mes impar en e2e/db/seed-hub.mjs). Sirve para comprobar
 * que "Cliente desde" no depende del conmutador OV/FAC.
 */
export const ORDER_FIRST_CUSTOMER = "Alfa Industrial";
export const ORDER_FIRST_YEAR = 2020;
```

- [ ] **Step 3: Escribir los tests que fallan**

Crear `e2e/specs/customer-detail.spec.ts`:

```ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  APPROVED_STATE,
  HISTORICAL_CUSTOMER,
  HISTORICAL_FIRST_YEAR,
  ORDER_FIRST_CUSTOMER,
  ORDER_FIRST_YEAR,
} from "../constants";

test.use({ storageState: APPROVED_STATE });

// Tile de KPI de la ficha: un div con la etiqueta y otro con el valor.
function tileValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("..").locator("div").nth(1);
}

test("la ficha incluye el histórico en Cliente desde y en la evolución anual", async ({ page }) => {
  await page.goto(`/clientes/${encodeURIComponent(HISTORICAL_CUSTOMER)}`);
  await expect(page.getByRole("heading", { level: 1, name: HISTORICAL_CUSTOMER })).toBeVisible();

  // Un contexto nuevo arranca en Facturas, que es donde vive el histórico.
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(HISTORICAL_FIRST_YEAR));

  const evolucion = page.locator('[data-slot="card"]', { hasText: "Evolución anual" });
  await expect(
    evolucion.locator(".recharts-cartesian-axis-tick").filter({ hasText: String(HISTORICAL_FIRST_YEAR) })
  ).toHaveCount(1);
});

test("Cliente desde no depende del conmutador OV/FAC", async ({ page }) => {
  await page.goto(`/clientes/${encodeURIComponent(ORDER_FIRST_CUSTOMER)}`);
  await expect(page.getByRole("heading", { level: 1, name: ORDER_FIRST_CUSTOMER })).toBeVisible();

  // Su documento más antiguo es una Orden de Venta de 2020 sin factura: con
  // Facturas seleccionadas el valor tiene que salir igualmente de las órdenes.
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(ORDER_FIRST_YEAR));

  const ovTab = page.getByRole("tab", { name: /\bOV\b/ }).first();
  await ovTab.click();
  await expect(ovTab).toHaveAttribute("aria-selected", "true");
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(ORDER_FIRST_YEAR));
});
```

- [ ] **Step 4: Ejecutar los tests y verificar que fallan**

Comprobar que el puerto 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/customer-detail.spec.ts`
Expected (tarda unos minutos por el build):
- Los 2 tests de `setup` pasan.
- "la ficha incluye el histórico…" **falla** en el tile: `Expected string: "2017"`, `Received string: "2021"`.
- "Cliente desde no depende del conmutador…" **falla** en el primer tile: `Expected string: "2020"`, `Received string: "2021"`.
- Resumen: `2 failed`, `2 passed`.
- Si alguno falla por no encontrar la ficha, el tile o la tarjeta, PARAR: el test está mal, no la aplicación.

- [ ] **Step 5: Fila de KPIs con histórico**

Sustituir el contenido completo de `src/components/customers/customer-kpi-row.tsx` por:

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerYearSeries, customerSinceYear, customerTotalVentas, customerMarginKpi } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Primer año del histórico previo al hub (tabla historical_customer_sales). La
// ficha lo incluye, igual que /clientes: pidiendo desde 2021, "Cliente desde"
// nunca podría mostrar un año anterior.
const HISTORY_FIRST_YEAR = 2015;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

export function CustomerKpiRow({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const thisYear = new Date().getFullYear();
  // Se cargan los dos tipos siempre: "Cliente desde" mira facturas y órdenes a
  // la vez, así que no cambia al pulsar el conmutador. Misma forma de clave que
  // /clientes, para compartir la caché de react-query.
  const invoicesQ = useQuery({
    queryKey: ["customer-sales", { tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
  });
  const ordersQ = useQuery({
    queryKey: ["customer-sales", { tipo: "SALES_ORDER", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: "SALES_ORDER", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
  });
  const marginQ = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });

  const kpis = useMemo(() => {
    const invoices = invoicesQ.data ?? [];
    const orders = ordersQ.data ?? [];
    // El tipo elegido gobierna los importes; "Cliente desde" no.
    const current = recordType === "INVOICE" ? invoices : orders;
    const series = customerYearSeries(current, customer);
    return {
      ventasAnio: series.find((s) => s.year === year)?.ventas ?? 0,
      total: customerTotalVentas(current, customer),
      since: customerSinceYear(invoices, orders, customer),
      margenPct: customerMarginKpi(marginQ.data ?? [], customer).margenPct,
    };
  }, [invoicesQ.data, ordersQ.data, marginQ.data, customer, recordType, year]);

  if (invoicesQ.isLoading || ordersQ.isLoading || marginQ.isLoading) return <Skeleton className="h-[92px] w-full" />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label={`Ventas ${year}`} value={formatUSD(kpis.ventasAnio)} />
      <Tile label={`Margen % ${year} (bienes)`} value={`${kpis.margenPct.toFixed(1)}%`} />
      <Tile label="Ventas histórico" value={formatUSD(kpis.total)} />
      <Tile label="Cliente desde" value={kpis.since ? String(kpis.since) : "—"} />
    </div>
  );
}
```

- [ ] **Step 6: Evolución anual con histórico**

En `src/components/customers/customer-evolution-card.tsx`, sustituir la línea 14:

```tsx
const FIRST_YEAR = 2021;
```

por:

```tsx
// Primer año del histórico previo al hub: la gráfica lo incluye, igual que la
// fila de KPIs y /clientes. Con Órdenes de Venta no hay histórico y el hub
// aporta 2020 parcial.
const HISTORY_FIRST_YEAR = 2015;
```

y las líneas 29-30:

```tsx
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
```

por:

```tsx
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
```

- [ ] **Step 7: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin salida y código de salida 0.

Run: `npm run lint`
Expected: `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 8: Ejecutar los tests y verificar que pasan**

Esperar al menos 60 s desde la ejecución del Step 4 y comprobar que el 3100 sigue libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/customer-detail.spec.ts`
Expected: `4 passed` (2 de `setup` y 2 de `customer-detail.spec.ts`).

- [ ] **Step 9: Commit**

```bash
git add e2e/fixtures/historical.json e2e/db/seed-app.mjs e2e/constants.ts e2e/specs/customer-detail.spec.ts src/components/customers/customer-kpi-row.tsx src/components/customers/customer-evolution-card.tsx
git commit -m "feat(clientes): la ficha incluye el historico 2015-2020"
```

---

### Task 3: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Tests unitarios**

Run: `npm test`
Expected: `Tests  129 passed | 1 skipped (130)`: los 124 de antes más los 5 del helper.

- [ ] **Step 2: Suite E2E completa**

Esperar al menos 60 s desde la última ejecución E2E y comprobar que el 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `34 passed` (los 32 actuales y los 2 nuevos).

- [ ] **Step 3: Estado de la rama y datos sensibles**

Run: `git status -sb`
Expected: `## feat/ficha-cliente-historico` sin ficheros modificados.

Run: `git log --oneline origin/main..HEAD`
Expected: los commits del spec, el plan, el helper y la implementación, más los de documentación que hayan salido de las revisiones.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|[0-9]{1,3}(\.[0-9]{3}){2,}|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida. Ni importes con separadores de miles, ni IPs, ni rutas de claves.

Ademas, revisar a ojo el diff: nombres de otros proyectos, hostnames o rutas de la maquina no se pueden buscar con un patron sin escribirlos aqui.

---

### Task 4: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Push, PR y merge son visibles en un repositorio público. Pedir confirmación explícita al usuario y no seguir sin ella.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/ficha-cliente-historico`
Expected: `branch 'feat/ficha-cliente-historico' set up to track 'origin/feat/ficha-cliente-historico'`.

- [ ] **Step 3: Abrir el PR**

Si alguna cifra real de la Task 3 difiere de las de la sección Gates, poner la real.

```bash
gh pr create --base main --head feat/ficha-cliente-historico \
  --title "feat(clientes): la ficha de cliente incluye el historico 2015-2020" \
  --body "$(cat <<'EOF'
## Qué

En la ficha de cliente, **"Cliente desde", "Ventas histórico" y "Evolución anual"** incluyen el histórico 2015-2020, igual que la vista `/clientes`.

Antes la ficha pedía los datos desde 2021, así que "Cliente desde" no podía mostrar un año anterior aunque el cliente comprara desde 2015.

## Detalles

- `customerSinceYear`, un helper puro nuevo, calcula el primer año mirando facturas **y** órdenes de venta: "Cliente desde" ya no cambia al pulsar el conmutador OV/FAC.
- La fila de KPIs y la gráfica piden `getCustomerSales` desde 2015 con `includeHistory: true`, con la misma clave de react-query que `/clientes`, así que comparten caché.
- "Ventas {año}" y "Ventas histórico" siguen al conmutador. Con Órdenes de Venta no hay histórico y 2020 aparece parcial, como en `/clientes`.
- El selector de año de la ficha sigue empezando en 2021: el resto de tarjetas necesita datos por línea y el histórico solo tiene totales anuales.
- Sin cambios de servidor, migraciones ni SQL.

Revierte en parte el alcance de `docs/superpowers/specs/2026-09-10-historico-ventas-cliente-design.md`, que dejaba la ficha en "solo 2021+".

## Tests

- Vitest: 5 tests del helper.
- E2E (`e2e/specs/customer-detail.spec.ts`): la ficha de un cliente con histórico ficticio muestra su primer año real y lo pinta en la gráfica, y "Cliente desde" no cambia al alternar OV/FAC. Escritos antes del cambio: fallaban mostrando 2021.
- La semilla E2E gana filas históricas ficticias (`e2e/fixtures/historical.json`).

## Gates

- `npm run typecheck`: limpio
- `npm run lint`: 10 warnings, 0 errores (baseline intacto)
- `npm test`: 129 pasando + 1 saltado
- `npm run test:e2e`: 34/34

Spec: `docs/superpowers/specs/2026-09-11-ficha-cliente-historico-design.md`
Plan: `docs/superpowers/plans/2026-09-11-ficha-cliente-historico.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: la URL del PR nuevo.

- [ ] **Step 4: Esperar al CI**

Run: `gh pr checks feat/ficha-cliente-historico --watch`
Expected: `build`, `e2e` y `GitGuardian Security Checks` en verde.

- [ ] **Step 5: Fusionar como los PR anteriores**

```bash
N=$(gh pr view feat/ficha-cliente-historico --json number -q .number)
gh pr merge "$N" --merge --subject "feat(clientes): la ficha de cliente incluye el historico 2015-2020 (#$N)" --body "feat(clientes): la ficha de cliente incluye el historico 2015-2020"
```

Expected: el PR queda `MERGED`.

- [ ] **Step 6: Sincronizar `main` local**

Run: `git checkout main && git fetch origin && git merge --ff-only origin/main`
Expected: avance rápido; `git status -sb` muestra `## main...origin/main` sin `ahead` ni `behind`.

El despliegue lo hace el usuario en EasyPanel **después** de la fusión, y no necesita SQL. Tras desplegar, recargar con Ctrl+Shift+R.
