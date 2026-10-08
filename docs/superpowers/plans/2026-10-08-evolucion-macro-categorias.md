# Evolución histórica por macro-categoría — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir en Análisis → Exploración, justo debajo de «Evolución Histórica por Grupo», la tarjeta «Evolución Histórica por Macro-categoría», con las mismas funciones: vistas anual, trimestral y mensual, conmutador OV/FAC y selección de varias series.

**Architecture:** Una acción nueva del servidor, `getMacroEvolutionData`, reparte las ventas entre las cuatro macro-categorías con la función pura `buildMacroEvolution` y devuelve el mismo formato que el gráfico de grupos (`GroupingAnalysisResult`). El tramo que lee las ventas de la compañía por tipo de registro (hub en vivo o `sales_records`) se extrae de `getGroupingAnalysisData` a un helper privado que usan las dos acciones. El componente del gráfico de grupos se generaliza a `EvolutionCard`; `GroupEvolutionCard` y `MacroEvolutionCard` son dos envolturas finas. Los colores de las macro-categorías pasan a la constante compartida `BUCKET_COLORS`. Sin migración.

**Tech Stack:** Next.js (App Router, server actions), React 19, TanStack Query v5, Drizzle, recharts, TypeScript, componentes base-ui (no Radix: `render={}` en lugar de `asChild`), vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-evolucion-macro-categorias-design.md`

---

## Contexto para quien ejecuta

Convenciones obligatorias en todas las tareas:

- **Idioma.** El plan está en español. Los comentarios del código van en español y explican el porqué, no el qué. Los textos de la interfaz, en español.
- **Commits.** Conventional commits en español **sin tildes ni eñes** (`categoria`, no `categoría`). **Sin** `Co-Authored-By` ni ninguna atribución a IA. **Un commit por tarea.** Nunca se reescribe historia: nada de `git commit --amend`, `rebase` ni `reset`. Si algo sale mal tras un commit, se arregla con un commit nuevo.
- **Finales de línea.** El repo guarda LF; la copia de trabajo está en CRLF por `core.autocrlf=true`. **Nunca `sed -i`.** Para modificar ficheros existentes se usa la herramienta Edit (conserva el CRLF) o un script de node que lo conserve. Cada fichero conserva los finales de línea que ya tiene: todos los que toca este plan están en CRLF (comprobado), pero si alguno estuviera en LF, se deja en LF. Los ficheros escritos enteros con Write (nuevos o reescritos) quedan en LF: conviértelos a CRLF justo después con

  ```bash
  node -e "const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))" RUTA_DEL_FICHERO
  ```

- **Migraciones.** Ninguna. El despliegue es solo código.
- **Permisos.** Toda lectura exige un perfil aprobado y va filtrada por la compañía del perfil, igual que `getGroupingAnalysisData`: `getCompanyProfile()` (que llama a `requireApproved()`) y `company_id` en todas las consultas.
- **Datos de E2E.** Solo datos inventados: el repositorio es público. Esta funcionalidad no toca la semilla; los tests usan las categorías, los grupos y las ventas inventados que ya siembran `e2e/db/seed-app.mjs` y `e2e/db/seed-hub.mjs`.
- **UI.** Los componentes de `@/components/ui` son base-ui, no Radix.
- **Comandos E2E** (Windows, Git Bash):
  - Si Docker no está arrancado: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar a que `docker info` responda.
  - `E2E_PG_PORT=55433 npm run e2e:db:up`
  - Suite completa: `E2E_PG_PORT=55433 npm run test:e2e` (reinicia la BD y lanza Playwright).
  - Un solo spec: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/NOMBRE.spec.ts`
  - El puerto **3100 tiene que estar libre**: si hay un servidor vivo, Playwright lo reutiliza (`reuseExistingServer`) y probaría un build viejo. Comprobar con `netstat -ano | grep ":3100"`.
  - Deja **al menos 60 s entre dos ejecuciones de Playwright**: el proyecto `setup` hace logins y el login admite 5 intentos por minuto.
  - La máquina local es lenta (unos 5 s por página): un timeout aislado en un spec ajeno a esta funcionalidad es ambiental; se repite ese spec solo antes de darlo por roto.
- **Líneas base.** `npx vitest run`: 411 passed, 1 skipped. `npm run lint`: exactamente 10 warnings y 0 errores. E2E: 72 passing.

## Contexto verificado (2026-10-08, rama `feat/evolucion-macro-categorias`, commit `d7ac719`)

- `src/components/charts/premium/group-evolution-card.tsx` (449 líneas, CRLF):
  - Props: `{ recordType: RecordType }`. Estado: `loading`, `data`, `recordType`, `viewMode` (`ANNUAL` / `QUARTERLY` / `MONTHLY`), `selectedYear`, `selectedGroupIds`, `popoverOpen`.
  - Carga con `useEffect(() => { fetchData(); }, [recordType])`. **No usa react-query.** `fetchData` es una función `async` con `try / catch / finally` definida dentro del componente: filtra los años anteriores a `FIRST_YEAR = 2021`, y si no hay nada seleccionado elige los tres primeros grupos y el último año. Si la lectura falla, escribe en consola y la tarjeta se queda sin datos.
  - Esa línea del `useEffect` (la 122) da **uno de los 10 warnings de la línea base** del lint (`react-hooks/exhaustive-deps`, falta `fetchData`). Los otros nueve están en otros ficheros.
  - Selector de series: `Popover` + `Command` (cmdk); cada serie es un `CommandItem` (rol `option`). El botón que lo abre dice «Seleccionar Grupos...» o «N Grupos Seleccionados».
  - Descripción dinámica: «Tendencia anual|trimestral|mensual y desglose porcentual de tus agrupaciones estratégicas.»
- La usan `src/app/(dashboard)/analytics/page.tsx` (carga diferida con `dynamic` en las líneas 52-55, montaje en la 293 dentro de `TabsContent value="exploration"`) y `src/lib/widget-registry.tsx` (import en la línea 22, widget `evolucion-grupos` en la 175). Las dos le pasan solo `recordType`.
- `src/actions/grouping-actions.ts` (CRLF, `"use server"`):
  - `getCompanyProfile()` (línea 40) llama a `requireApproved()` y exige `company_id`.
  - `getGroupingAnalysisData(recordType)` (línea 280): sin grupos devuelve vacío sin leer ventas. Con grupos, lee en paralelo los mapeos y las ventas. Las ventas salen de `getHubSalesRows()` si `hubEnabled()` (casadas con las categorías de la app por nombre en minúsculas; las que no casan se descartan) o de `sales_records` filtrando por compañía y tipo. `yearTotals` suma **todas** las ventas leídas, estén o no en un grupo.
  - `sales_records.category_id` admite nulos en el esquema (`src/db/schema.ts:169`); el código lo trata como `string` con un cast.
  - **En un fichero `"use server"` toda función exportada es una acción invocable desde el navegador.** Un helper que recibe `companyId` no puede exportarse desde ahí.
- `src/types/database.ts`: `Bucket` (línea 55), `MacroCategoria` (88), `GroupYearData` (212), `GroupingAnalysisRow` (217: `groupId`, `groupName`, `color`, `years`, `months?`, `average`), `GroupingAnalysisResult` (226: `rows`, `years`, `yearTotals`).
- `src/lib/customer-item.ts`: `BUCKETS` (`mano_obra`, `cr`, `equipos`, `operacion`), `BUCKET_LABELS` («Mano de obra», «Consumibles y repuestos», «Equipos», «Operaciones»), `MACRO_CATEGORIAS_KEY = ["categories", "macro-categorias"]`, `mapaMacroCategorias` (por nombre).
- Los cuatro colores (`#6366f1`, `#10b981`, `#f59e0b`, `#ef4444`) están repetidos en **cinco** ficheros, no solo en `bucket-mix-card.tsx`:
  - `src/components/charts/comercial/bucket-mix-card.tsx:21-24`
  - `src/components/charts/comercial/bucket-by-client-card.tsx:22-25`
  - `src/components/charts/comercial/season-by-bucket-card.tsx:20-23`
  - `src/components/customers/customer-bucket-mix-card.tsx:16-19`
  - `src/components/charts/dashboard/category-mix-donut.tsx:17-19` (objeto `COLORS`)
- `src/actions/category-actions.ts`: `getMacroCategorias()` (línea 164) devuelve todas las categorías de la compañía, activas e inactivas. `saveMacroCategorias` solo hace `revalidatePath`; quien invalida `["categories"]` es el formulario de Configuración (`src/app/(dashboard)/settings/_components/macro-categories-form.tsx`, `onSaved`).
- `src/components/providers/query-provider.tsx`: `staleTime` de 1 minuto, `refetchOnWindowFocus: false`, `retry: 1`, `throwOnError: true`.
- `src/lib/chart-help.ts`: `grupoEvolucion` en la línea 38, dentro del bloque «Análisis: Exploración / premium».
- vitest corre en entorno `node`: no hay tests de componentes ni de acciones del servidor. Los componentes y las acciones se cubren con E2E.
- E2E: Playwright levanta la app con `HUB_DB_URL`, así que la lectura va por el hub. Semilla: categorías Aguas (Mano de obra), Aire (Consumibles y repuestos) y Suelos (sin marcar, Equipos); grupos «Ambiental» (Aguas, Aire) y «Consultoria» (Suelos); ventas desde 2020 hasta el año en curso, órdenes los 12 meses y facturas solo los meses pares. **Ningún spec toca hoy «Evolución Histórica por Grupo».** `period-provider` arranca en `INVOICE`.
- Selectores E2E que ya usan otros specs: tarjeta con `page.locator('[data-slot="card"]', { hasText: ... })`, barras con `.recharts-bar-rectangle`, conmutador con `getByRole("tab", { name: /\bOV\b/ })` y `aria-selected`, series del selector con `page.getByRole("option", { name, exact: true })`.

