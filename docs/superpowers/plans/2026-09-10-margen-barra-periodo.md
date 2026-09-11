# Barra de periodo en la pestaña Margen — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña Margen de `/analytics` muestra la misma barra que Comercial (conmutador OV/FAC y selector de año), mediante un componente compartido `PeriodBar`.

**Architecture:** Componente presentacional `PeriodBar` en `src/components/common/`, extraído del bloque de controles de Comercial. `analytics/page.tsx` actúa de contenedor y lo conecta a `usePeriod()` en Comercial y en Margen. Sin cambios de datos ni de servidor: las tarjetas de margen ya reciben `recordType` y `year`.

**Tech Stack:** Next.js 16 (App Router), React 19, base-ui (Tabs, Select), Tailwind 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-10-margen-barra-periodo-design.md`

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/` (la carpeta padre no es un repo git). Todos los comandos se lanzan desde ahí.
- **Shell:** los comandos están en sintaxis de Git Bash. En PowerShell, la variable de entorno se fija con `$env:E2E_PG_PORT = "55433"; <comando>`.
- **Repo público:** ni nombres de clientes ni importes reales en código ni en tests. Este plan solo usa la semilla ficticia de `e2e/db/`.
- **Commits:** convencionales, en español sin tildes (como el historial), **sin** `Co-Authored-By` ni ninguna atribución a IA.
- **Lint:** baseline de exactamente 10 warnings y 0 errores. No puede subir.
- **E2E, trampas ya pagadas:**
  - El puerto 55432 lo ocupa otro proyecto local. Usar siempre `E2E_PG_PORT=55433`. No parar ese contenedor.
  - `playwright.config.ts` ejecuta `npm run build && npm run start` en el puerto 3100, pero **reutiliza un servidor que ya esté escuchando en ese puerto** (`reuseExistingServer` fuera de CI). Antes de cada ejecución hay que comprobar que el 3100 está libre; si no, los tests corren contra un build viejo.
  - Cada ejecución gasta 2 logins en `e2e/auth.setup.ts` (proyecto `setup`), y el rate limit es de 5 logins por minuto. Esperar al menos 60 s entre ejecuciones seguidas. Nunca relajar el rate limit.
  - `npm run test:e2e` levanta la BD (`e2e:db:up`) y la resiembra (`e2e:db:reset`): borra cualquier dato cargado a mano en la BD de test.
- **base-ui, no Radix:** los `TabsContent` inactivos no se renderizan (`keepMounted` es `false` por defecto) y el panel activo lleva `role="tabpanel"` con `aria-labelledby` apuntando a su pestaña (`node_modules/@base-ui/react/tabs/panel/TabsPanel.js:37`, `:78-81`). Por eso `page.getByRole("tabpanel", { name: "Margen" })` acota al panel de Margen.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/specs/margin.spec.ts` | Crear | Dos tests: la barra se ve en Comercial y en Margen; en Margen, el tipo y el año cambian los datos. |
| `src/components/common/period-bar.tsx` | Crear | Barra presentacional: `RecordTypeToggle` y `Select` de año. Sin estado ni contexto. |
| `src/app/(dashboard)/analytics/page.tsx` | Modificar (`:19`, `:358-375`, `:392-394`) | Conectar `PeriodBar` a `usePeriod()` en Comercial y en Margen. |

---

### Task 1: Preparar la rama

**Files:** ninguno.

- [ ] **Step 1: Comprobar que `main` está limpio**

Run: `git status -sb`
Expected: primera línea `## main...origin/main` (puede añadir `[ahead N]` por los commits de docs del spec y de este plan) y ningún fichero modificado ni sin seguimiento.

- [ ] **Step 2: Crear la rama**

Run: `git checkout -b feat/margen-barra-periodo`
Expected: `Switched to a new branch 'feat/margen-barra-periodo'`

---

### Task 2: Barra de periodo en Comercial y Margen (TDD)

**Files:**
- Create: `e2e/specs/margin.spec.ts`
- Create: `src/components/common/period-bar.tsx`
- Modify: `src/app/(dashboard)/analytics/page.tsx:19` (import), `:358-375` (Comercial), `:392-394` (Margen)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `e2e/specs/margin.spec.ts`:

```ts
import { test, expect, type Locator } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

// formatUSD usa en-US ("$1,234.56"): se quitan el símbolo y los separadores de miles.
function parseUsd(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ""));
}

// Valor de un tile de KPI de "Margen bruto estimado": el tile es un div con dos
// hijos, la etiqueta y el valor.
function tileValue(panel: Locator, label: string): Locator {
  return panel.getByText(label, { exact: true }).locator("..").locator("div").nth(1);
}

test("Comercial y Margen muestran la barra de periodo", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Comercial ya tiene la barra: esta vuelta protege la extracción a PeriodBar.
  // Margen no la tiene: es la vuelta que falla antes de implementar.
  for (const name of ["Comercial", "Margen"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    // base-ui solo renderiza el panel activo, con aria-labelledby hacia su pestaña.
    const panel = page.getByRole("tabpanel", { name, exact: true });
    // .first(): la barra es lo primero del panel; alguna tarjeta puede traer su
    // propio conmutador o selector más abajo.
    await expect(panel.getByRole("tab", { name: /\bOV\b/ }).first()).toBeVisible();
    await expect(panel.getByRole("tab", { name: /\bFAC\b/ }).first()).toBeVisible();
    await expect(panel.getByRole("combobox").first()).toBeVisible();
  }
});

test("en Margen, el tipo y el año cambian los datos", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Margen", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Margen", exact: true });

  const facTab = panel.getByRole("tab", { name: /\bFAC\b/ }).first();
  const ovTab = panel.getByRole("tab", { name: /\bOV\b/ }).first();
  const ventas = tileValue(panel, "Ventas (bienes)");

  // Tipo. "Margen bruto estimado" agrega todos los años, así que solo depende del
  // tipo. En la semilla del hub (e2e/db/seed-hub.mjs) las órdenes cubren los 12
  // meses y las facturas solo los pares, con las mismas líneas: con OV las
  // ventas son estrictamente mayores que con FAC.
  await expect(facTab).toBeVisible();
  await facTab.click();
  // aria-selected sale del mismo render que la prop de la tarjeta: a partir de
  // aquí el tile ya corresponde a FAC.
  await expect(facTab).toHaveAttribute("aria-selected", "true");
  await expect(ventas).toBeVisible();
  const fac = parseUsd(await ventas.innerText());
  expect(fac).toBeGreaterThan(0);

  await ovTab.click();
  await expect(ovTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => parseUsd(await ventas.innerText())).toBeGreaterThan(fac);

  // Año: el título de "Margen por artículo" muestra el año elegido.
  await panel.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Año 2024" }).click();
  await expect(panel.getByText("Margen por artículo 2024")).toBeVisible();

  expect(crashes, `Excepciones en la pestaña Margen:\n${crashes.join("\n")}`).toEqual([]);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Comprobar que el puerto 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida. Si hay salida, parar ese servidor antes de seguir.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/margin.spec.ts`
Expected (tarda unos minutos por el `npm run build` del webServer):
- Los 2 tests de `setup` pasan.
- `Comercial y Margen muestran la barra de periodo` **falla** en la vuelta de Margen. El error cita `getByRole('tabpanel', { name: 'Margen', exact: true }).getByRole('tab', { name: /\bOV\b/ }).first()` con `element(s) not found`. Si el error cita Comercial, PARAR: el test está mal, no la página.
- `en Margen, el tipo y el año cambian los datos` **falla** en `expect(facTab).toBeVisible()` con `element(s) not found`.
- Resumen: `2 failed`, `2 passed`.

- [ ] **Step 3: Crear el componente**

Crear `src/components/common/period-bar.tsx`:

```tsx
"use client";

import { RecordTypeToggle, type RecordTypeValue } from "@/components/common/record-type-toggle";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getYearRange } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Barra de periodo: conmutador de tipo de registro (OV/FAC) y selector de año.
 * Es un componente controlado: el padre es dueño del tipo y del año y recibe
 * los cambios por `onRecordTypeChange` y `onYearChange`.
 */
export function PeriodBar({
  recordType,
  onRecordTypeChange,
  year,
  onYearChange,
  className,
}: {
  recordType: RecordTypeValue;
  onRecordTypeChange: (v: RecordTypeValue) => void;
  year: number;
  onYearChange: (y: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3", className)}>
      <RecordTypeToggle value={recordType} onValueChange={onRecordTypeChange} />

      <div className="flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
        <Select value={String(year)} onValueChange={(v) => { if (v) onYearChange(Number(v)); }}>
          <SelectTrigger className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>Año {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Usar `PeriodBar` en la página**

En `src/app/(dashboard)/analytics/page.tsx`:

**4a. Import.** Justo debajo de la línea 19:

```tsx
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
```

añadir:

```tsx
import { PeriodBar } from "@/components/common/period-bar";
```

`RecordTypeToggle`, `Select*` y `getYearRange` se quedan: Exploración y Forecast los siguen usando.

**4b. Comercial.** Sustituir este bloque (líneas 358-375):

```tsx
              {/* Controles: tipo de registro y año (contexto de periodo compartido). */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                <RecordTypeToggle
                  value={recordType}
                  onValueChange={(v) => setRecordType(v)}
                />

                <div className="flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
                  <Select value={String(yearA)} onValueChange={(v) => { if (v) setYearA(Number(v)); }}>
                    <SelectTrigger className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>Año {y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
```

por:

```tsx
              <PeriodBar
                recordType={recordType}
                onRecordTypeChange={setRecordType}
                year={yearA}
                onYearChange={setYearA}
              />
```

**4c. Margen.** Sustituir (líneas 392-394):

```tsx
          <TabsContent value="margen" className="outline-none">
            <div className="space-y-6">
              <MarginKpiCard recordType={recordType} />
```

por:

```tsx
          <TabsContent value="margen" className="outline-none">
            <div className="space-y-6">
              <PeriodBar
                recordType={recordType}
                onRecordTypeChange={setRecordType}
                year={yearA}
                onYearChange={setYearA}
              />
              <MarginKpiCard recordType={recordType} />
```

- [ ] **Step 5: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin salida y código de salida 0.

Run: `npm run lint`
Expected: resumen final `✖ 10 problems (0 errors, 10 warnings)`. Si hay 11 o más warnings, o algún error, corregirlo antes de seguir.

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Esperar al menos 60 s desde la ejecución del Step 2 (rate limit de login) y comprobar que el 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/margin.spec.ts`
Expected: `4 passed` (2 de `setup` y 2 de `margin.spec.ts`).

- [ ] **Step 7: Commit**

```bash
git add e2e/specs/margin.spec.ts src/components/common/period-bar.tsx "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(analytics): barra de periodo OV/FAC y ano en la pestana Margen" -m "Extrae la barra de Comercial a PeriodBar y la reutiliza en Margen."
```

Expected: husky ejecuta lint-staged (`eslint --fix` sobre los `.ts`/`.tsx`) sin errores y se crea el commit.

---

### Task 3: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Tests unitarios**

Run: `npm test`
Expected: `Tests  124 passed | 1 skipped (125)`. Este cambio no toca código con tests unitarios; cualquier otra cifra es una regresión que hay que investigar.

- [ ] **Step 2: Suite E2E completa**

Esperar al menos 60 s desde la última ejecución E2E y comprobar que el 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `31 passed` (los 29 actuales, incluidos los 2 de `setup`, más los 2 nuevos). Esta ejecución también compila el proyecto con `npm run build`.

- [ ] **Step 3: Estado de la rama**

Run: `git status -sb`
Expected: `## feat/margen-barra-periodo` sin ficheros modificados.

Run: `git log --oneline -1`
Expected: `feat(analytics): barra de periodo OV/FAC y ano en la pestana Margen`.

---

### Task 4: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Push y PR son visibles en un repositorio público. Pedir confirmación explícita al usuario y no seguir sin ella. La rama parte del `main` local, así que el PR incluye también los commits de docs del spec y de este plan.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/margen-barra-periodo`
Expected: `branch 'feat/margen-barra-periodo' set up to track 'origin/feat/margen-barra-periodo'`.

- [ ] **Step 3: Abrir el PR**

Si alguna cifra real de la Task 3 difiere de las de la sección Gates, poner la real.

```bash
gh pr create --base main --head feat/margen-barra-periodo \
  --title "feat(analytics): barra de periodo OV/FAC y ano en la pestana Margen" \
  --body "$(cat <<'EOF'
## Qué

La pestaña **Margen** de Análisis Inteligente gana la misma barra que **Comercial**: conmutador Órdenes (OV) / Facturas (FAC) y selector de año.

La barra se extrae a un componente presentacional, `PeriodBar` (`src/components/common/period-bar.tsx`), que usan las dos pestañas. Comercial no cambia visualmente.

## Por qué

Las cuatro tarjetas de margen ya recibían el tipo y el año, y las consultas al hub ya distinguen órdenes de facturas, pero la pestaña no tenía controles: para cambiar el tipo o el año había que ir a otra pestaña. El spec original de margen no lo excluía a propósito.

## Comportamiento

- Tipo y año son el periodo compartido (`usePeriod()`): cambiarlos en Margen los cambia también en Exploración, Forecast y Comercial, como ya ocurría entre ellas.
- "Margen bruto estimado" agrega todos los años: responde al tipo, no al año.
- Sin cambios de datos, servidor, migraciones ni SQL.

## Tests

`e2e/specs/margin.spec.ts`:
- Comercial y Margen muestran la barra de periodo. En Comercial protege la extracción del componente.
- En Margen, pasar de FAC a OV sube "Ventas (bienes)" y elegir 2024 cambia el título de "Margen por artículo".

## Gates

- `npm run typecheck`: limpio
- `npm run lint`: 10 warnings, 0 errores (baseline intacto)
- `npm test`: 124 pasando + 1 saltado
- `npm run test:e2e`: 31/31

Spec: `docs/superpowers/specs/2026-09-10-margen-barra-periodo-design.md`
Plan: `docs/superpowers/plans/2026-09-10-margen-barra-periodo.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: la URL del PR nuevo.

- [ ] **Step 4: Esperar al CI**

Run: `gh pr checks --watch`
Expected: `build` y `e2e` en verde.

El merge lo decide el usuario. El despliegue lo hace el operador y no necesita migración ni SQL.
