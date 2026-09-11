# Mix por macro-categoría en barras apiladas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El gráfico "Mix por macro-categoría (evolución anual)" se pinta con barras apiladas en lugar de áreas apiladas, con los mismos colores y el mismo tono.

**Architecture:** Cambio de presentación en `BucketMixCard` (`src/components/charts/comercial/bucket-mix-card.tsx`): `AreaChart`/`Area` pasan a `BarChart`/`Bar` con `stackId`, `fillOpacity={0.5}` y `maxBarSize={64}`. Se actualiza el texto de ayuda y se añade un test E2E. Datos, título, contenido del tooltip y ejes no cambian.

**Tech Stack:** Next.js 16, React 19, recharts 2.15, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-11-mix-anual-barras-design.md`

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/` (la carpeta padre no es un repo git). Todos los comandos se lanzan desde ahí.
- **Rama:** `feat/mix-anual-barras` ya existe y tiene el commit del spec y el de este plan. No cambiar de rama.
- **Shell:** comandos en sintaxis de Git Bash. En PowerShell, la variable de entorno se fija con `$env:E2E_PG_PORT = "55433"; <comando>`.
- **Repo público:** ni nombres de clientes ni importes reales en código, tests, comentarios ni docs. Cualquier valor de ejemplo debe ser sintético o salir de la semilla ficticia de `e2e/db/`.
- **Commits:** convencionales, en español sin tildes (como el historial), **sin** `Co-Authored-By` ni ninguna atribución a IA.
- **Lint:** baseline de exactamente 10 warnings y 0 errores. No puede subir.
- **E2E, trampas ya pagadas:**
  - El puerto 55432 lo ocupa otro proyecto local. Usar siempre `E2E_PG_PORT=55433`. No parar ese contenedor.
  - `playwright.config.ts` ejecuta `npm run build && npm run start` en el puerto 3100, pero **reutiliza un servidor que ya esté escuchando en ese puerto** (`reuseExistingServer` fuera de CI). Antes de cada ejecución hay que comprobar que el 3100 está libre; si no, los tests corren contra un build viejo.
  - Cada ejecución gasta 2 logins en `e2e/auth.setup.ts` (proyecto `setup`), y el rate limit es de 5 logins por minuto. Esperar al menos 60 s entre ejecuciones seguidas. Nunca relajar el rate limit.
  - `npm run test:e2e` levanta la BD (`e2e:db:up`) y la resiembra (`e2e:db:reset`).
- **recharts:** las áreas se pintan dentro de un `<g class="recharts-area">` (`node_modules/recharts/lib/cartesian/Area.js:343`) y cada barra es un `.recharts-bar-rectangle` (`node_modules/recharts/lib/cartesian/Bar.js:103`).
- **Datos de la semilla:** `bucketForCategory` (`src/lib/customer-item.ts:19`) manda las categorías ficticias "Aguas", "Aire" y "Suelos" a "Equipos", y hay facturas de 2021 a 2024. En E2E el gráfico muestra una barra de un solo tramo por año.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/specs/charts.spec.ts` | Modificar (añadir un test al final) | Comprobar que el Mix por macro-categoría de Comercial pinta barras y ninguna área. |
| `src/components/charts/comercial/bucket-mix-card.tsx` | Modificar (`:13-15`, `:64-73`) | Pasar de áreas a barras apiladas conservando colores y tono. |
| `src/lib/chart-help.ts` | Modificar (`:19`) | Texto de ayuda: "(barras apiladas)". |

---

### Task 1: Barras apiladas en el Mix por macro-categoría (TDD)

**Files:**
- Modify: `e2e/specs/charts.spec.ts` (añadir al final)
- Modify: `src/components/charts/comercial/bucket-mix-card.tsx:13-15`, `:64-73`
- Modify: `src/lib/chart-help.ts:19`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `e2e/specs/charts.spec.ts` (el fichero ya declara `test.use({ storageState: APPROVED_STATE })` e importa `test` y `expect`):

```ts