## Decisiones del plan que la spec no fijaba

1. **Cómo se refresca la tarjeta al cambiar la clasificación.** La tarjeta carga con `useEffect`, no con react-query, así que invalidar `["categories"]` no la alcanza por sí solo. Mecanismo elegido: `EvolutionCard` recibe una prop opcional `refreshKey` que entra en las dependencias de su `useEffect` (el mismo patrón que ya usa `grouping-analysis-card.tsx`). `MacroEvolutionCard` se suscribe a la clasificación con `useQuery({ queryKey: MACRO_CATEGORIAS_KEY, queryFn: getMacroCategorias })` y pasa `dataUpdatedAt` como `refreshKey`. Al guardar en Configuración se invalida `["categories"]`; por prefijo se vuelve a pedir `MACRO_CATEGORIAS_KEY`, cambia `dataUpdatedAt` y la tarjeta vuelve a llamar a `getMacroEvolutionData`. Hasta que la clasificación llega, la envoltura muestra el esqueleto y no monta la tarjeta: así el primer montaje hace una sola lectura.
   - **Descartado:** migrar la carga de `EvolutionCard` a `useQuery`. Cambiaría el comportamiento de la tarjeta de grupos (caché de 1 minuto: al editar un grupo y volver a la pestaña se vería el dato viejo; `throwOnError: true` mandaría los fallos a la pantalla de error en vez de dejar la tarjeta vacía) y movería la cuenta de warnings del lint.
2. **`fetchData` se copia tal cual**, con su `try / catch / finally` dentro del componente. El warning de `exhaustive-deps` se muda de `group-evolution-card.tsx` a `evolution-card.tsx` y el total sigue en 10.
3. **Descripción.** La spec da un texto fijo («Tendencia anual…»), pero la tarjeta real cambia la palabra según la vista. La prop `description` es una función que recibe el periodo (`"anual"`, `"trimestral"` o `"mensual"`); en la vista anual el texto de macro-categorías es exactamente el de la spec.
4. **Dónde vive la acción.** `getMacroEvolutionData` va en `src/actions/grouping-actions.ts`, junto a `getGroupingAnalysisData`, para compartir el helper `loadSalesRecordsByType` sin exportarlo.
5. **El cruce categoría → macro-categoría va por id** (`bucketsPorCategoriaId`, función pura en `src/lib/macro-evolution.ts`), porque el helper ya devuelve las ventas con el id de la categoría de la app.
6. **Venta sin categoría.** Solo puede pasar leyendo de `sales_records` (`category_id` nulo). Cuenta como Equipos, igual que en `bucketForCategory`.
7. **Selección inicial.** `seleccionInicialIds` es una función pura en `src/lib/evolution-card.ts`, para poder probarla con vitest.
8. **El refresco tras guardar no tiene E2E propio.** Configuración y Análisis son rutas distintas y comprobarlo obligaría a cambiar la clasificación compartida por los demás specs. Queda en la revisión manual de la Task 5.

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/customer-item.ts` | Modificar | Añade `BUCKET_COLORS`. |
| `src/lib/__tests__/customer-item.test.ts` | Modificar | Tests de `BUCKET_COLORS`. |
| `src/components/charts/comercial/bucket-mix-card.tsx` | Modificar | Usa `BUCKET_COLORS`. |
| `src/components/charts/comercial/bucket-by-client-card.tsx` | Modificar | Usa `BUCKET_COLORS`. |
| `src/components/charts/comercial/season-by-bucket-card.tsx` | Modificar | Usa `BUCKET_COLORS`. |
| `src/components/customers/customer-bucket-mix-card.tsx` | Modificar | Usa `BUCKET_COLORS`. |
| `src/components/charts/dashboard/category-mix-donut.tsx` | Modificar | Usa `BUCKET_COLORS`. |
| `src/lib/macro-evolution.ts` | Crear | `bucketsPorCategoriaId` y `buildMacroEvolution`. |
| `src/lib/__tests__/macro-evolution.test.ts` | Crear | Tests de la lógica pura. |
| `src/actions/grouping-actions.ts` | Modificar | Helper privado `loadSalesRecordsByType` y acción `getMacroEvolutionData`. |
| `src/lib/evolution-card.ts` | Crear | `SeleccionInicial` y `seleccionInicialIds`. |
| `src/lib/__tests__/evolution-card.test.ts` | Crear | Tests de la selección inicial. |
| `src/components/charts/premium/evolution-card.tsx` | Crear | `EvolutionCard` y `EvolutionCardSkeleton`: la tarjeta genérica. |
| `src/components/charts/premium/group-evolution-card.tsx` | Reescribir | Envoltura `GroupEvolutionCard`, mismas props. |
| `src/components/charts/premium/macro-evolution-card.tsx` | Crear | Envoltura `MacroEvolutionCard`. |
| `src/lib/chart-help.ts` | Modificar | Texto de ayuda `macroEvolucion`. |
| `src/app/(dashboard)/analytics/page.tsx` | Modificar | Monta `MacroEvolutionCard` debajo de la de grupos. |
| `e2e/specs/evolucion-macro.spec.ts` | Crear | E2E de las dos tarjetas. |

`src/lib/widget-registry.tsx` **no se toca**: sigue importando `GroupEvolutionCard` del mismo fichero y con las mismas props.

---

## Task 1: Colores de las macro-categorías en una constante compartida

**Files:**
- Modify: `src/lib/customer-item.ts`
- Modify: `src/lib/__tests__/customer-item.test.ts`
- Modify: `src/components/charts/comercial/bucket-mix-card.tsx`
- Modify: `src/components/charts/comercial/bucket-by-client-card.tsx`
- Modify: `src/components/charts/comercial/season-by-bucket-card.tsx`
- Modify: `src/components/customers/customer-bucket-mix-card.tsx`
- Modify: `src/components/charts/dashboard/category-mix-donut.tsx`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/__tests__/customer-item.test.ts`, con Edit, cambiar el principio del import:

```ts
import {
  BUCKET_LABELS,
  bucketForCategory,
```

por:

```ts
import {
  BUCKETS,
  BUCKET_COLORS,
  BUCKET_LABELS,
  bucketForCategory,
```

Y añadir al final del fichero, después del último `});`:

```ts

describe("BUCKET_COLORS", () => {
  it("da un color hexadecimal a cada macro-categoría y a ninguna más", () => {
    for (const b of BUCKETS) expect(BUCKET_COLORS[b]).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(BUCKET_COLORS).sort()).toEqual([...BUCKETS].sort());
  });

  it("conserva los colores que ya usaban las tarjetas de mezcla", () => {
    expect(BUCKET_COLORS).toEqual({
      mano_obra: "#6366f1",
      cr: "#10b981",
      equipos: "#f59e0b",
      operacion: "#ef4444",
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts`
Expected: FAIL en los dos tests de `BUCKET_COLORS` (`BUCKET_COLORS` es `undefined`: `Cannot read properties of undefined` y `expected undefined to deeply equal …`). El resto del fichero pasa.

- [ ] **Step 3: Añadir la constante**

En `src/lib/customer-item.ts`, con Edit, justo después del cierre de `BUCKET_LABELS`. Cambiar:

```ts
  equipos: "Equipos",
  operacion: "Operaciones",
};
```

por:

```ts
  equipos: "Equipos",
  operacion: "Operaciones",
};

/**
 * Color de cada macro-categoría en todos los gráficos. Está en un solo sitio para que la
 * misma macro-categoría no salga de un color en una tarjeta y de otro en la siguiente.
 */
export const BUCKET_COLORS: Record<Bucket, string> = {
  mano_obra: "#6366f1",
  cr: "#10b981",
  equipos: "#f59e0b",
  operacion: "#ef4444",
};
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts`
Expected: PASS, todos los tests del fichero.

- [ ] **Step 5: Las cuatro tarjetas con `SERIES` usan la constante**

En cada uno de estos cuatro ficheros se hacen, con Edit, los mismos dos cambios:

- `src/components/charts/comercial/bucket-mix-card.tsx`
- `src/components/charts/comercial/bucket-by-client-card.tsx`
- `src/components/charts/comercial/season-by-bucket-card.tsx`
- `src/components/customers/customer-bucket-mix-card.tsx`

Cambio 1, el import. De:

```ts
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
```

a:

```ts
import { BUCKET_COLORS, BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
```

Cambio 2, las cuatro filas de `SERIES`. De:

```ts
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
```

a:

```ts
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: BUCKET_COLORS.mano_obra },
  { key: "cr", label: BUCKET_LABELS.cr, color: BUCKET_COLORS.cr },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: BUCKET_COLORS.equipos },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: BUCKET_COLORS.operacion },
```

- [ ] **Step 6: El donut del dashboard usa la constante**

En `src/components/charts/dashboard/category-mix-donut.tsx`, con Edit. Cambiar el import:

```ts
import { MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
```

por:

```ts
import { BUCKET_COLORS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
```

Y cambiar:

```ts
const COLORS: Record<string, string> = {
  mano_obra: "#6366f1", cr: "#10b981", equipos: "#f59e0b", operacion: "#ef4444",
};
```

por:

```ts
// MixSlice lleva la macro-categoría como string: por eso se indexa por string y no por Bucket.
const COLORS: Record<string, string> = BUCKET_COLORS;
```

- [ ] **Step 7: Comprobar que no queda ningún color repetido y que todo compila**

Run: `grep -rn "BUCKET_LABELS.mano_obra, color" src`
Expected: cuatro líneas, todas con `color: BUCKET_COLORS.mano_obra`.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: **413 passed, 1 skipped** (411 + 2).

- [ ] **Step 8: Commit**

```bash
git add src/lib/customer-item.ts src/lib/__tests__/customer-item.test.ts src/components/charts/comercial/bucket-mix-card.tsx src/components/charts/comercial/bucket-by-client-card.tsx src/components/charts/comercial/season-by-bucket-card.tsx src/components/customers/customer-bucket-mix-card.tsx src/components/charts/dashboard/category-mix-donut.tsx
git commit -m "refactor(graficos): colores de macro-categorias en una constante compartida"
```

---

## Task 2: Reparto de las ventas por macro-categoría y su lectura en el servidor

**Files:**
- Create: `src/lib/macro-evolution.ts`
- Create: `src/lib/__tests__/macro-evolution.test.ts`
- Modify: `src/actions/grouping-actions.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/macro-evolution.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import {
  bucketsPorCategoriaId,
  buildMacroEvolution,
  type MacroEvolutionRecord,
} from "@/lib/macro-evolution";
import { BUCKETS, BUCKET_COLORS, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";

const mapa = new Map<string, Bucket>([
  ["c-mo", "mano_obra"],
  ["c-cr", "cr"],
  ["c-eq", "equipos"],
  ["c-op", "operacion"],
]);

const v = (
  category_id: string | null,
  record_year: number,
  record_month: number,
  amount_usd: number
): MacroEvolutionRecord => ({ category_id, record_year, record_month, amount_usd });

// 2024: Mano de obra 150, C&R 50, Equipos 200, Operaciones 0. Total 400.
// 2025: Mano de obra 0, C&R 0, Equipos 200, Operaciones 300. Total 500.
const ventas: MacroEvolutionRecord[] = [
  v("c-mo", 2024, 1, 100),
  v("c-mo", 2024, 2, 50),
  v("c-cr", 2024, 1, 50),
  v("c-sin-marcar", 2024, 3, 200),
  v("c-op", 2025, 12, 300),
  v("c-eq", 2025, 12, 100),
  v(null, 2025, 6, 100),
];

const fila = (r: ReturnType<typeof buildMacroEvolution>, b: Bucket) => r.rows.find((x) => x.groupId === b)!;

describe("bucketsPorCategoriaId", () => {
  it("indexa por id las categorías marcadas, activas o no, y deja fuera las no marcadas", () => {
    const m = bucketsPorCategoriaId([
      { id: "a", macro_categoria: "mano_obra" },
      { id: "b", macro_categoria: null },
      { id: "c", macro_categoria: "operacion" },
    ]);
    expect([...m.entries()]).toEqual([["a", "mano_obra"], ["c", "operacion"]]);
  });

  it("descarta un valor que no es una macro-categoría", () => {
    const m = bucketsPorCategoriaId([{ id: "a", macro_categoria: "otra" as unknown as Bucket }]);
    expect(m.size).toBe(0);
  });
});

describe("buildMacroEvolution", () => {
  it("devuelve siempre cuatro filas, en el orden de BUCKETS, con sus nombres y colores", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(r.rows.map((x) => x.groupId)).toEqual([...BUCKETS]);
    expect(r.rows.map((x) => x.groupName)).toEqual(BUCKETS.map((b) => BUCKET_LABELS[b]));
    expect(r.rows.map((x) => x.color)).toEqual(BUCKETS.map((b) => BUCKET_COLORS[b]));
  });

  it("una categoría sin entrada en el mapa, o una venta sin categoría, cuenta como Equipos", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "equipos").years[2024].amount).toBe(200);
    expect(fila(r, "equipos").years[2025].amount).toBe(200);
  });

  it("suma los importes por año y por mes", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "mano_obra").years[2024].amount).toBe(150);
    expect(fila(r, "mano_obra").years[2025].amount).toBe(0);
    expect(fila(r, "mano_obra").months).toEqual({ 2024: { 1: 100, 2: 50 } });
    expect(fila(r, "equipos").months).toEqual({ 2024: { 3: 200 }, 2025: { 6: 100, 12: 100 } });
    expect(fila(r, "operacion").months).toEqual({ 2025: { 12: 300 } });
  });

  it("los porcentajes de las cuatro filas suman 100 en cada año con ventas", () => {
    const r = buildMacroEvolution(ventas, mapa);
    for (const y of r.years) {
      const suma = r.rows.reduce((acc, x) => acc + x.years[y].percentage, 0);
      expect(suma).toBeCloseTo(100, 10);
    }
    expect(fila(r, "mano_obra").years[2024].percentage).toBeCloseTo(37.5, 10);
    expect(fila(r, "cr").years[2024].percentage).toBeCloseTo(12.5, 10);
    expect(fila(r, "operacion").years[2025].percentage).toBeCloseTo(60, 10);
  });

  it("yearTotals es la suma de las filas y years va en orden ascendente", () => {
    const r = buildMacroEvolution([...ventas].reverse(), mapa);
    expect(r.years).toEqual([2024, 2025]);
    expect(r.yearTotals).toEqual({ 2024: 400, 2025: 500 });
    for (const y of r.years) {
      expect(r.rows.reduce((acc, x) => acc + x.years[y].amount, 0)).toBe(r.yearTotals[y]);
    }
  });

  it("el promedio reparte el total entre los años, como en el gráfico de grupos", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "mano_obra").average.amount).toBe(75);
    expect(fila(r, "mano_obra").average.percentage).toBeCloseTo((150 / 900) * 100, 10);
    expect(fila(r, "equipos").average.amount).toBe(200);
    expect(fila(r, "equipos").average.percentage).toBeCloseTo((400 / 900) * 100, 10);
  });

  it("acepta importes NUMERIC que llegan como texto", () => {
    const r = buildMacroEvolution(
      [
        { category_id: "c-cr", record_year: 2024, record_month: 1, amount_usd: "12.50" as unknown as number },
        { category_id: "c-cr", record_year: 2024, record_month: 1, amount_usd: "12.50" as unknown as number },
      ],
      mapa
    );
    expect(fila(r, "cr").years[2024].amount).toBe(25);
    expect(fila(r, "cr").months).toEqual({ 2024: { 1: 25 } });
  });

  it("sin ventas, las filas valen cero y no hay años", () => {
    const r = buildMacroEvolution([], mapa);
    expect(r.years).toEqual([]);
    expect(r.yearTotals).toEqual({});
    expect(r.rows).toHaveLength(4);
    for (const x of r.rows) {
      expect(x.years).toEqual({});
      expect(x.months).toEqual({});
      expect(x.average).toEqual({ amount: 0, percentage: 0 });
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `npx vitest run src/lib/__tests__/macro-evolution.test.ts`
Expected: FAIL, el fichero no carga porque `@/lib/macro-evolution` no existe (error de resolución del import).

- [ ] **Step 3: Escribir la lógica pura**

Crear `src/lib/macro-evolution.ts` (y convertirlo a CRLF):

```ts
import { BUCKETS, BUCKET_COLORS, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";
import type { GroupingAnalysisResult, GroupingAnalysisRow, MacroCategoria } from "@/types/database";

/** Venta agregada por categoría, mes y año, ya filtrada por tipo de registro. */
export interface MacroEvolutionRecord {
  /** Id de la categoría de la app. Nulo en una venta de sales_records sin categoría. */
  category_id: string | null;
  record_year: number;
  record_month: number;
  amount_usd: number;
}

/**
 * Macro-categoría de cada categoría marcada, indexada por id.
 * - Va por id y no por nombre (como mapaMacroCategorias) porque las ventas ya llegan
 *   aquí con el id de la categoría de la app.
 * - Entran las inactivas: sus ventas de años anteriores siguen en su macro-categoría.
 * - Las no marcadas no entran, y buildMacroEvolution las cuenta como Equipos.
 */
export function bucketsPorCategoriaId(
  categorias: readonly Pick<MacroCategoria, "id" | "macro_categoria">[]
): Map<string, Bucket> {
  const mapa = new Map<string, Bucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como macro-categoría.
    if (c.macro_categoria !== null && (BUCKETS as readonly string[]).includes(c.macro_categoria)) {
      mapa.set(c.id, c.macro_categoria);
    }
  }
  return mapa;
}