test("el Mix por macro-categoría se pinta con barras apiladas", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Comercial", exact: true }).click();

  // Tarjeta acotada por su título con `data-slot="card"`, como en el test del
  // Histórico Anual, para no contar barras de otros gráficos de la pestaña.
  const mixCard = page.locator('[data-slot="card"]', { hasText: "Mix por macro-categoría (evolución anual)" });
  await expect(mixCard).toBeVisible();

  // Primero se espera a que haya barras: garantiza que el gráfico ya se pintó.
  // Con la semilla, todas las categorías caen en "Equipos", así que hay una
  // barra de un solo tramo por año.
  await expect(async () => {
    expect(await mixCard.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  // Con el gráfico ya pintado, no puede quedar ninguna área apilada.
  await expect(mixCard.locator(".recharts-area")).toHaveCount(0);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Comprobar que el puerto 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida. Si hay salida, parar ese servidor antes de seguir.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/charts.spec.ts`
Expected (tarda unos minutos por el `npm run build` del webServer):
- Los 2 tests de `setup` y los 2 tests que ya existían en `charts.spec.ts` pasan.
- `el Mix por macro-categoría se pinta con barras apiladas` **falla** en el `toPass`: el recuento de `.recharts-bar-rectangle` es `0` (`Expected: > 0`, `Received: 0`). Si falla antes, por ejemplo al no encontrar la tarjeta o la pestaña, PARAR: el test está mal, no el gráfico.
- Resumen: `1 failed`, `4 passed`.

- [ ] **Step 3: Pasar el componente a barras**

En `src/components/charts/comercial/bucket-mix-card.tsx`:

**3a. Import (líneas 13-15).** Sustituir:

```tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
```

por:

```tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
```

**3b. Gráfico (líneas 64-73).** Sustituir:

```tsx
            <AreaChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <Tooltip content={<MixTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.5} />
              ))}
            </AreaChart>
```

por:

```tsx
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <Tooltip content={<MixTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend />
              {/* fillOpacity 0.5: conserva el tono del antiguo gráfico de áreas.
                  maxBarSize: con seis años a ancho completo, sin límite cada barra sería un bloque enorme. */}
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} fillOpacity={0.5} maxBarSize={64} />
              ))}
            </BarChart>
```

- [ ] **Step 4: Actualizar el texto de ayuda**

En `src/lib/chart-help.ts`, línea 19, sustituir:

```ts
  bucketMixAnual: "Evolución anual del reparto entre las 4 macro-categorías (área apilada).",
```

por:

```ts
  bucketMixAnual: "Evolución anual del reparto entre las 4 macro-categorías (barras apiladas).",
```

- [ ] **Step 5: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin salida y código de salida 0.

Run: `npm run lint`
Expected: resumen final `✖ 10 problems (0 errors, 10 warnings)`. Si hay 11 o más warnings, o algún error, corregirlo antes de seguir.

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Esperar al menos 60 s desde la ejecución del Step 2 (rate limit de login) y comprobar que el 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/charts.spec.ts`
Expected: `5 passed` (2 de `setup` y 3 de `charts.spec.ts`).

- [ ] **Step 7: Commit**

```bash
git add e2e/specs/charts.spec.ts src/components/charts/comercial/bucket-mix-card.tsx src/lib/chart-help.ts
git commit -m "feat(analytics): mix por macro-categoria en barras apiladas"
```

Expected: husky ejecuta lint-staged (`eslint --fix` sobre los `.ts`/`.tsx`) sin errores y se crea el commit.

---

### Task 2: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Tests unitarios**

Run: `npm test`
Expected: `Tests  124 passed | 1 skipped (125)`. Este cambio no toca código con tests unitarios; cualquier otra cifra es una regresión que hay que investigar.

- [ ] **Step 2: Suite E2E completa**

Esperar al menos 60 s desde la última ejecución E2E y comprobar que el 3100 está libre:

Run: `netstat -ano | grep ":3100 " | grep LISTENING`
Expected: sin salida.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `32 passed` (los 31 actuales, incluidos los 2 de `setup`, y el nuevo). Esta ejecución también compila el proyecto con `npm run build`.