/**
 * Reparte las ventas entre las cuatro macro-categorías, en el formato del gráfico de
 * grupos para que los dos compartan tarjeta. Siempre devuelve las cuatro filas, en el
 * orden de BUCKETS, aunque alguna no tenga ventas: el selector de series no debe cambiar
 * de un año a otro.
 */
export function buildMacroEvolution(
  records: readonly MacroEvolutionRecord[],
  bucketPorCategoriaId: ReadonlyMap<string, Bucket>
): GroupingAnalysisResult {
  const porAnio = {} as Record<Bucket, Record<number, number>>;
  const porMes = {} as Record<Bucket, Record<number, Record<number, number>>>;
  for (const b of BUCKETS) {
    porAnio[b] = {};
    porMes[b] = {};
  }
  const yearTotals: Record<number, number> = {};

  for (const r of records) {
    const year = Number(r.record_year);
    const month = Number(r.record_month);
    // Leído de sales_records, el importe es NUMERIC y llega como texto.
    const amount = Number(r.amount_usd) || 0;
    // Sin categoría o con una categoría sin marcar: Equipos, como en el resto de
    // gráficos de macro-categorías.
    const b = (r.category_id ? bucketPorCategoriaId.get(r.category_id) : undefined) ?? "equipos";

    yearTotals[year] = (yearTotals[year] || 0) + amount;
    porAnio[b][year] = (porAnio[b][year] || 0) + amount;
    const meses = (porMes[b][year] ??= {});
    meses[month] = (meses[month] || 0) + amount;
  }

  const years = Object.keys(yearTotals).map(Number).sort((a, b) => a - b);
  const totalGeneral = years.reduce((acc, y) => acc + yearTotals[y], 0);

  const rows: GroupingAnalysisRow[] = BUCKETS.map((b) => {
    const yearData: GroupingAnalysisRow["years"] = {};
    let total = 0;
    for (const y of years) {
      const amount = porAnio[b][y] || 0;
      const totalAnio = yearTotals[y];
      yearData[y] = { amount, percentage: totalAnio > 0 ? (amount / totalAnio) * 100 : 0 };
      total += amount;
    }
    return {
      groupId: b,
      groupName: BUCKET_LABELS[b],
      color: BUCKET_COLORS[b],
      years: yearData,
      months: porMes[b],
      // Igual que en el gráfico de grupos: importe medio por año y peso sobre el total
      // de todos los años.
      average: {
        amount: years.length > 0 ? total / years.length : 0,
        percentage: totalGeneral > 0 ? (total / totalGeneral) * 100 : 0,
      },
    };
  });

  return { rows, years, yearTotals };
}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `npx vitest run src/lib/__tests__/macro-evolution.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Extraer la lectura de ventas a un helper privado**

En `src/actions/grouping-actions.ts`, con Edit.

Cambio 1, el import. Después de:

```ts
import { runAction, AppError, type ActionResult } from "@/lib/errors";
```

añadir:

```ts
import { bucketsPorCategoriaId, buildMacroEvolution } from "@/lib/macro-evolution";
```

Cambio 2. Sustituir todo el tramo que va desde el comentario `// ─── Analysis Data Processing ───` hasta el cierre del `Promise.all` de mapeos y ventas (hoy, líneas 278-359; termina en `    recordsP,` y `  ]);`) por este texto. Lo que viene después, desde `  // Build mapping: categoryId → groupId` hasta el final de la función, **no se toca**:

```ts
// ─── Analysis Data Processing ───

// Venta agregada por categoría, mes y año, tal como la necesitan los dos análisis.
type AnalysisRecord = {
  category_id: string;
  record_year: number;
  record_month: number;
  amount_usd: number;
};

/**
 * Ventas de la compañía de un tipo de registro, con el id de la categoría de la app.
 * Vienen del hub en vivo (si HUB_DB_URL está) o de sales_records. En el hub la categoría
 * llega por nombre: se casa con las de la app en minúsculas y se descartan las ventas
 * cuya categoría no existe en la app.
 *
 * NO se exporta: en un fichero "use server" toda función exportada es una acción que el
 * navegador puede invocar, y esta recibe el companyId sin comprobar la sesión. Quien la
 * llama tiene que haber pasado antes por getCompanyProfile().
 */
async function loadSalesRecordsByType(
  companyId: string,
  recordType: RecordType
): Promise<AnalysisRecord[]> {
  if (hubEnabled()) {
    const [hubRows, cats] = await Promise.all([
      getHubSalesRows(),
      db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.company_id, companyId)),
    ]);
    const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
    return hubRows
      .filter((r) => r.record_type === recordType)
      .map((r) => ({
        category_id: byName.get(r.category_name.toLowerCase()) ?? "",
        record_year: r.record_year,
        record_month: r.record_month,
        amount_usd: r.amount_usd,
      }))
      .filter((r) => r.category_id !== "");
  }

  const rows = await db
    .select({
      category_id: salesRecords.category_id,
      record_year: salesRecords.record_year,
      record_month: salesRecords.record_month,
      amount_usd: salesRecords.amount_usd,
    })
    .from(salesRecords)
    .where(
      and(
        eq(salesRecords.company_id, companyId),
        eq(salesRecords.record_type, recordType)
      )
    );
  // El cast es el que ya había: amount_usd es NUMERIC (llega como texto) y category_id
  // admite nulos. Los dos consumidores convierten con Number() y toleran el nulo.
  return rows as unknown as AnalysisRecord[];
}

export async function getGroupingAnalysisData(
  recordType: RecordType
): Promise<GroupingAnalysisResult> {
  const { profile } = await getCompanyProfile();
  const companyId = profile.company_id!;

  // 1. Fetch all groups for this company
  const groups = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.company_id, companyId))
    .orderBy(asc(categoryGroups.sort_order));

  if (groups.length === 0) {
    return { rows: [], years: [], yearTotals: {} };
  }

  // 1b. Mappings y registros son independientes entre sí → en paralelo.
  // (Se eliminó la consulta de colores de categoría: catColorMap era código muerto,
  //  el color de cada fila sale del color del grupo.)
  const groupIds = groups.map((g) => g.id);

  const [mappings, records] = await Promise.all([
    db
      .select({
        group_id: categoryGroupMappings.group_id,
        category_id: categoryGroupMappings.category_id,
      })
      .from(categoryGroupMappings)
      .where(
        and(
          eq(categoryGroupMappings.company_id, companyId),
          inArray(categoryGroupMappings.group_id, groupIds)
        )
      ),
    loadSalesRecordsByType(companyId, recordType),
  ]);
```

- [ ] **Step 6: Añadir la acción `getMacroEvolutionData`**

Al final de `src/actions/grouping-actions.ts`, después del `}` que cierra `getGroupingAnalysisData`, añadir:

```ts

/**
 * Ventas repartidas entre las cuatro macro-categorías, en el mismo formato que
 * getGroupingAnalysisData para que los dos gráficos compartan tarjeta. Cuenta las mismas
 * ventas que el gráfico de grupos: en el hub, las de categorías que no existen en la app
 * se descartan.
 */
export async function getMacroEvolutionData(
  recordType: RecordType
): Promise<GroupingAnalysisResult> {
  const { profile } = await getCompanyProfile();
  const companyId = profile.company_id!;

  // Todas las categorías de la compañía, activas e inactivas: las ventas de años
  // anteriores de una categoría desactivada siguen en su macro-categoría.
  const [cats, records] = await Promise.all([
    db
      .select({ id: categories.id, macro_categoria: categories.macro_categoria })
      .from(categories)
      .where(eq(categories.company_id, companyId)),
    loadSalesRecordsByType(companyId, recordType),
  ]);

  return buildMacroEvolution(records, bucketsPorCategoriaId(cats));
}
```

- [ ] **Step 7: Comprobar que `getGroupingAnalysisData` no ha cambiado de resultado**

Run: `git diff src/actions/grouping-actions.ts`
Expected: el diff solo muestra (a) el import nuevo, (b) el tipo `AnalysisRecord` y la lectura de ventas movidos de dentro de `getGroupingAnalysisData` a `loadSalesRecordsByType`, con el mismo filtro y el mismo cruce por nombre, (c) `recordsP` sustituido por `loadSalesRecordsByType(companyId, recordType)` dentro del mismo `Promise.all`, y (d) la acción nueva al final. Ninguna línea desde `// Build mapping: categoryId → groupId` hasta el `return { rows, years, yearTotals };` de `getGroupingAnalysisData` aparece modificada.

Run: `grep -n "^export" src/actions/grouping-actions.ts`
Expected: `loadSalesRecordsByType` **no** aparece; sí aparecen `getGroupingAnalysisData` y `getMacroEvolutionData`.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: **423 passed, 1 skipped** (413 + 10).

- [ ] **Step 8: Commit**

```bash
git add src/lib/macro-evolution.ts src/lib/__tests__/macro-evolution.test.ts src/actions/grouping-actions.ts
git commit -m "feat(analisis): reparto de ventas por macro-categoria y su lectura"
```

---

## Task 3: Tarjeta de evolución genérica compartida

La tarjeta de grupos pasa a ser una envoltura de `EvolutionCard`. Sus props y su comportamiento no cambian: la página de Análisis y el widget del dashboard siguen igual.

**Files:**
- Create: `src/lib/evolution-card.ts`
- Create: `src/lib/__tests__/evolution-card.test.ts`
- Create: `src/components/charts/premium/evolution-card.tsx`
- Rewrite: `src/components/charts/premium/group-evolution-card.tsx`
- Create: `e2e/specs/evolucion-macro.spec.ts`

- [ ] **Step 1: Escribir el test unitario que falla**

Crear `src/lib/__tests__/evolution-card.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { seleccionInicialIds } from "@/lib/evolution-card";

const filas = ["a", "b", "c", "d"].map((groupId) => ({ groupId }));

describe("seleccionInicialIds", () => {
  it("con «primeras3» elige las tres primeras filas, en su orden", () => {
    expect(seleccionInicialIds(filas, "primeras3")).toEqual(["a", "b", "c"]);
  });

  it("con «primeras3» y menos de tres filas las elige todas", () => {
    expect(seleccionInicialIds(filas.slice(0, 2), "primeras3")).toEqual(["a", "b"]);
  });

  it("con «todas» elige todas las filas", () => {
    expect(seleccionInicialIds(filas, "todas")).toEqual(["a", "b", "c", "d"]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `npx vitest run src/lib/__tests__/evolution-card.test.ts`
Expected: FAIL, el fichero no carga porque `@/lib/evolution-card` no existe.

- [ ] **Step 3: Escribir la selección inicial**

Crear `src/lib/evolution-card.ts` (y convertirlo a CRLF):

```ts
/**
 * Qué series salen marcadas al abrir una tarjeta de evolución: las tres primeras (los
 * grupos pueden ser muchos y el gráfico apilado se vuelve ilegible) o todas (las
 * macro-categorías son siempre cuatro).
 */
export type SeleccionInicial = "primeras3" | "todas";

export function seleccionInicialIds(
  rows: readonly { groupId: string }[],
  modo: SeleccionInicial
): string[] {
  const elegidas = modo === "todas" ? rows : rows.slice(0, 3);
  return elegidas.map((r) => r.groupId);
}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `npx vitest run src/lib/__tests__/evolution-card.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Escribir el E2E de caracterización de la tarjeta de grupos**

Este test describe lo que la tarjeta de grupos hace **hoy**. Tiene que pasar antes y después de generalizarla.

Crear `e2e/specs/evolucion-macro.spec.ts` (y convertirlo a CRLF):

```ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TITULO_GRUPOS = "Evolución Histórica por Grupo";

// La semilla del hub (e2e/db/seed-hub.mjs) llega hasta el año en curso, y la tarjeta
// abre las vistas trimestral y mensual en el último año con datos.
const ANIO = String(new Date().getFullYear());

// Tarjeta acotada por su título con `data-slot="card"`, como en charts.spec.ts.
function tarjeta(page: Page, titulo: string) {
  return page.locator('[data-slot="card"]', { hasText: titulo });
}