- [ ] **Step 3: Estado de la rama y datos sensibles**

Run: `git status -sb`
Expected: `## feat/mix-anual-barras` sin ficheros modificados.

Run: `git log --oneline origin/main..HEAD`
Expected: tres commits, de más reciente a más antiguo: `feat(analytics): mix por macro-categoria en barras apiladas`, `docs(plan): mix por macro-categoria en barras apiladas` y `docs(spec): mix por macro-categoria en barras apiladas`.

Run: `git diff origin/main..HEAD | grep -n -E '^\+.*\$[0-9]{1,3}(,[0-9]{3})+'`
Expected: sin salida (ningún importe con separador de miles en lo añadido).

---

### Task 3: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Push, PR y merge son visibles en un repositorio público. Pedir confirmación explícita al usuario y no seguir sin ella.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/mix-anual-barras`
Expected: `branch 'feat/mix-anual-barras' set up to track 'origin/feat/mix-anual-barras'`.

- [ ] **Step 3: Abrir el PR**

Si alguna cifra real de la Task 2 difiere de las de la sección Gates, poner la real.

```bash
gh pr create --base main --head feat/mix-anual-barras \
  --title "feat(analytics): mix por macro-categoria en barras apiladas" \
  --body "$(cat <<'EOF'
## Qué

"Mix por macro-categoría (evolución anual)" pasa de áreas apiladas a **barras apiladas**, con los mismos cuatro colores y el mismo tono (opacidad 50 %). Se ve en la pestaña Comercial de Análisis Inteligente y en el widget "Mix anual" del dashboard, que usan el mismo componente.

## Detalles

- Una barra por año; los tramos son Mano de Obra / Cal, C&R, Equipos y Operación, en el mismo orden que las áreas.
- `maxBarSize={64}`: con seis años a ancho completo, sin límite cada barra sería un bloque enorme.
- Cursor del tooltip como en "Estacionalidad por categoría". Datos, título, contenido del tooltip y ejes sin cambios.
- Texto de ayuda: "(barras apiladas)".
- Sin cambios de datos, servidor, migraciones ni SQL.

## Tests

`e2e/specs/charts.spec.ts`: en Comercial, la tarjeta del Mix pinta barras y ninguna área. Escrito antes del cambio: falló con el gráfico de áreas y pasa con el de barras.

## Gates

- `npm run typecheck`: limpio
- `npm run lint`: 10 warnings, 0 errores (baseline intacto)
- `npm test`: 124 pasando + 1 saltado
- `npm run test:e2e`: 32/32

Spec: `docs/superpowers/specs/2026-09-11-mix-anual-barras-design.md`
Plan: `docs/superpowers/plans/2026-09-11-mix-anual-barras.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: la URL del PR nuevo.

- [ ] **Step 4: Esperar al CI**

Run: `gh pr checks feat/mix-anual-barras --watch`
Expected: `build`, `e2e` y `GitGuardian Security Checks` en verde.

- [ ] **Step 5: Fusionar como los PR anteriores (merge commit "título (#N)")**

```bash
N=$(gh pr view feat/mix-anual-barras --json number -q .number)
gh pr merge "$N" --merge \
  --subject "feat(analytics): mix por macro-categoria en barras apiladas (#$N)" \
  --body "feat(analytics): mix por macro-categoria en barras apiladas"
```

Expected: el PR queda `MERGED`.

- [ ] **Step 6: Sincronizar `main` local**

Run: `git checkout main && git fetch origin && git merge --ff-only origin/main`
Expected: avance rápido hasta el merge commit; `git status -sb` muestra `## main...origin/main` sin `ahead` ni `behind`.

El despliegue lo hace el usuario en EasyPanel **después** del merge: el log debe mostrar `feat(analytics): mix por macro-categoria en barras apiladas (#N)`. Tras desplegar, recargar con Ctrl+Shift+R. Sin migración ni SQL.