// svg.recharts-surface existe aunque el gráfico esté vacío: hay que mirar las barras.
async function esperarBarras(card: Locator) {
  await expect(async () => {
    expect(await card.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
}

test("la tarjeta de grupos sigue funcionando", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const card = tarjeta(page, TITULO_GRUPOS);
  await expect(card).toBeVisible();

  // La semilla (e2e/db/seed-app.mjs) tiene dos grupos, Ambiental y Consultoria: «los
  // tres primeros» son los dos.
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await expect(
    card.getByText("Tendencia anual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Vista mensual: aparece el selector de año y la descripción cambia.
  const anio = card.getByRole("button", { name: ANIO, exact: true });
  await expect(anio).toHaveCount(0);
  await card.getByRole("tab", { name: "Mensual", exact: true }).click();
  await expect(anio).toBeVisible();
  await expect(
    card.getByText("Tendencia mensual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Quitar un grupo y volver a añadirlo. El desplegable se pinta fuera de la tarjeta.
  await card.getByRole("button", { name: "2 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "1 Grupos Seleccionados" })).toBeVisible();

  await card.getByRole("button", { name: "1 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await esperarBarras(card);

  expect(crashes, `Excepciones en la tarjeta de grupos:\n${crashes.join("\n")}`).toEqual([]);
});
```

- [ ] **Step 6: Ejecutar el E2E antes de tocar el componente**

Comprobar Docker (`docker info`), el puerto 3100 libre (`netstat -ano | grep ":3100"`) y `E2E_PG_PORT=55433 npm run e2e:db:up`.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/evolucion-macro.spec.ts`
Expected: **PASS** (1 test, más el proyecto `setup`). Es un test de caracterización: tiene que estar en verde antes del cambio. Además prueba de punta a punta que `getGroupingAnalysisData` sigue dando datos tras la extracción de la Task 2. Si falla aquí, el fallo es del test o de la Task 2, no de esta tarea: se arregla antes de seguir.

- [ ] **Step 7: Crear la tarjeta genérica**

Crear `src/components/charts/premium/evolution-card.tsx` (y convertirlo a CRLF). Es el componente de `group-evolution-card.tsx` con el título, los textos, la lectura y la selección inicial convertidos en props. **`fetchData` y sus dos `useEffect` se copian con la misma forma** (ver la decisión 2): no se reescriben con `useCallback` ni con react-query.

```tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordTypeToggle, type RecordTypeValue } from "@/components/common/record-type-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  BarChart3,
  Plus,
  X,
  Check,
  History,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { seleccionInicialIds, type SeleccionInicial } from "@/lib/evolution-card";
import type { GroupingAnalysisResult, RecordType } from "@/types/database";
import type { ChartTooltipEntry, ChartTooltipProps } from "@/lib/chart-types";

// --- Helpers ---
// Punto del gráfico: clave de eje (year/quarter/month) + claves dinámicas por serie.
type GroupChartPoint = Record<string, string | number>;
const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const formatCurrencyCompact = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

/** Textos del selector de series y del estado vacío: cambian con lo que se evoluciona. */
export interface EvolutionCardTextos {
  /** Botón del selector cuando no hay ninguna serie elegida. */
  seleccionar: string;
  /** Botón del selector con n series elegidas. */
  seleccionados: (n: number) => string;
  /** Marcador del buscador del desplegable. */
  buscar: string;
  /** Mensaje del desplegable cuando la búsqueda no encuentra nada. */
  sinResultados: string;
  /** Encabezado de la lista del desplegable. */
  disponibles: string;
  /** Mensaje del gráfico cuando no hay ninguna serie elegida. */
  vacio: string;
}

export interface EvolutionCardProps {
  /** Tipo inicial. La tarjeta tiene su propio conmutador OV/FAC y se resincroniza si cambia. */
  recordType: RecordType;
  title: string;
  /** Descripción bajo el título. Recibe "anual", "trimestral" o "mensual" según la vista. */
  description: (periodo: string) => string;
  /** Texto del icono de ayuda. */
  help: string;
  /** Lectura de los datos: una fila por serie, en el formato del gráfico de grupos. */
  fetcher: (recordType: RecordType) => Promise<GroupingAnalysisResult>;
  seleccionInicial: SeleccionInicial;
  textos: EvolutionCardTextos;
  /**
   * Cuando cambia, la tarjeta vuelve a pedir los datos aunque el tipo sea el mismo. Lo
   * usa la de macro-categorías para refrescarse al guardar la clasificación.
   */
  refreshKey?: number;
}

type ViewMode = "ANNUAL" | "QUARTERLY" | "MONTHLY";

// Primer año con datos completos, igual que el resto de la app (ver getYearRange
// en @/lib/constants). 2020 es parcial y distorsiona la comparación.
const FIRST_YEAR = 2021;

/** Esqueleto de la tarjeta. Exportado para las envolturas que esperan algo antes de montarla. */
export function EvolutionCardSkeleton() {
  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[500px]">
      <CardContent className="p-8 space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-44" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </CardContent>
    </Card>
  );
}

export function EvolutionCard({
  recordType: initialRecordType,
  title,
  description,
  help,
  fetcher,
  seleccionInicial,
  textos,
  refreshKey,
}: EvolutionCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [viewMode, setViewMode] = useState<ViewMode>("ANNUAL");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // El tipo de fuera manda cuando cambia; dentro, el conmutador de la tarjeta es libre.
  useEffect(() => {
    setRecordType(initialRecordType);
  }, [initialRecordType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const raw = await fetcher(recordType);
      // Se filtra aquí (punto único) para que gráfico, selector de año y totales
      // usen el mismo rango sin tener que repetir el filtro en cada consumidor.
      const result = { ...raw, years: raw.years.filter((y) => y >= FIRST_YEAR) };
      setData(result);
      // Solo se elige por el usuario cuando no hay nada elegido: una recarga no debe
      // pisar su selección.
      if (selectedGroupIds.length === 0 && result.rows.length > 0) {
        setSelectedGroupIds(seleccionInicialIds(result.rows, seleccionInicial));
      }
      // Las vistas trimestral y mensual abren en el último año.
      if (!selectedYear && result.years.length > 0) {
        setSelectedYear(result.years[result.years.length - 1]);
      }
    } catch (err) {
      console.error("Error fetching evolution data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [recordType, refreshKey]);

  // Los datos llegan por serie; recharts los quiere por punto del eje.
  const chartData = useMemo(() => {
    if (!data || data.years.length === 0) return [];

    if (viewMode === "ANNUAL") {
      return data.years.map(year => {
        const entry: GroupChartPoint = { year };
        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            entry[row.groupName] = row.years[year]?.amount || 0;
            entry[`${row.groupName}_percent`] = row.years[year]?.percentage || 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
    } else if (viewMode === "QUARTERLY") {
      if (!selectedYear) return [];

      const quarterlyEntries = QUARTERS.map((name, idx) => {
        const startMonth = idx * 3 + 1;
        const entry: GroupChartPoint = { quarter: name };

        let grandQuarterlyTotal = 0;
        data.rows.forEach(r => {
          for (let m = startMonth; m < startMonth + 3; m++) {
            grandQuarterlyTotal += r.months?.[selectedYear]?.[m] || 0;
          }
        });

        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            let amount = 0;
            for (let m = startMonth; m < startMonth + 3; m++) {
              amount += row.months?.[selectedYear]?.[m] || 0;
            }
            entry[row.groupName] = amount;
            entry[`${row.groupName}_percent`] = grandQuarterlyTotal > 0 ? (amount / grandQuarterlyTotal) * 100 : 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
      return quarterlyEntries;
    } else {
      // Vista mensual del año elegido.
      if (!selectedYear) return [];

      const monthlyEntries = MONTHS.map((name, idx) => {
        const monthNum = idx + 1;
        const entry: GroupChartPoint = { month: name };

        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            const amount = row.months?.[selectedYear]?.[monthNum] || 0;
            entry[row.groupName] = amount;
            // El porcentaje es sobre el total del mes de todas las series, elegidas o no.
            const grandMonthlyTotal = data.rows.reduce((sum, r) => sum + (r.months?.[selectedYear]?.[monthNum] || 0), 0);
            entry[`${row.groupName}_percent`] = grandMonthlyTotal > 0 ? (amount / grandMonthlyTotal) * 100 : 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
      return monthlyEntries;
    }
  }, [data, selectedGroupIds, viewMode, selectedYear]);

  const selectedGroupDetails = useMemo(() => {
    return data?.rows.filter(r => selectedGroupIds.includes(r.groupId)) || [];
  }, [data, selectedGroupIds]);

  const periodo = viewMode === "MONTHLY" ? "mensual" : viewMode === "QUARTERLY" ? "trimestral" : "anual";

  // --- Custom Tooltip ---
  const CustomTooltip = ({ active, payload, label }: ChartTooltipProps<GroupChartPoint>) => {
    if (active && payload && payload.length) {
      // De mayor a menor importe.
      const sortedPayload = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      return (
        <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[260px]">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground text-lg">
              {(viewMode === "MONTHLY" || viewMode === "QUARTERLY") ? `${label} ${selectedYear}` : label}
            </span>
          </div>
          <div className="space-y-2">
            {sortedPayload.map((entry: ChartTooltipEntry<GroupChartPoint>, index: number) => {
              const color = String(entry.payload?.[`${entry.name}_color`] ?? "");
              const percent = Number(entry.payload?.[`${entry.name}_percent`] ?? 0);
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-muted-foreground truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono font-bold text-foreground">
                      {formatCurrencyFull(entry.value ?? 0)}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 bg-primary/5 text-primary border-primary/20">
                      {percent.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading && !data) {
    return <EvolutionCardSkeleton />;
  }

  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-500">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-8 space-y-4 md:space-y-0 relative z-20">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            {title}
            <InfoTooltip text={help} />
          </CardTitle>
          <CardDescription className="text-base">
            {description(periodo)}
          </CardDescription>
        </div>

        {/* Panel de controles */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Vista: anual, trimestral o mensual */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            className="w-auto"
          >
            <TabsList className="bg-muted/30 backdrop-blur-sm border border-white/5 h-10 p-1">
              <TabsTrigger value="ANNUAL" className="text-[10px] h-8 font-bold uppercase tracking-wider">Anual</TabsTrigger>
              <TabsTrigger value="QUARTERLY" className="text-[10px] h-8 font-bold uppercase tracking-wider">Trimestral</TabsTrigger>
              <TabsTrigger value="MONTHLY" className="text-[10px] h-8 font-bold uppercase tracking-wider">Mensual</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Conmutador OV/FAC */}
          <RecordTypeToggle
            value={recordType as RecordTypeValue}
            onValueChange={setRecordType}
          />

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Selector de series */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger render={
              <Button variant="outline" className="bg-background/40 border-white/10 hover:bg-background/60 h-10 gap-2 font-medium min-w-[250px] justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{selectedGroupIds.length === 0 ? textos.seleccionar : textos.seleccionados(selectedGroupIds.length)}</span>
                </div>
                <Plus className="h-3 w-3 opacity-50 shrink-0" />
              </Button>
            } />
            <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
              <Command>
                <CommandInput placeholder={textos.buscar} className="h-11" />
                <CommandList>
                  <CommandEmpty>{textos.sinResultados}</CommandEmpty>
                  <CommandGroup heading={textos.disponibles}>
                    {data?.rows.map((row) => {
                      const isSelected = selectedGroupIds.includes(row.groupId);
                      return (
                        <CommandItem
                          key={row.groupId}
                          onSelect={() => {
                            setSelectedGroupIds(prev => isSelected ? prev.filter(id => id !== row.groupId) : [...prev, row.groupId]);
                          }}
                          className="flex items-center gap-2 py-3"
                        >
                          <div className={cn("flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all", isSelected ? "bg-primary text-primary-foreground" : "opacity-50")}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="flex-1 font-medium">{row.groupName}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>

      <CardContent className="p-8">

        {/* Selector de año: solo en las vistas mensual y trimestral */}
        <AnimatePresence>
          {(viewMode === "MONTHLY" || viewMode === "QUARTERLY") && (
            <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="flex flex-wrap gap-2 mb-6 p-1 bg-muted/20 border border-white/5 rounded-2xl w-fit"
            >
              {data?.years.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={cn(
                    "px-5 py-2 text-xs font-bold rounded-xl transition-all",
                    selectedYear === year
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {year}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          {/* Etiquetas de las series elegidas */}
          <AnimatePresence>
            {selectedGroupIds.length > 0 && (
              <motion.div className="flex flex-wrap gap-2 mb-8">
                {selectedGroupDetails.map(group => (
                  <Badge
                    key={group.groupId}
                    className="bg-white/5 border-white/10 text-foreground py-1 px-3 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.groupName}
                    <button onClick={() => setSelectedGroupIds(prev => prev.filter(id => id !== group.groupId))}>
                      <X className="h-3 w-3 ml-1" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Gráfico */}
          <div className="h-[450px] w-full relative">
            {selectedGroupIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza tu Crecimiento</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  {textos.vacio}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey={viewMode === "ANNUAL" ? "year" : viewMode === "QUARTERLY" ? "quarter" : "month"}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }}
                    tickFormatter={formatCurrencyCompact}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(147, 197, 253, 0.15)" }} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 30, fontWeight: 600, textTransform: 'uppercase' }}
                  />
                  {selectedGroupDetails.map((group, idx) => (
                    <Bar
                      key={group.groupId}
                      dataKey={group.groupName}
                      stackId="a"
                      fill={group.color || "#8884d8"}
                      radius={idx === selectedGroupDetails.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={viewMode === "MONTHLY" ? 40 : 60}
                      animationDuration={1500}
                    >
                      {idx === selectedGroupDetails.length - 1 && (
                        <LabelList
                          dataKey={(entry) => selectedGroupDetails.reduce((sum, g) => sum + (entry[g.groupName] || 0), 0)}
                          position="top"
                          offset={10}
                          formatter={formatCurrencyCompact}
                          style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Convertir la tarjeta de grupos en una envoltura**

Reescribir `src/components/charts/premium/group-evolution-card.tsx` entero (Write, y convertirlo a CRLF). El nombre exportado y las props son los de siempre:

```tsx
"use client";

import { EvolutionCard, type EvolutionCardTextos } from "@/components/charts/premium/evolution-card";
import { getGroupingAnalysisData } from "@/actions/grouping-actions";
import { CHART_HELP } from "@/lib/chart-help";
import type { RecordType } from "@/types/database";

interface GroupEvolutionCardProps {
  recordType: RecordType;
}

// Fuera del componente: son constantes, y así no se crean objetos nuevos en cada render.
const TEXTOS: EvolutionCardTextos = {
  seleccionar: "Seleccionar Grupos...",
  seleccionados: (n) => `${n} Grupos Seleccionados`,
  buscar: "Buscar grupos...",
  sinResultados: "No se encontraron grupos.",
  disponibles: "Grupos Disponibles",
  vacio: "Selecciona al menos un grupo de análisis en el panel superior.",
};

const descripcion = (periodo: string) =>
  `Tendencia ${periodo} y desglose porcentual de tus agrupaciones estratégicas.`;

/**
 * Evolución de las agrupaciones personalizadas. La tarjeta en sí es EvolutionCard, que
 * comparte con la de macro-categorías; aquí solo van los textos y la lectura. La usan la
 * página de Análisis y el widget «Evolución por grupo» del dashboard.
 */
export function GroupEvolutionCard({ recordType }: GroupEvolutionCardProps) {
  return (
    <EvolutionCard
      recordType={recordType}
      title="Evolución Histórica por Grupo"
      description={descripcion}
      help={CHART_HELP.grupoEvolucion}
      fetcher={getGroupingAnalysisData}
      // Los grupos pueden ser muchos: al abrir, solo los tres primeros.
      seleccionInicial="primeras3"
      textos={TEXTOS}
    />
  );
}
```

- [ ] **Step 9: Tipos, lint y tests unitarios**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**. El warning `react-hooks/exhaustive-deps` que estaba en `group-evolution-card.tsx:122` ahora sale en `evolution-card.tsx` (línea del `}, [recordType, refreshKey]);`), y `group-evolution-card.tsx` ya no tiene ninguno. Si salen 11 o más, el aviso nuevo está en `evolution-card.tsx`: comparar `fetchData` y sus `useEffect` con los del Step 7 y dejarlos idénticos; no se desactiva ninguna regla.

Run: `npx vitest run`
Expected: **426 passed, 1 skipped** (423 + 3).

- [ ] **Step 10: Ejecutar el E2E después del cambio**

Esperar al menos 60 s desde la ejecución del Step 6 y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/evolucion-macro.spec.ts`
Expected: PASS (1 test), igual que antes del cambio.

- [ ] **Step 11: Commit**

```bash
git add src/lib/evolution-card.ts src/lib/__tests__/evolution-card.test.ts src/components/charts/premium/evolution-card.tsx src/components/charts/premium/group-evolution-card.tsx e2e/specs/evolucion-macro.spec.ts
git commit -m "refactor(analisis): tarjeta de evolucion generica compartida"
```

---

## Task 4: Tarjeta «Evolución Histórica por Macro-categoría»

**Files:**
- Modify: `e2e/specs/evolucion-macro.spec.ts`
- Modify: `src/lib/chart-help.ts`
- Create: `src/components/charts/premium/macro-evolution-card.tsx`
- Modify: `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Escribir los E2E que fallan**

En `e2e/specs/evolucion-macro.spec.ts`, con Edit, cambiar:

```ts
const TITULO_GRUPOS = "Evolución Histórica por Grupo";
```

por:

```ts
const TITULO_GRUPOS = "Evolución Histórica por Grupo";
const TITULO_MACRO = "Evolución Histórica por Macro-categoría";

// Nombres de las series: los de BUCKET_LABELS (src/lib/customer-item.ts), en su orden.
const MACROS = ["Mano de obra", "Consumibles y repuestos", "Equipos", "Operaciones"] as const;
```

Y añadir al final del fichero:

```ts

test("la tarjeta de macro-categorías aparece debajo de la de grupos con las cuatro series", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Orden en el documento: primero la de grupos, justo después la de macro-categorías.
  // Ninguna otra tarjeta de la pestaña contiene «Evolución Histórica por».
  const tarjetas = page.locator('[data-slot="card"]').filter({ hasText: "Evolución Histórica por" });
  await expect(tarjetas).toHaveCount(2);
  await expect(tarjetas.nth(0)).toContainText(TITULO_GRUPOS);
  await expect(tarjetas.nth(1)).toContainText(TITULO_MACRO);

  const card = tarjeta(page, TITULO_MACRO);
  await expect(
    card.getByText("Tendencia anual y desglose porcentual de tus macro-categorías.")
  ).toBeVisible();

  // Abre con las cuatro seleccionadas, tengan ventas o no (Operaciones no tiene en la
  // semilla). .first(): el nombre sale en la etiqueta y en la leyenda del gráfico.
  await expect(card.getByRole("button", { name: "4 Macro-categorías seleccionadas" })).toBeVisible();
  for (const nombre of MACROS) {
    await expect(card.getByText(nombre, { exact: true }).first()).toBeVisible();
  }
  await esperarBarras(card);
});

test("la tarjeta de macro-categorías cambia de vista, de tipo y de series sin errores", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const card = tarjeta(page, TITULO_MACRO);
  await expect(card).toBeVisible();
  await esperarBarras(card);

  // Vistas. El selector de año solo existe en trimestral y mensual.
  const anio = card.getByRole("button", { name: ANIO, exact: true });
  await expect(anio).toHaveCount(0);
  for (const vista of ["Trimestral", "Mensual"]) {
    await card.getByRole("tab", { name: vista, exact: true }).click();
    await expect(anio).toBeVisible();
    await expect(
      card.getByText(`Tendencia ${vista.toLowerCase()} y desglose porcentual de tus macro-categorías.`)
    ).toBeVisible();
    await esperarBarras(card);
  }
  await card.getByRole("tab", { name: "Anual", exact: true }).click();
  await expect(anio).toHaveCount(0);
  await esperarBarras(card);

  // Tipo. La tarjeta arranca en FAC, como el periodo global, y tiene su propio conmutador.
  const ov = card.getByRole("tab", { name: /\bOV\b/ });
  const fac = card.getByRole("tab", { name: /\bFAC\b/ });
  await expect(fac).toHaveAttribute("aria-selected", "true");
  await ov.click();
  await expect(ov).toHaveAttribute("aria-selected", "true");
  await esperarBarras(card);
  await fac.click();
  await expect(fac).toHaveAttribute("aria-selected", "true");
  await esperarBarras(card);

  // Quitar una macro-categoría y volver a añadirla. El desplegable se pinta fuera de la
  // tarjeta.
  await card.getByRole("button", { name: "4 Macro-categorías seleccionadas" }).click();
  await page.getByRole("option", { name: "Mano de obra", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "3 Macro-categorías seleccionadas" })).toBeVisible();
  // Sin etiqueta y sin serie en la leyenda.
  await expect(card.getByText("Mano de obra", { exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "3 Macro-categorías seleccionadas" }).click();
  await page.getByRole("option", { name: "Mano de obra", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "4 Macro-categorías seleccionadas" })).toBeVisible();
  await expect(card.getByText("Mano de obra", { exact: true }).first()).toBeVisible();
  await esperarBarras(card);

  expect(crashes, `Excepciones en la tarjeta de macro-categorías:\n${crashes.join("\n")}`).toEqual([]);
});
```

- [ ] **Step 2: Ejecutar los E2E y verlos fallar**

Esperar al menos 60 s desde la última ejecución de Playwright y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/evolucion-macro.spec.ts`
Expected: 1 passed (la tarjeta de grupos) y **2 failed**: el primero en `toHaveCount(2)` (solo hay una tarjeta «Evolución Histórica por»), el segundo en `expect(card).toBeVisible()` (la tarjeta de macro-categorías no existe).

- [ ] **Step 3: Texto de ayuda**

En `src/lib/chart-help.ts`, con Edit, cambiar:

```ts
  grupoEvolucion: "Evolución del importe de tus agrupaciones personalizadas a lo largo del tiempo.",
```

por:

```ts
  grupoEvolucion: "Evolución del importe de tus agrupaciones personalizadas a lo largo del tiempo.",
  macroEvolucion: "Evolución del importe de las 4 macro-categorías (Mano de obra, Consumibles y repuestos, Equipos, Operaciones) a lo largo del tiempo, según la clasificación de Configuración: lo que no está marcado cuenta como Equipos.",
```

- [ ] **Step 4: Crear la envoltura de macro-categorías**

Crear `src/components/charts/premium/macro-evolution-card.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  EvolutionCard,
  EvolutionCardSkeleton,
  type EvolutionCardTextos,
} from "@/components/charts/premium/evolution-card";
import { getMacroCategorias } from "@/actions/category-actions";
import { getMacroEvolutionData } from "@/actions/grouping-actions";
import { CHART_HELP } from "@/lib/chart-help";
import { MACRO_CATEGORIAS_KEY } from "@/lib/customer-item";
import type { RecordType } from "@/types/database";

interface MacroEvolutionCardProps {
  recordType: RecordType;
}

// Fuera del componente: son constantes, y así no se crean objetos nuevos en cada render.
const TEXTOS: EvolutionCardTextos = {
  seleccionar: "Seleccionar macro-categorías...",
  seleccionados: (n) => `${n} Macro-categorías seleccionadas`,
  buscar: "Buscar macro-categorías...",
  sinResultados: "No se encontraron macro-categorías.",
  disponibles: "Macro-categorías disponibles",
  vacio: "Selecciona al menos una macro-categoría en el panel superior.",
};

const descripcion = (periodo: string) =>
  `Tendencia ${periodo} y desglose porcentual de tus macro-categorías.`;

/**
 * Evolución de las ventas por macro-categoría. La tarjeta en sí es EvolutionCard, que
 * comparte con la de grupos; aquí van los textos, la lectura y el refresco.
 */
export function MacroEvolutionCard({ recordType }: MacroEvolutionCardProps) {
  // El reparto lo hace el servidor, así que de esta consulta no se usan los datos: se usa
  // su fecha. EvolutionCard carga con un efecto, no con react-query, y por sí sola no se
  // enteraría de que la clasificación ha cambiado. Al guardar en Configuración se
  // invalida ["categories"]; por prefijo se vuelve a pedir esta clave, cambia
  // dataUpdatedAt y, como va de refreshKey, la tarjeta vuelve a pedir el reparto.
  const { data: macro, dataUpdatedAt } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });

  // Hasta que llega la clasificación no se monta la tarjeta: si se montara ya, pediría
  // el reparto dos veces, una al montarse y otra al cambiar la fecha.
  if (macro === undefined) return <EvolutionCardSkeleton />;

  return (
    <EvolutionCard
      recordType={recordType}
      title="Evolución Histórica por Macro-categoría"
      description={descripcion}
      help={CHART_HELP.macroEvolucion}
      fetcher={getMacroEvolutionData}
      // Son siempre cuatro: al abrir, todas.
      seleccionInicial="todas"
      textos={TEXTOS}
      refreshKey={dataUpdatedAt}
    />
  );
}
```

- [ ] **Step 5: Montarla en Análisis → Exploración**

En `src/app/(dashboard)/analytics/page.tsx`, con Edit.

Cambio 1, la carga diferida. Cambiar:

```tsx
const GroupEvolutionCard = dynamic(
  () => import("@/components/charts/premium/group-evolution-card").then((m) => m.GroupEvolutionCard),
  { ssr: false, loading: chartSkeleton }
);
```

por:

```tsx
const GroupEvolutionCard = dynamic(
  () => import("@/components/charts/premium/group-evolution-card").then((m) => m.GroupEvolutionCard),
  { ssr: false, loading: chartSkeleton }
);
const MacroEvolutionCard = dynamic(
  () => import("@/components/charts/premium/macro-evolution-card").then((m) => m.MacroEvolutionCard),
  { ssr: false, loading: chartSkeleton }
);
```

Cambio 2, el montaje. Cambiar:

```tsx
              <GroupEvolutionCard recordType={recordType} />
```

por:

```tsx
              <GroupEvolutionCard recordType={recordType} />
              <MacroEvolutionCard recordType={recordType} />
```

- [ ] **Step 6: Tipos, lint y tests unitarios**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**, los mismos que al terminar la Task 3.

Run: `npx vitest run`
Expected: **426 passed, 1 skipped**.

- [ ] **Step 7: Ejecutar los E2E y verlos pasar**

Esperar al menos 60 s desde la ejecución del Step 2 y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/evolucion-macro.spec.ts`
Expected: **3 passed**.

- [ ] **Step 8: Commit**

```bash
git add e2e/specs/evolucion-macro.spec.ts src/lib/chart-help.ts src/components/charts/premium/macro-evolution-card.tsx "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(analisis): evolucion historica por macro-categoria"
```

---

## Task 5: Verificación final

Esta tarea no crea commit si todo pasa. Si alguna comprobación obliga a cambiar código, el arreglo va en un commit nuevo (`fix(analisis): ...`), nunca con `--amend`.

**Files:** ninguno.

- [ ] **Step 1: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**. Son los de la línea base, con uno cambiado de fichero: el de `group-evolution-card.tsx` ahora está en `evolution-card.tsx`. Un warning más significa que algún fichero de este plan lo introdujo: se corrige.

- [ ] **Step 3: Tests unitarios**

Run: `npx vitest run`
Expected: **426 passed, 1 skipped** (411 de la línea base + 15 nuevos: 2 en `customer-item.test.ts`, 10 en `macro-evolution.test.ts` y 3 en `evolution-card.test.ts`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: termina sin errores.

- [ ] **Step 5: Finales de línea**

Run:

```bash
node -e "const fs=require('fs');for(const f of process.argv.slice(1)){const s=fs.readFileSync(f,'utf8');const lf=(s.match(/\n/g)||[]).length;const crlf=(s.match(/\r\n/g)||[]).length;console.log(lf===crlf?'CRLF ':'MIXTO',f)}" src/lib/customer-item.ts src/lib/__tests__/customer-item.test.ts src/components/charts/comercial/bucket-mix-card.tsx src/components/charts/comercial/bucket-by-client-card.tsx src/components/charts/comercial/season-by-bucket-card.tsx src/components/customers/customer-bucket-mix-card.tsx src/components/charts/dashboard/category-mix-donut.tsx src/lib/macro-evolution.ts src/lib/__tests__/macro-evolution.test.ts src/actions/grouping-actions.ts src/lib/evolution-card.ts src/lib/__tests__/evolution-card.test.ts src/components/charts/premium/evolution-card.tsx src/components/charts/premium/group-evolution-card.tsx src/components/charts/premium/macro-evolution-card.tsx src/lib/chart-help.ts "src/app/(dashboard)/analytics/page.tsx" e2e/specs/evolucion-macro.spec.ts
```

Expected: todas las líneas empiezan por `CRLF`. Si alguna dice `MIXTO`, se convierte con el script de «Contexto para quien ejecuta» y se sube en un commit `fix`.

Run: `git status --short`
Expected: limpio. Y `git diff d7ac719 --stat -- src/lib/widget-registry.tsx` no muestra cambios.

- [ ] **Step 6: E2E completo**

Si Docker no responde a `docker info`: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar. Comprobar que el puerto 3100 está libre (`netstat -ano | grep ":3100"`) y que han pasado al menos 60 s desde la última ejecución de Playwright.

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run test:e2e`
Expected: **75 passing** (72 de la línea base + 3 de `evolucion-macro.spec.ts`). Un timeout aislado en un spec ajeno a esta funcionalidad es ambiental (máquina lenta, unos 5 s por página): repetir solo ese spec, dejando 60 s, antes de darlo por roto.

- [ ] **Step 7: Revisión manual rápida**

Con `npm run dev` y un usuario administrador:
- En Análisis → Exploración, «Evolución Histórica por Macro-categoría» está justo debajo de «Evolución Histórica por Grupo», con las cuatro macro-categorías elegidas y los mismos colores que «Mix por macro-categoría» de la pestaña Comercial.
- Anual, Trimestral y Mensual, OV y FAC, y quitar y añadir series funcionan en las dos tarjetas.
- **Refresco:** en Configuración, mover una categoría con ventas a otra macro-categoría y guardar; volver a Análisis por el menú lateral, sin recargar la página: el reparto ya es el nuevo. Deshacer el cambio al terminar.
- En el dashboard, el widget «Evolución por grupo» se ve y se comporta como antes. No hay widget de macro-categorías (fuera de alcance).

- [ ] **Step 8: Despliegue**

Solo código: no hay migración. Se despliega con el flujo habitual tras fusionar la rama.

---

## Autorrevisión contra la spec

| Spec | Dónde queda |
|---|---|
| §2 Ubicación: debajo del gráfico de grupos, sin widget | Task 4, Step 5; `widget-registry.tsx` no se toca. |
| §2 Series: las cuatro, todas elegidas al abrir | `buildMacroEvolution` (Task 2) y `seleccionInicial="todas"` (Task 4). |
| §2 Clasificación: la de Configuración, sin marcar = Equipos, inactivas cuentan | `bucketsPorCategoriaId` y la consulta sin filtro `is_active` de `getMacroEvolutionData` (Task 2). |
| §2 Ventas incluidas: las mismas que el gráfico de grupos | `loadSalesRecordsByType`, compartido (Task 2). |
| §2 Colores: `BUCKET_COLORS` | Task 1. |
| §3 Lógica pura y sus seis casos de test | Task 2, Steps 1-4. |
| §4 Servidor: autorización, mismo origen, helper común | Task 2, Steps 5-6. |
| §5 `EvolutionCard`, `GroupEvolutionCard`, `MacroEvolutionCard`, montaje y ayuda | Tasks 3 y 4. |
| §5 Refresco al invalidar la clasificación | `refreshKey` (Task 3) y `dataUpdatedAt` (Task 4); decisión 1. |
| §6 E2E: posición, vistas, OV/FAC, quitar y añadir, grupos | `e2e/specs/evolucion-macro.spec.ts` (Tasks 3 y 4). |
| §7 Sin migración | Task 5, Step 8. |

Nombres usados en todas las tareas: `BUCKET_COLORS`, `MacroEvolutionRecord`, `bucketsPorCategoriaId`, `buildMacroEvolution`, `loadSalesRecordsByType`, `getMacroEvolutionData`, `SeleccionInicial`, `seleccionInicialIds`, `EvolutionCardTextos`, `EvolutionCardProps`, `EvolutionCard`, `EvolutionCardSkeleton`, `GroupEvolutionCard`, `MacroEvolutionCard`, `CHART_HELP.macroEvolucion`.
