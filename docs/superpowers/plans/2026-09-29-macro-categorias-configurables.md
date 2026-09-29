# Macro-categorías configurables — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar desde Configuración qué categorías forman cada macro-categoría (**Mano de obra**, **Consumos y repuestos**, **Equipos** y **Operaciones**), en lugar de deducirlo del nombre de la categoría en `bucketForCategory`. Lo que no esté marcado cuenta como Equipos, igual que hoy.

**Architecture:** Columna nueva `categories.macro_categoria` (migración manual `0013`), independiente de `tech_service_bucket`. `getMacroCategorias()` la lee con la clave de react-query `["categories", "macro-categorias"]`; `mapaMacroCategorias()` la convierte en un `Map<string, Bucket>` por nombre de categoría; `bucketForCategory(nombre, mapa)` y todas las funciones puras que la usan reciben ese mapa como parámetro. Cada componente consumidor carga la clasificación y muestra su esqueleto mientras no ha llegado. La tarjeta «Macro-categorías» de Configuración reutiliza la lógica de selección de «Categorías de Servicio Técnico», generalizada de dos grupos a N.

**Tech Stack:** Next.js (App Router, server actions), React, TanStack Query, Drizzle ORM + PostgreSQL, Zod 4, componentes base-ui (no Radix: `render={}` en lugar de `asChild`), cmdk, recharts, vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-macro-categorias-configurables-design.md`

---

## Contexto para quien ejecuta

Convenciones obligatorias en todas las tareas:

- **Idioma.** El plan está en español. Los comentarios del código van en español y explican el porqué, no el qué.
- **Commits.** Conventional commits en español **sin tildes ni eñes** (`categorias`, no `categorías`). **Sin** `Co-Authored-By` ni ninguna atribución a IA. **Un commit por tarea.** Nunca se reescribe historia: nada de `git commit --amend`, `rebase` ni `reset`. Si algo sale mal tras un commit, se arregla con un commit nuevo.
- **Finales de línea.** El repo guarda LF; la copia de trabajo está en CRLF por `core.autocrlf=true`. **Nunca `sed -i`.** Para modificar ficheros existentes se usa la herramienta Edit (conserva el CRLF) o un script de node que lo conserve. Los ficheros escritos enteros con Write (nuevos o reescritos) quedan en LF: conviértelos a CRLF justo después con

  ```bash
  node -e "const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))" RUTA_DEL_FICHERO
  ```

- **Migraciones.** SQL manual en `drizzle/`. La nueva es la `0013` (la `0009` está reservada). Idempotente, y sus `UPDATE` solo tocan filas con `macro_categoria IS NULL`. **No se toca** `drizzle/meta/_journal.json`.
- **Permisos.** Las lecturas usan `requireApproved()`; las escrituras, `requireRole(...ROLES_EDITAN_METAS)` (Admin y Editor). Todo se filtra por `company_id`.
- **Datos de E2E.** Solo datos inventados: el repositorio es público. Los tests E2E que cambian datos los restauran al terminar, aunque fallen a medias (`try/finally`).
- **UI.** Los componentes de `@/components/ui` son base-ui, no Radix.
- **Comandos E2E** (Windows, Git Bash):
  - Si Docker no está arrancado: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar a que `docker info` responda.
  - `E2E_PG_PORT=55433 npm run e2e:db:up`
  - Suite completa: `E2E_PG_PORT=55433 npm run test:e2e` (reinicia la BD y lanza Playwright).
  - Un solo spec: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/NOMBRE.spec.ts`
  - El puerto **3100 tiene que estar libre**: si hay un servidor vivo, Playwright lo reutiliza (`reuseExistingServer`) y probaría un build viejo. Comprobar con `netstat -ano | grep ":3100"`.
  - Deja **al menos 60 s entre dos ejecuciones de Playwright**: el proyecto `setup` hace logins y el login admite 5 intentos por minuto.
  - La máquina local es lenta (unos 5 s por página). Un timeout aislado por lentitud es ambiental: se repite el spec pasado el minuto antes de tocar código.

## Contexto verificado (2026-09-29, rama `feat/macro-categorias-configurables`, commit `a617f31`)

- `src/lib/customer-item.ts`: `type Bucket` (línea 4), `BUCKET_LABELS` (6-11, con «Mano de Obra / Cal», «C&R», «Equipos», «Operación»), `bucketForCategory(categoria)` (19-28) con las reglas de nombre. Dentro del mismo fichero la usan `groupByCustomer` (54), `customerItemToCsv` (84) y `customerItemToExcel` (104). Las cabeceras de exportación están escritas a mano: CSV en la línea 79 y Excel en 129-132 («Mano de Obra/Cal», «C&R», «Equipos», «Operación»).
- Test: `src/lib/__tests__/customer-item.test.ts` (6 tests). Comprueba las cabeceras exactas del CSV (`lines[0]`) y del Excel.
- Otros usos de `bucketForCategory` en `src/`:
  - `src/lib/analytics-comercial.ts`: `buildBucketMixByYear` (29), `buildBucketByClient` (106) y `buildBucketSeason` (185). Tests en `src/lib/__tests__/analytics-comercial.test.ts` (líneas 16-32, 91-103 y 149-162).
  - `src/lib/customer-detail.ts`: `customerBuckets` (47). Test en `customer-detail.test.ts:75-79`.
  - `src/lib/dashboard-insights.ts`: `bucketMix` (33-52), que además usa `BUCKET_LABELS` y un `order` local. Test en `dashboard-insights.test.ts:29-38`.
  - `src/app/(dashboard)/cliente-articulo/page.tsx:178`, por fila, y las cabeceras de la tabla en 153-156.
- Componentes que llaman a esas funciones. Todos cargan sus propios datos con `useQuery`, así que **sus padres no cambian**:
  - `src/components/charts/comercial/bucket-mix-card.tsx` (`getSalesData`, `SERIES` local en 18-23);
  - `src/components/charts/comercial/bucket-by-client-card.tsx` (`getCustomerItemSales`, `SERIES` en 19-24);
  - `src/components/charts/comercial/season-by-bucket-card.tsx` (`getCategoryMonthSales`, `SERIES` en 17-22);
  - `src/components/customers/customer-bucket-mix-card.tsx` (`getCustomerItemSales`, `SERIES` en 13-18);
  - `src/components/charts/dashboard/category-mix-donut.tsx`, que recibe `records` y `catMap` (id → nombre) desde `src/lib/widget-registry.tsx:142`, que a su vez los saca de `dashboard-data-provider.tsx:51`. No tiene estado de carga propio.
  - Los montan `analytics/page.tsx` (377-389), `widget-registry.tsx` (229, 244, 249) y `clientes/[customer]/page.tsx:57`, sin pasar nada de clasificación.
- De dónde sale el nombre de la categoría:
  - `getCustomerItemSales` y `getCategoryMonthSales` leen del hub `books.items.category_name` **tal cual**, exista o no en la tabla `categories` de la app.
  - `getSalesData` (`src/actions/sales-actions.ts:50-53`) casa el nombre del hub con `categories.name` **sin distinguir mayúsculas** (`toLowerCase()`) y **descarta** las ventas cuya categoría no existe en la app. Así que el cambio de comportamiento de la spec (§3) no afecta a `bucket-mix-card`, que ya ignoraba esas ventas; sí afecta a Cliente × Artículo, a la tarjeta por cliente, a la de temporada y a la del detalle de cliente.
- Patrón de #31 que se replica:
  - `src/lib/tech-service-selection.ts` (64 líneas; `SeleccionServicioTecnico {st, cr}`, `seleccionInicial`, `grupoDe`, `alternarCategoria`, `haCambiado`). Su test tiene **12 tests** que deben seguir en verde sin tocarlos.
  - `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`: `GrupoCategorias` (Popover + Command, `ul aria-label={titulo}`, botón `Quitar {nombre} de {CORTO}`), remontado con `key={dataUpdatedAt}`, botón «Guardar categorías», toast «Clasificación guardada», invalida `["categories"]`.
  - `getTechServiceCategories` y `saveTechServiceBuckets` en `src/actions/category-actions.ts:42-55` y `127-155`.
  - `techServiceBucketsSchema` en `src/lib/validation.ts:127-137`, con `idsDeCategoria` reutilizable (UUID, máximo 1000, sin repetidos).
  - `TECH_SERVICE_CATEGORIES_KEY = ["categories", "servicio-tecnico"]` en `src/lib/tech-service.ts:16`. El widget del dashboard espera la clasificación con `isPending` antes de pintar.
  - `drizzle/0011_tech_service_bucket.sql`: cabecera sin tildes, `ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`, `--> statement-breakpoint`, sangría con tabuladores.
  - `TechServiceBucket` vive en `src/types/database.ts:48` y `tech-service.ts` lo reexporta. `Category` (51-62) incluye `tech_service_bucket`.
  - `categories` en `src/db/schema.ts:113-133`, con `check()` de Drizzle.
- E2E:
  - `e2e/db/apply-migrations.mjs` aplica **todos** los `.sql` de `drizzle/` en orden, así que recoge la `0013` sin cambios.
  - `e2e/db/seed-app.mjs:22-26,78-85` siembra «Aguas», «Aire» y «Suelos» con `tech_service_bucket`. Ninguno casa con las reglas antiguas, así que hoy todas sus ventas son Equipos.
  - `e2e/constants.ts:25` tiene `TECH_SERVICE_SEED`.
  - `e2e/specs/tech-service-categories.spec.ts` localiza su tarjeta con `hasText: "Categorías de Servicio Técnico"`. La tarjeta nueva **no puede contener ese texto**: la búsqueda es por subcadena y daría dos tarjetas.
  - Los únicos E2E que nombran las macro-categorías son `e2e/specs/charts.spec.ts:68-86`. Busca la tarjeta por título y cuenta barras, así que sigue valiendo, pero su comentario de las líneas 79-80 («todas caen en Equipos») deja de ser cierto.
  - `e2e/specs/export.spec.ts` exporta desde `/tablas`, no desde Cliente × Artículo. **Ningún E2E comprueba las cabeceras** de la exportación de Cliente × Artículo.
- `src/lib/chart-help.ts:14` (`mixCategoria`) nombra las macro-categorías con los nombres viejos.
- No existe `src/hooks/`: los componentes llaman a `useQuery` directamente, como hace `tech-service-widget.tsx`.
- Zod `^4.3.6`, lucide-react `^0.577.0`.

## Decisiones del plan que la spec no fijaba

1. **Clave del mapa en minúsculas.** `mapaMacroCategorias` indexa por `name.toLowerCase()` y `bucketForCategory` busca igual. Es la regla con la que `getSalesData` ya casa los nombres del hub con los de la app. Así, un gráfico no clasifica distinto que otro por una diferencia de mayúsculas.
2. **`Bucket` se mueve a `src/types/database.ts`,** porque también tipa la columna y `MacroCategoria`. `customer-item.ts` lo reexporta: los consumidores siguen importándolo de donde siempre. Es el mismo patrón que `TechServiceBucket`.
3. **`BUCKETS`,** en `customer-item.ts: ["mano_obra", "cr", "equipos", "operacion"]`, es el orden único de columnas, series, leyendas y grupos de la tarjeta. Sustituye al `order` local de `dashboard-insights.ts`.
4. **Estado de carga.** Cada consumidor muestra su esqueleto mientras `macro === undefined`. Por eso usa `data === undefined` y no `isPending`: si la consulta fallase, el esqueleto se queda en lugar de pintar un reparto con el mapa vacío, que pondría todo en Equipos.
5. **Selección de N grupos.** La lógica genérica va a `src/lib/seleccion-grupos.ts` (`Seleccion<G>`, `seleccionPorGrupo`, `grupoDe`, `alternarCategoria`, `haCambiado`). `tech-service-selection.ts` pasa a ser una capa fina encima con los mismos nombres y firmas, así que su test no se toca.
6. **Componente `GrupoCategorias` compartido.** Se extrae a `settings/_components/grupo-categorias.tsx` y lo usan las dos tarjetas. Los nombres accesibles de la tarjeta de Servicio Técnico no cambian, y su E2E lo comprueba.
7. **Textos de la tarjeta nueva:**
   - título «Macro-categorías»;
   - grupos con los nombres de `BUCKET_LABELS`;
   - desplegables `Elegir {nombre}`;
   - etiquetas con el botón `Quitar {categoría} de {nombre}`;
   - nota «en {nombre}» cuando la categoría está en otro grupo;
   - botón «Guardar macro-categorías»;
   - toast «Macro-categorías guardadas».
8. **Consulta previa al despliegue ampliada.** La spec solo pide los prefijos «C&R » y «CAL ». Pero `ST …`, `ST`, `Alquileres`, `Operación de Redes` y `Consultoría` también dejan de clasificarse si no existen en la app, así que la consulta los incluye. Son dos consultas, una en cada base, para compararlas a mano.
9. **Reejecutar la 0013.** Su `UPDATE` solo toca filas nulas, pero «sin marcar» también es nulo. Si alguien quitó de su grupo una categoría cuyo nombre casa con una regla y luego se reejecuta la migración, esa categoría vuelve a marcarse. El comentario de la migración lo avisa: para sacarla de verdad, hay que marcarla como Equipos.

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `drizzle/0013_macro_categoria.sql` | Crear | Columna `macro_categoria`, su `CHECK` y la siembra con las reglas de nombre, re-ejecutable. |
| `src/db/schema.ts` | Modificar | `macro_categoria` y su `check` en `categories`. |
| `src/types/database.ts` | Modificar | `Bucket`, `Category.macro_categoria`, `MacroCategoria`. |
| `src/lib/validation.ts` | Modificar | `macroCategoriasSchema`. |
| `src/lib/__tests__/validation-macro-categorias.test.ts` | Crear | Tests del esquema. |
| `src/actions/category-actions.ts` | Modificar | `getMacroCategorias`, `saveMacroCategorias`. |
| `src/lib/seleccion-grupos.ts` | Crear | Selección de categorías en N grupos excluyentes. |
| `src/lib/__tests__/seleccion-grupos.test.ts` | Crear | Tests con los cuatro grupos de macro-categoría. |
| `src/lib/tech-service-selection.ts` | Modificar | Capa fina sobre `seleccion-grupos`, mismos nombres. |
| `src/lib/customer-item.ts` | Modificar | `BUCKETS`, `BUCKET_LABELS` nuevos, `MACRO_CATEGORIAS_KEY`, `mapaMacroCategorias`, `bucketForCategory(nombre, mapa)`, exportaciones con el mapa. |
| `src/lib/__tests__/customer-item.test.ts` | Modificar | Mapa, nombres, coherencia con la migración, firmas nuevas. |
| `src/lib/chart-help.ts` | Modificar | Texto de ayuda con los nombres nuevos. |
| `src/lib/analytics-comercial.ts` (+ test) | Modificar | Las tres funciones de macro-categoría reciben el mapa. |
| `src/lib/customer-detail.ts` (+ test) | Modificar | `customerBuckets` recibe el mapa. |
| `src/lib/dashboard-insights.ts` (+ test) | Modificar | `bucketMix` recibe el mapa y usa `BUCKETS`. |
| `src/components/charts/comercial/bucket-mix-card.tsx` | Modificar | Carga la clasificación, esqueleto, `BUCKET_LABELS`. |
| `src/components/charts/comercial/bucket-by-client-card.tsx` | Modificar | Ídem. |
| `src/components/charts/comercial/season-by-bucket-card.tsx` | Modificar | Ídem. |
| `src/components/customers/customer-bucket-mix-card.tsx` | Modificar | Ídem. |
| `src/components/charts/dashboard/category-mix-donut.tsx` | Modificar | Carga la clasificación y muestra un esqueleto. |
| `src/app/(dashboard)/cliente-articulo/page.tsx` | Modificar | Carga la clasificación, esqueleto, cabeceras y exportaciones con el mapa. |
| `src/app/(dashboard)/settings/_components/grupo-categorias.tsx` | Crear | Un grupo: desplegable con buscador y etiquetas. |
| `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx` | Modificar | Usa `GrupoCategorias` compartido. |
| `src/app/(dashboard)/settings/_components/macro-categories-form.tsx` | Crear | Tarjeta «Macro-categorías». |
| `src/app/(dashboard)/settings/page.tsx` | Modificar | Monta la tarjeta debajo de Servicio Técnico. |
| `e2e/db/seed-app.mjs` | Modificar | Siembra `macro_categoria`. |
| `e2e/constants.ts` | Modificar | `MACRO_SEED`. |
| `e2e/specs/macro-categorias.spec.ts` | Crear | Lector y admin; restaura al terminar. |
| `e2e/specs/charts.spec.ts` | Modificar | Comentario de la semilla. |

---

## Task 1: Columna `macro_categoria`, validación y acciones del servidor

**Files:**
- Create: `drizzle/0013_macro_categoria.sql`
- Modify: `src/db/schema.ts`
- Modify: `src/types/database.ts`
- Modify: `src/lib/customer-item.ts` (solo la cabecera: `Bucket` y `BUCKETS`)
- Modify: `src/lib/validation.ts`
- Modify: `src/actions/category-actions.ts`
- Test: `src/lib/__tests__/validation-macro-categorias.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/validation-macro-categorias.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { macroCategoriasSchema } from "@/lib/validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

const vacio = { mano_obra: [], cr: [], equipos: [], operacion: [] };

describe("macroCategoriasSchema", () => {
  it("acepta cuatro grupos disjuntos", () => {
    const r = macroCategoriasSchema.safeParse({ mano_obra: [A], cr: [B], equipos: [C], operacion: [D] });
    expect(r.success).toBe(true);
  });

  it("acepta grupos vacios: lo que no esta marcado cuenta como Equipos", () => {
    expect(macroCategoriasSchema.safeParse(vacio).success).toBe(true);
  });

  it("rechaza una categoria en dos grupos", () => {
    const r = macroCategoriasSchema.safeParse({ ...vacio, cr: [A], operacion: [A, B] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Una categoría no puede estar en dos macro-categorías a la vez");
  });

  it("rechaza duplicados dentro de un grupo", () => {
    const r = macroCategoriasSchema.safeParse({ ...vacio, equipos: [C, C] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Hay categorías repetidas en un grupo");
  });

  it("rechaza lo que no es UUID", () => {
    expect(macroCategoriasSchema.safeParse({ ...vacio, mano_obra: ["Aguas"] }).success).toBe(false);
  });

  it("rechaza que falte un grupo", () => {
    expect(macroCategoriasSchema.safeParse({ mano_obra: [A], cr: [], equipos: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/__tests__/validation-macro-categorias.test.ts`
Expected: FAIL. Los 6 tests fallan con `TypeError: Cannot read properties of undefined (reading 'safeParse')`, porque `macroCategoriasSchema` no existe.

- [ ] **Step 3: Migración**

Crear `drizzle/0013_macro_categoria.sql` (sangría con tabuladores, sin tildes en los comentarios; convertir a CRLF):

```sql
-- Macro-categoria de cada categoria: 'mano_obra', 'cr' (consumos y repuestos),
-- 'equipos' u 'operacion'. NULL cuenta como Equipos. Sustituye a las reglas de
-- nombre de bucketForCategory (src/lib/customer-item.ts). Es independiente de
-- tech_service_bucket (0011): las dos clasificaciones pueden no coincidir.
--
-- Cambio aditivo. Aplicar a mano en la BD del app (sales_tracker) ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0013_macro_categoria.sql
--
-- Los UPDATE copian las reglas de nombre de hoy y solo tocan filas con
-- macro_categoria IS NULL: volver a ejecutarla no pisa lo marcado desde
-- Configuracion. Ojo: "sin marcar" tambien es NULL. Una categoria que alguien
-- saco de su grupo y cuyo nombre casa con una regla SI se volveria a marcar.
-- Para sacarla de verdad, marcarla como Equipos en Configuracion.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS macro_categoria text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE categories ADD CONSTRAINT categories_macro_categoria_check
		CHECK (macro_categoria IS NULL OR macro_categoria IN ('mano_obra', 'cr', 'equipos', 'operacion'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'cr'
	WHERE macro_categoria IS NULL AND name LIKE 'C&R %';
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'mano_obra'
	WHERE macro_categoria IS NULL
		AND (name LIKE 'CAL %' OR name = 'ST' OR name LIKE 'ST %' OR name = 'Alquileres');
--> statement-breakpoint
UPDATE categories SET macro_categoria = 'operacion'
	WHERE macro_categoria IS NULL AND name IN ('Operación de Redes', 'Consultoría');
```

- [ ] **Step 4: Esquema de Drizzle**

En `src/db/schema.ts`, dentro de `categories`, sustituir

```ts
  tech_service_bucket: text("tech_service_bucket").$type<"st" | "cr">(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
```

por

```ts
  tech_service_bucket: text("tech_service_bucket").$type<"st" | "cr">(),
  // Macro-categoría: 'mano_obra', 'cr' (consumos y repuestos), 'equipos' u
  // 'operacion'. NULL cuenta como Equipos. Independiente de tech_service_bucket:
  // las dos clasificaciones pueden no coincidir. Migración 0013.
  macro_categoria: text("macro_categoria").$type<"mano_obra" | "cr" | "equipos" | "operacion">(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
```

y, en la lista de restricciones de la misma tabla, sustituir

```ts
  check(
    "categories_tech_service_bucket_check",
    sql`${t.tech_service_bucket} IS NULL OR ${t.tech_service_bucket} IN ('st', 'cr')`
  ),
]);
```

por

```ts
  check(
    "categories_tech_service_bucket_check",
    sql`${t.tech_service_bucket} IS NULL OR ${t.tech_service_bucket} IN ('st', 'cr')`
  ),
  check(
    "categories_macro_categoria_check",
    sql`${t.macro_categoria} IS NULL OR ${t.macro_categoria} IN ('mano_obra', 'cr', 'equipos', 'operacion')`
  ),
]);
```

- [ ] **Step 5: Tipos**

En `src/types/database.ts`, sustituir

```ts
/** Grupo de Servicio Técnico de una categoría: ST (mano de obra) o C&R (consumibles y repuestos). */
export type TechServiceBucket = "st" | "cr";
```

por

```ts
/** Grupo de Servicio Técnico de una categoría: ST (mano de obra) o C&R (consumibles y repuestos). */
export type TechServiceBucket = "st" | "cr";

/**
 * Macro-categoría de una categoría (columna macro_categoria, migración 0013): mano de
 * obra, consumos y repuestos, equipos u operaciones. Una categoría sin marcar cuenta
 * como Equipos.
 */
export type Bucket = "mano_obra" | "cr" | "equipos" | "operacion";
```

En la interfaz `Category`, sustituir

```ts
  tech_service_bucket: TechServiceBucket | null;
  created_at: string;
```

por

```ts
  tech_service_bucket: TechServiceBucket | null;
  macro_categoria: Bucket | null;
  created_at: string;
```

Y justo después de la interfaz `TechServiceCategory`, añadir

```ts

/**
 * Categoría tal como la necesitan la tarjeta «Macro-categorías» y los gráficos que
 * clasifican por macro-categoría: solo lo imprescindible, incluidas las inactivas.
 */
export interface MacroCategoria {
  id: string;
  name: string;
  is_active: boolean;
  macro_categoria: Bucket | null;
}
```

- [ ] **Step 6: `Bucket` y `BUCKETS` en `customer-item.ts`**

En `src/lib/customer-item.ts`, sustituir

```ts
import type { CustomerItemRow } from "@/types/database";
import type { ExcelSheet, ExcelRow } from "@/lib/excel-types";

export type Bucket = "mano_obra" | "cr" | "equipos" | "operacion";
```

por

```ts
import type { Bucket, CustomerItemRow } from "@/types/database";
import type { ExcelSheet, ExcelRow } from "@/lib/excel-types";

// Bucket vive en types/database porque también tipa la columna macro_categoria. Se
// reexporta aquí para que los consumidores lo sigan importando de donde siempre.
export type { Bucket } from "@/types/database";

/** Las cuatro macro-categorías, en el orden de columnas, series, leyendas y grupos. */
export const BUCKETS: readonly Bucket[] = ["mano_obra", "cr", "equipos", "operacion"];
```

- [ ] **Step 7: Esquema de validación**

Al final de `src/lib/validation.ts`, después de `techServiceBucketsSchema`, añadir

```ts

// Macro-categorías: ids de las categorías de cada una de las cuatro. Como en Servicio
// Técnico, una categoría no puede estar en dos: la columna guarda un solo valor, y el
// último UPDATE pisaría a los anteriores sin avisar. Las listas vacías valen: lo que no
// está en ninguna cuenta como Equipos.
export const macroCategoriasSchema = z
  .object({
    mano_obra: idsDeCategoria,
    cr: idsDeCategoria,
    equipos: idsDeCategoria,
    operacion: idsDeCategoria,
  })
  .refine(
    (v) => {
      const todos = [...v.mano_obra, ...v.cr, ...v.equipos, ...v.operacion];
      return new Set(todos).size === todos.length;
    },
    { message: "Una categoría no puede estar en dos macro-categorías a la vez", path: ["operacion"] }
  );
```

- [ ] **Step 8: Ejecutar el test y ver que pasa**

Run: `npx vitest run src/lib/__tests__/validation-macro-categorias.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Acciones del servidor**

En `src/actions/category-actions.ts`, sustituir el bloque de imports

```ts
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  techServiceBucketsSchema,
  uuidSchema,
} from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import type { TechServiceCategory } from "@/types/database";
```

por

```ts
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  macroCategoriasSchema,
  techServiceBucketsSchema,
  uuidSchema,
} from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import { BUCKETS } from "@/lib/customer-item";
import type { Bucket, MacroCategoria, TechServiceCategory } from "@/types/database";
```

Y al final del fichero añadir

```ts

/**
 * Categorías de la compañía con su macro-categoría, activas e inactivas. Las inactivas
 * hacen falta porque sus ventas de años anteriores siguen en los gráficos y deben caer
 * en la misma macro-categoría que cuando estaban activas.
 */
export async function getMacroCategorias(): Promise<MacroCategoria[]> {
  const { profile } = await requireApproved();
  return db
    .select({
      id: categories.id,
      name: categories.name,
      is_active: categories.is_active,
      macro_categoria: categories.macro_categoria,
    })
    .from(categories)
    .where(eq(categories.company_id, profile.company_id))
    .orderBy(asc(categories.sort_order), asc(categories.name));
}

/**
 * Guarda de una vez las cuatro macro-categorías. Admin y Editor, la misma regla que la
 * clasificación de Servicio Técnico. Primero se vacía la clasificación de toda la
 * compañía y después se marca cada grupo: así, una categoría que ya no se envía vuelve
 * a contar como Equipos. Todo va en una transacción, para que ningún gráfico vea la
 * compañía a medio clasificar. El filtro por company_id hace que un id de otra
 * compañía no toque nada.
 */
export async function saveMacroCategorias(grupos: Record<Bucket, string[]>): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole(...ROLES_EDITAN_METAS);
    const data = macroCategoriasSchema.parse(grupos);

    await db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({ macro_categoria: null })
        .where(eq(categories.company_id, profile.company_id));

      for (const bucket of BUCKETS) {
        const ids = data[bucket];
        if (ids.length === 0) continue;
        await tx
          .update(categories)
          .set({ macro_categoria: bucket })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, ids)));
      }
    });

    // Las pantallas leen con react-query y se refrescan al invalidar ["categories"] en
    // el cliente. Esto solo descarta lo que Next.js tuviera cacheado de esas rutas.
    revalidatePath("/settings");
    revalidatePath("/analytics");
    revalidatePath("/home");
    revalidatePath("/cliente-articulo");
  });
}
```

- [ ] **Step 10: Comprobar tipos y tests**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: **379 passed, 1 skipped**, es decir la línea base de 373 más los 6 tests nuevos.

- [ ] **Step 11: Comprobar que la migración se aplica y se puede reejecutar**

Con Docker Desktop arrancado:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset
```

Expected: en la salida aparece `migracion aplicada: 0013_macro_categoria.sql`, sin errores.

Después, se aplica dos veces más sobre la base ya migrada. Hay que lanzarlo desde la raíz del repo, porque el `import` relativo se resuelve contra el directorio actual:

```bash
E2E_PG_PORT=55433 node --input-type=module -e "import pg from 'pg'; import { readFileSync } from 'node:fs'; import { APP_URL } from './e2e/db/config.mjs'; const c = new pg.Client({ connectionString: APP_URL }); await c.connect(); const sql = readFileSync('drizzle/0013_macro_categoria.sql', 'utf8'); await c.query(sql); await c.query(sql); const r = await c.query('SELECT name, macro_categoria FROM categories ORDER BY name'); console.log(r.rows); await c.end();"
```

Expected: sin errores. Aguas, Aire y Suelos salen con `macro_categoria: null`, porque la semilla todavía no la rellena y sus nombres no casan con ninguna regla.

- [ ] **Step 12: Commit**

```bash
git add drizzle/0013_macro_categoria.sql src/db/schema.ts src/types/database.ts src/lib/customer-item.ts src/lib/validation.ts src/actions/category-actions.ts src/lib/__tests__/validation-macro-categorias.test.ts
git commit -m "feat(categorias): columna macro_categoria y acciones para configurarla"
```

---

## Task 2: La selección de categorías admite N grupos

**Files:**
- Create: `src/lib/seleccion-grupos.ts`
- Modify: `src/lib/tech-service-selection.ts`
- Test: `src/lib/__tests__/seleccion-grupos.test.ts`
- Sin tocar: `src/lib/__tests__/tech-service-selection.test.ts` (tiene que seguir en verde)

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/seleccion-grupos.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { BUCKETS, type Bucket } from "@/lib/customer-item";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionPorGrupo,
  type Seleccion,
} from "@/lib/seleccion-grupos";

const vacia = (): Seleccion<Bucket> => ({ mano_obra: [], cr: [], equipos: [], operacion: [] });

describe("seleccionPorGrupo", () => {
  it("reparte las categorias entre los cuatro grupos y respeta el orden", () => {
    const sel = seleccionPorGrupo(BUCKETS, [
      { id: "a", grupo: "mano_obra" },
      { id: "b", grupo: "operacion" },
      { id: "c", grupo: null },
      { id: "d", grupo: "mano_obra" },
      { id: "e", grupo: "equipos" },
    ]);
    expect(sel).toEqual({ mano_obra: ["a", "d"], cr: [], equipos: ["e"], operacion: ["b"] });
  });

  it("ignora un grupo que no esta en la lista", () => {
    expect(seleccionPorGrupo(BUCKETS, [{ id: "a", grupo: "st" }])).toEqual(vacia());
  });
});

describe("grupoDe", () => {
  it("dice en que grupo esta una categoria, o null", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["a"], operacion: ["b"] };
    expect(grupoDe(sel, "a")).toBe("cr");
    expect(grupoDe(sel, "b")).toBe("operacion");
    expect(grupoDe(sel, "z")).toBeNull();
  });
});

describe("alternarCategoria", () => {
  it("marca una categoria libre en el grupo pedido sin tocar los demas", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["a"] };
    expect(alternarCategoria(sel, "equipos", "c")).toEqual({ ...vacia(), cr: ["a"], equipos: ["c"] });
  });

  it("desmarca una categoria que ya estaba en ese grupo", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), operacion: ["a", "c"] };
    expect(alternarCategoria(sel, "operacion", "c")).toEqual({ ...vacia(), operacion: ["a"] });
  });

  it("exclusion mutua: no mueve una categoria marcada en cualquier otro grupo", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), mano_obra: ["a"] };
    for (const g of ["cr", "equipos", "operacion"] as const) {
      expect(alternarCategoria(sel, g, "a")).toBe(sel);
    }
  });

  it("quitar con la X desclasifica la categoria, tambien si esta inactiva", () => {
    // La X de cada etiqueta llama a alternarCategoria con el grupo actual de la
    // categoria: es el unico camino para liberar una inactiva, que no sale en los
    // desplegables.
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["b-inactiva"], equipos: ["a"] };
    const sinB = alternarCategoria(sel, grupoDe(sel, "b-inactiva")!, "b-inactiva");
    expect(sinB).toEqual({ ...vacia(), equipos: ["a"] });
    expect(grupoDe(sinB, "b-inactiva")).toBeNull();
  });
});

describe("haCambiado", () => {
  it("el mismo contenido en otro orden no es un cambio", () => {
    expect(
      haCambiado({ ...vacia(), cr: ["a", "b"], operacion: ["c"] }, { ...vacia(), cr: ["b", "a"], operacion: ["c"] })
    ).toBe(false);
  });

  it("marcar en cualquiera de los cuatro grupos es un cambio", () => {
    const inicial = vacia();
    for (const g of BUCKETS) {
      expect(haCambiado(inicial, alternarCategoria(inicial, g, "x"))).toBe(true);
    }
  });

  it("volver al estado de partida deja de ser un cambio", () => {
    const inicial: Seleccion<Bucket> = { ...vacia(), equipos: ["a"] };
    const ida = alternarCategoria(inicial, "equipos", "a");
    const vuelta = alternarCategoria(ida, "equipos", "a");
    expect(haCambiado(inicial, vuelta)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/__tests__/seleccion-grupos.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/seleccion-grupos"`.

- [ ] **Step 3: Implementar la selección genérica**

Crear `src/lib/seleccion-grupos.ts` (y convertirlo a CRLF):

```ts
/**
 * Selección en curso de una tarjeta de Configuración que reparte categorías en grupos
 * excluyentes: ids de categoría de cada grupo. La usan «Categorías de Servicio Técnico»
 * (dos grupos) y «Macro-categorías» (cuatro). Vive fuera de los componentes para poder
 * testearla: vitest corre en node y no hay librería de tests de componentes.
 */
export type Seleccion<G extends string> = Record<G, string[]>;

/**
 * Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. Un
 * valor que no está en `grupos` se ignora: la columna tiene un CHECK, pero un valor
 * inesperado no debe crear un grupo que la tarjeta no pinta.
 */
export function seleccionPorGrupo<G extends string>(
  grupos: readonly G[],
  categorias: { id: string; grupo: string | null }[]
): Seleccion<G> {
  const sel = Object.fromEntries(grupos.map((g) => [g, [] as string[]])) as Seleccion<G>;
  for (const c of categorias) {
    if (c.grupo !== null && (grupos as readonly string[]).includes(c.grupo)) {
      sel[c.grupo as G].push(c.id);
    }
  }
  return sel;
}

/** Grupo en el que está marcada una categoría, o null si no está en ninguno. */
export function grupoDe<G extends string>(sel: Seleccion<G>, id: string): G | null {
  for (const g of Object.keys(sel) as G[]) {
    if (sel[g].includes(id)) return g;
  }
  return null;
}

/**
 * Marca o desmarca una categoría en un grupo. Si ya está en otro grupo, devuelve la
 * misma selección sin tocarla. La interfaz ya la enseña desactivada, pero la regla se
 * aplica también aquí, porque la columna solo admite un grupo y el servidor rechazaría
 * la intersección. Para moverla de grupo hay que desmarcarla primero, así nadie la
 * cambia de grupo sin darse cuenta.
 *
 * La X de cada etiqueta también pasa por esta función: se llama con el grupo actual de
 * la categoría, así que desmarca igual que el desplegable. Es el único camino para
 * desclasificar una categoría inactiva, porque los desplegables solo listan las activas.
 */
export function alternarCategoria<G extends string>(
  sel: Seleccion<G>,
  grupo: G,
  id: string
): Seleccion<G> {
  const actual = grupoDe(sel, id);
  if (actual !== null && actual !== grupo) return sel;
  const lista = sel[grupo];
  const nueva = actual === grupo ? lista.filter((x) => x !== id) : [...lista, id];
  return { ...sel, [grupo]: nueva } as Seleccion<G>;
}

/**
 * Si la selección difiere de la de partida. Se compara como conjuntos: el orden de las
 * etiquetas no es un cambio que merezca guardar.
 */
export function haCambiado<G extends string>(inicial: Seleccion<G>, actual: Seleccion<G>): boolean {
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  return (Object.keys(inicial) as G[]).some((g) => !igual(inicial[g], actual[g]));
}
```

- [ ] **Step 4: `tech-service-selection.ts` pasa a ser una capa fina**

Reescribir `src/lib/tech-service-selection.ts` entero (Write, y convertirlo a CRLF):

```ts
import type { TechServiceBucket, TechServiceCategory } from "@/types/database";
import { seleccionPorGrupo, type Seleccion } from "@/lib/seleccion-grupos";

// La lógica de grupos es común con «Macro-categorías» y vive en seleccion-grupos. Este
// módulo conserva los nombres que ya usaban la tarjeta de Servicio Técnico y sus tests.
export { alternarCategoria, grupoDe, haCambiado } from "@/lib/seleccion-grupos";

/** Selección en curso de la tarjeta «Categorías de Servicio Técnico». */
export type SeleccionServicioTecnico = Seleccion<TechServiceBucket>;

/** Los dos grupos de Servicio Técnico, en el orden en que los pinta la tarjeta. */
export const GRUPOS_SERVICIO_TECNICO: readonly TechServiceBucket[] = ["st", "cr"];

/** Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. */
export function seleccionInicial(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): SeleccionServicioTecnico {
  return seleccionPorGrupo(
    GRUPOS_SERVICIO_TECNICO,
    categorias.map((c) => ({ id: c.id, grupo: c.tech_service_bucket }))
  );
}
```

- [ ] **Step 5: Ejecutar y ver que pasan los nuevos y los de Servicio Técnico**

Run: `npx vitest run src/lib/__tests__/seleccion-grupos.test.ts src/lib/__tests__/tech-service-selection.test.ts`
Expected: PASS. Son 10 tests nuevos y los 12 de Servicio Técnico, que no se han tocado.

Run: `npx tsc --noEmit`
Expected: sin errores. La tarjeta de Servicio Técnico sigue compilando con `SeleccionServicioTecnico`, `grupoDe`, `alternarCategoria`, `haCambiado` y `seleccionInicial`.

Run: `npx vitest run`
Expected: **389 passed, 1 skipped**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seleccion-grupos.ts src/lib/tech-service-selection.ts src/lib/__tests__/seleccion-grupos.test.ts
git commit -m "refactor(configuracion): la seleccion de categorias admite n grupos"
```

---

## Task 3: Mapa de macro-categorías y nombres nuevos

**Files:**
- Modify: `src/lib/customer-item.ts`
- Modify: `src/lib/chart-help.ts`
- Test: `src/lib/__tests__/customer-item.test.ts`

En esta tarea `bucketForCategory` **no cambia todavía de firma**: se añaden el mapa, la clave y los nombres. El cambio de firma va en la Task 4, junto con todos sus consumidores, para que cada commit compile.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/customer-item.test.ts`, sustituir la cabecera

```ts
import { describe, it, expect } from "vitest";
import {
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
} from "@/lib/customer-item";
import type { CustomerItemRow } from "@/types/database";
```

por

```ts
import { describe, it, expect } from "vitest";
import {
  BUCKET_LABELS,
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
  mapaMacroCategorias,
  type Bucket,
} from "@/lib/customer-item";
import type { CustomerItemRow, MacroCategoria } from "@/types/database";

const cat = (name: string, macro_categoria: Bucket | null, is_active = true): MacroCategoria =>
  ({ id: name, name, is_active, macro_categoria });

describe("BUCKET_LABELS", () => {
  it("usa los nombres de la spec en graficos y exportaciones", () => {
    expect(BUCKET_LABELS).toEqual({
      mano_obra: "Mano de obra",
      cr: "Consumos y repuestos",
      equipos: "Equipos",
      operacion: "Operaciones",
    });
  });
});

describe("mapaMacroCategorias", () => {
  it("incluye las marcadas, tambien las inactivas, y deja fuera las no marcadas", () => {
    const m = mapaMacroCategorias([
      cat("CAL PM", "mano_obra"),
      cat("C&R Vieja", "cr", false),
      cat("Accesorios", null),
      cat("Equipos X", "equipos"),
    ]);
    expect(m.get("c&r vieja")).toBe("cr");
    expect(m.get("equipos x")).toBe("equipos");
    expect(m.has("accesorios")).toBe(false);
    expect(m.size).toBe(3);
  });

  it("indexa por nombre en minusculas, como casa getSalesData los nombres del hub", () => {
    const m = mapaMacroCategorias([cat("Operación de Redes", "operacion")]);
    expect([...m.keys()]).toEqual(["operación de redes"]);
  });

  it("ignora un valor inesperado de la columna", () => {
    expect(mapaMacroCategorias([cat("Rara", "xx" as never)]).size).toBe(0);
  });
});
```

En el mismo fichero, sustituir

```ts
    expect(lines[0]).toBe("SKU;Marca;Nombre;Categoría;Cantidad;Mano de Obra/Cal;C&R;Equipos;Operación");
```

por

```ts
    expect(lines[0]).toBe("SKU;Marca;Nombre;Categoría;Cantidad;Mano de obra;Consumos y repuestos;Equipos;Operaciones");
```

y sustituir

```ts
      "SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de Obra/Cal", "C&R", "Equipos", "Operación",
```

por

```ts
      "SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de obra", "Consumos y repuestos", "Equipos", "Operaciones",
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts`
Expected: FAIL.
- `BUCKET_LABELS` difiere en tres nombres.
- `mapaMacroCategorias is not a function`, en los 3 tests del mapa.
- Las cabeceras del CSV y del Excel no coinciden.
- `bucketForCategory`, `filterRows`, `groupByCustomer` y `computeGrandTotals` siguen en verde.

- [ ] **Step 3: Implementar**

Reescribir `src/lib/customer-item.ts` entero (Write, y convertirlo a CRLF):

```ts
import type { Bucket, CustomerItemRow, MacroCategoria } from "@/types/database";
import type { ExcelSheet, ExcelRow } from "@/lib/excel-types";

// Bucket vive en types/database porque también tipa la columna macro_categoria. Se
// reexporta aquí para que los consumidores lo sigan importando de donde siempre.
export type { Bucket } from "@/types/database";

/** Las cuatro macro-categorías, en el orden de columnas, series, leyendas y grupos. */
export const BUCKETS: readonly Bucket[] = ["mano_obra", "cr", "equipos", "operacion"];

/**
 * Nombre de cada macro-categoría en la tarjeta de Configuración, los gráficos y las
 * exportaciones. Está en un solo sitio para que los nombres no vuelvan a divergir entre
 * pantallas.
 */
export const BUCKET_LABELS: Record<Bucket, string> = {
  mano_obra: "Mano de obra",
  cr: "Consumos y repuestos",
  equipos: "Equipos",
  operacion: "Operaciones",
};

/**
 * Clave de react-query de las categorías con su macro-categoría. Cuelga de
 * ["categories"] a propósito: al guardar en Configuración se invalida ["categories"] y,
 * por prefijo, se refrescan todos los gráficos que clasifican. No reutiliza
 * ["categories"] tal cual porque getCategories() solo trae las activas.
 */
export const MACRO_CATEGORIAS_KEY = ["categories", "macro-categorias"] as const;

export interface CustomerGroup {
  customer: string;
  items: CustomerItemRow[];
  totals: Record<Bucket, number>;
}

/**
 * Macro-categoría de cada categoría marcada, indexada por nombre en minúsculas.
 * - Va por nombre porque las ventas llegan del hub con el nombre de la categoría, no
 *   con su id.
 * - Va en minúsculas porque getSalesData ya casa así los nombres del hub con los de la
 *   app; si no, un gráfico clasificaría distinto que otro.
 * - Entran las inactivas: sus ventas de años anteriores tienen que seguir en su
 *   macro-categoría.
 * - Las no marcadas no entran, y bucketForCategory las cuenta como Equipos.
 */
export function mapaMacroCategorias(
  categorias: Pick<MacroCategoria, "name" | "macro_categoria">[]
): Map<string, Bucket> {
  const mapa = new Map<string, Bucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como macro-categoría.
    if (c.macro_categoria !== null && (BUCKETS as readonly string[]).includes(c.macro_categoria)) {
      mapa.set(c.name.toLowerCase(), c.macro_categoria);
    }
  }
  return mapa;
}

export function bucketForCategory(categoria: string | null): Bucket {
  if (categoria) {
    if (categoria.startsWith("C&R ")) return "cr";
    if (categoria.startsWith("CAL ") || categoria === "ST" || categoria.startsWith("ST ") || categoria === "Alquileres") {
      return "mano_obra";
    }
    if (categoria === "Operación de Redes" || categoria === "Consultoría") return "operacion";
  }
  return "equipos";
}

export function filterRows(rows: CustomerItemRow[], search: string): CustomerItemRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.customer.toLowerCase().includes(q) ||
      (r.sku ?? "").toLowerCase().includes(q) ||
      r.nombre.toLowerCase().includes(q)
  );
}

function emptyTotals(): Record<Bucket, number> {
  return { mano_obra: 0, cr: 0, equipos: 0, operacion: 0 };
}

export function groupByCustomer(rows: CustomerItemRow[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const r of rows) {
    let g = map.get(r.customer);
    if (!g) {
      g = { customer: r.customer, items: [], totals: emptyTotals() };
      map.set(r.customer, g);
    }
    g.items.push(r);
    g.totals[bucketForCategory(r.categoria)] += r.importe;
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => b.importe - a.importe);
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}

export function computeGrandTotals(groups: CustomerGroup[]): Record<Bucket, number> {
  const t = emptyTotals();
  for (const g of groups) {
    t.mano_obra += g.totals.mano_obra;
    t.cr += g.totals.cr;
    t.equipos += g.totals.equipos;
    t.operacion += g.totals.operacion;
  }
  return t;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customerItemToCsv(groups: CustomerGroup[], grand: Record<Bucket, number>): string {
  // Las cabeceras salen de BUCKET_LABELS para que la exportación diga lo mismo que la pantalla.
  const header = ["SKU", "Marca", "Nombre", "Categoría", "Cantidad", ...BUCKETS.map((b) => BUCKET_LABELS[b])];
  const lines: (string | number)[][] = [header];
  for (const g of groups) {
    lines.push(["", "", "", "", "", g.totals.mano_obra.toFixed(2), g.totals.cr.toFixed(2), g.totals.equipos.toFixed(2), g.totals.operacion.toFixed(2)]);
    lines[lines.length - 1][0] = g.customer;
    for (const it of g.items) {
      const b = bucketForCategory(it.categoria);
      lines.push([
        it.sku ?? "",
        it.marca ?? "",
        it.nombre,
        it.categoria ?? "Sin categoría",
        it.cantidad,
        b === "mano_obra" ? it.importe.toFixed(2) : "",
        b === "cr" ? it.importe.toFixed(2) : "",
        b === "equipos" ? it.importe.toFixed(2) : "",
        b === "operacion" ? it.importe.toFixed(2) : "",
      ]);
    }
  }
  lines.push(["TOTAL", "", "", "", "", grand.mano_obra.toFixed(2), grand.cr.toFixed(2), grand.equipos.toFixed(2), grand.operacion.toFixed(2)]);
  return lines.map((row) => row.map(csvCell).join(";")).join("\n");
}

export function customerItemToExcel(groups: CustomerGroup[], grand: Record<Bucket, number>): ExcelSheet {
  const rows: ExcelRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.customer, "", "", "", "", g.totals.mano_obra, g.totals.cr, g.totals.equipos, g.totals.operacion], bold: true });
    for (const it of g.items) {
      const b = bucketForCategory(it.categoria);
      rows.push({
        cells: [
          it.sku ?? "", it.marca ?? "", it.nombre, it.categoria ?? "Sin categoría", it.cantidad,
          b === "mano_obra" ? it.importe : null,
          b === "cr" ? it.importe : null,
          b === "equipos" ? it.importe : null,
          b === "operacion" ? it.importe : null,
        ],
      });
    }
  }
  rows.push({ cells: ["TOTAL", "", "", "", "", grand.mano_obra, grand.cr, grand.equipos, grand.operacion], bold: true });
  return {
    name: "Cliente×Artículo",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Marca", width: 18 },
      { header: "Nombre", width: 40 },
      { header: "Categoría", width: 20 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      ...BUCKETS.map((b) => ({ header: BUCKET_LABELS[b], width: 16, numFmt: '"$"#,##0.00' })),
    ],
    rows,
  };
}
```

- [ ] **Step 4: Texto de ayuda del donut**

En `src/lib/chart-help.ts`, sustituir

```ts
  mixCategoria: "Reparto del importe entre las 4 macro-categorías (Mano de obra, C&R, Equipos, Operación). Cambia OV/FAC con el selector.",
```

por

```ts
  mixCategoria: "Reparto del importe entre las 4 macro-categorías (Mano de obra, Consumos y repuestos, Equipos, Operaciones), según la clasificación de Configuración: lo que no está marcado cuenta como Equipos. Cambia OV/FAC con el selector.",
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts`
Expected: PASS (10 tests: los 6 previos y 4 nuevos).

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: **393 passed, 1 skipped**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customer-item.ts src/lib/chart-help.ts src/lib/__tests__/customer-item.test.ts
git commit -m "feat(categorias): mapa de macro-categorias y nombres nuevos"
```

---

## Task 4: Todos los consumidores clasifican con el mapa

**Files:**
- Modify: `src/lib/customer-item.ts`
- Modify: `src/lib/analytics-comercial.ts`
- Modify: `src/lib/customer-detail.ts`
- Modify: `src/lib/dashboard-insights.ts`
- Modify: `src/components/charts/comercial/bucket-mix-card.tsx`
- Modify: `src/components/charts/comercial/bucket-by-client-card.tsx`
- Modify: `src/components/charts/comercial/season-by-bucket-card.tsx`
- Modify: `src/components/customers/customer-bucket-mix-card.tsx`
- Modify: `src/components/charts/dashboard/category-mix-donut.tsx`
- Modify: `src/app/(dashboard)/cliente-articulo/page.tsx`
- Test: `src/lib/__tests__/customer-item.test.ts`, `analytics-comercial.test.ts`, `customer-detail.test.ts`, `dashboard-insights.test.ts`

Cambiar la firma de `bucketForCategory` rompe a la vez las funciones puras y los componentes. Por eso van en la misma tarea y en un solo commit, que compila.

- [ ] **Step 1: Escribir los tests con la firma nueva (fallan)**

Reescribir `src/lib/__tests__/customer-item.test.ts` entero (Write, y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import {
  BUCKET_LABELS,
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
  mapaMacroCategorias,
  type Bucket,
} from "@/lib/customer-item";
import type { CustomerItemRow, MacroCategoria } from "@/types/database";

const cat = (name: string, macro_categoria: Bucket | null, is_active = true): MacroCategoria =>
  ({ id: name, name, is_active, macro_categoria });

const rows: CustomerItemRow[] = [
  { customer: "Beta", sku: "A", marca: "Horiba Ltd.", nombre: "Scrubber", categoria: "C&R AP Series", cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "B", marca: "Ambientalia", nombre: "Calibración Enviro", categoria: "CAL PM", cantidad: 2, importe: 300 },
  { customer: "Alpha", sku: "C", marca: "Grimm", nombre: "EDM 180C", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
  { customer: "Alpha", sku: "D", marca: "Ambientalia", nombre: "Mantenimiento", categoria: "Operación de Redes", cantidad: 1, importe: 50 },
];

// Clasificación de prueba: la que sembraría la migración 0013 para estos nombres.
const mapa = mapaMacroCategorias([
  cat("C&R AP Series", "cr"),
  cat("C&R EDM 180", "cr"),
  cat("CAL PM", "mano_obra"),
  cat("Operación de Redes", "operacion"),
]);

describe("BUCKET_LABELS", () => {
  it("usa los nombres de la spec en graficos y exportaciones", () => {
    expect(BUCKET_LABELS).toEqual({
      mano_obra: "Mano de obra",
      cr: "Consumos y repuestos",
      equipos: "Equipos",
      operacion: "Operaciones",
    });
  });
});

describe("mapaMacroCategorias", () => {
  it("incluye las marcadas, tambien las inactivas, y deja fuera las no marcadas", () => {
    const m = mapaMacroCategorias([
      cat("CAL PM", "mano_obra"),
      cat("C&R Vieja", "cr", false),
      cat("Accesorios", null),
      cat("Equipos X", "equipos"),
    ]);
    expect(m.get("c&r vieja")).toBe("cr");
    expect(m.get("equipos x")).toBe("equipos");
    expect(m.has("accesorios")).toBe(false);
    expect(m.size).toBe(3);
  });

  it("indexa por nombre en minusculas, como casa getSalesData los nombres del hub", () => {
    const m = mapaMacroCategorias([cat("Operación de Redes", "operacion")]);
    expect([...m.keys()]).toEqual(["operación de redes"]);
  });

  it("ignora un valor inesperado de la columna", () => {
    expect(mapaMacroCategorias([cat("Rara", "xx" as never)]).size).toBe(0);
  });
});

describe("bucketForCategory", () => {
  it("devuelve la macro-categoria del mapa", () => {
    expect(bucketForCategory("C&R AP Series", mapa)).toBe("cr");
    expect(bucketForCategory("CAL PM", mapa)).toBe("mano_obra");
    expect(bucketForCategory("Operación de Redes", mapa)).toBe("operacion");
  });

  it("sin entrada en el mapa o sin categoria cuenta como Equipos", () => {
    expect(bucketForCategory("EDM180 Series", mapa)).toBe("equipos");
    // Ya no manda el prefijo: un «C&R …» que no está marcado es Equipos.
    expect(bucketForCategory("C&R Sin Marcar", mapa)).toBe("equipos");
    expect(bucketForCategory(null, mapa)).toBe("equipos");
    expect(bucketForCategory("CAL PM", new Map())).toBe("equipos");
  });

  it("casa el nombre sin distinguir mayusculas", () => {
    expect(bucketForCategory("c&r ap series", mapa)).toBe("cr");
  });
});

describe("coherencia con la migracion 0013", () => {
  // Copia literal de las reglas de nombre que tenía bucketForCategory antes de esta spec.
  function reglasAntiguas(categoria: string | null): Bucket {
    if (categoria) {
      if (categoria.startsWith("C&R ")) return "cr";
      if (categoria.startsWith("CAL ") || categoria === "ST" || categoria.startsWith("ST ") || categoria === "Alquileres") {
        return "mano_obra";
      }
      if (categoria === "Operación de Redes" || categoria === "Consultoría") return "operacion";
    }
    return "equipos";
  }

  // Lo que marca cada UPDATE de drizzle/0013_macro_categoria.sql, en su orden.
  // LIKE 'X %' equivale a startsWith("X ").
  function marcaDeLaMigracion(nombre: string): Bucket | null {
    if (nombre.startsWith("C&R ")) return "cr";
    if (nombre.startsWith("CAL ") || nombre === "ST" || nombre.startsWith("ST ") || nombre === "Alquileres") {
      return "mano_obra";
    }
    if (nombre === "Operación de Redes" || nombre === "Consultoría") return "operacion";
    return null;
  }

  it("el mapa sembrado por la migracion clasifica igual que las reglas de nombre", () => {
    const nombres = [
      "C&R AP Series", "C&R EDM 180", "C&R", "CAL PM", "CAL NOx", "CALIBRACION", "ST", "ST EDM 180",
      "STX", "Alquileres", "Operación de Redes", "Consultoría", "EDM180 Series", "Accesorios",
    ];
    const sembrado = mapaMacroCategorias(nombres.map((n) => cat(n, marcaDeLaMigracion(n))));
    for (const n of [...nombres, null]) {
      expect(bucketForCategory(n, sembrado)).toBe(reglasAntiguas(n));
    }
  });
});

describe("filterRows", () => {
  it("filtra por customer/sku/nombre (case-insensitive)", () => {
    expect(filterRows(rows, "alpha").length).toBe(2);
    expect(filterRows(rows, "scrubber").map((r) => r.sku)).toEqual(["A"]);
    expect(filterRows(rows, "").length).toBe(4);
  });
});

describe("groupByCustomer", () => {
  it("agrupa, subtotales por bucket, orden alfabético + items por importe desc", () => {
    const g = groupByCustomer(rows, mapa);
    expect(g.map((x) => x.customer)).toEqual(["Alpha", "Beta"]);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 500, operacion: 50 });
    expect(g[0].items.map((i) => i.sku)).toEqual(["C", "D"]);
    expect(g[1].totals).toEqual({ mano_obra: 300, cr: 100, equipos: 0, operacion: 0 });
    expect(g[1].items.map((i) => i.sku)).toEqual(["B", "A"]);
  });

  it("reparte segun el mapa: cambiar la clasificacion cambia los totales", () => {
    const otro = mapaMacroCategorias([cat("EDM180 Series", "operacion")]);
    const g = groupByCustomer(rows, otro);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 50, operacion: 500 });
    expect(g[1].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 400, operacion: 0 });
  });
});

describe("computeGrandTotals", () => {
  it("suma los 4 buckets", () => {
    expect(computeGrandTotals(groupByCustomer(rows, mapa))).toEqual({ mano_obra: 300, cr: 100, equipos: 500, operacion: 50 });
  });
});

describe("customerItemToCsv", () => {
  it("cabecera + fila por cliente + artículos + TOTAL", () => {
    const groups = groupByCustomer(rows, mapa);
    const csv = customerItemToCsv(groups, computeGrandTotals(groups), mapa);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("SKU;Marca;Nombre;Categoría;Cantidad;Mano de obra;Consumos y repuestos;Equipos;Operaciones");
    expect(lines[1]).toBe("Alpha;;;;;0.00;0.00;500.00;50.00");
    expect(lines[2]).toBe("C;Grimm;EDM 180C;EDM180 Series;1;;;500.00;");
    expect(lines[lines.length - 1]).toBe("TOTAL;;;;;300.00;100.00;500.00;50.00");
  });
});

describe("customerItemToExcel", () => {
  it("cabecera de grupo bold, buckets por columna y total bold", () => {
    const groups = [
      {
        customer: "AGQ",
        items: [
          { customer: "AGQ", sku: "1", marca: "M", nombre: "uno", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
          { customer: "AGQ", sku: "2", marca: null, nombre: "dos", categoria: "CAL PM", cantidad: 3, importe: 40 },
        ],
        totals: { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 },
      },
    ];
    const grand = { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 };
    const sheet = customerItemToExcel(groups, grand, mapa);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de obra", "Consumos y repuestos", "Equipos", "Operaciones",
    ]);
    expect(sheet.rows[0].bold).toBe(true);
    expect(sheet.rows[0].cells).toEqual(["AGQ", "", "", "", "", 40, 100, 0, 0]);
    expect(sheet.rows[1].cells).toEqual(["1", "M", "uno", "C&R EDM 180", 1, null, 100, null, null]);
    expect(sheet.rows[2].cells).toEqual(["2", "", "dos", "CAL PM", 3, 40, null, null, null]);
    const total = sheet.rows[sheet.rows.length - 1];
    expect(total.bold).toBe(true);
    expect(total.cells).toEqual(["TOTAL", "", "", "", "", 40, 100, 0, 0]);
  });
});
```

En `src/lib/__tests__/analytics-comercial.test.ts`, sustituir

```ts
import type { CustomerYearRow, ItemSalesRow, CustomerItemRow, CustomerMonthRow, CategoryMonthRow } from "@/types/database";

describe("buildBucketMixByYear", () => {
```

por

```ts
import type { CustomerYearRow, ItemSalesRow, CustomerItemRow, CustomerMonthRow, CategoryMonthRow } from "@/types/database";
import { mapaMacroCategorias } from "@/lib/customer-item";

// Clasificación de prueba: la que sembraría la migración 0013 para estos nombres.
const mapa = mapaMacroCategorias([
  { name: "C&R EDM 180", macro_categoria: "cr" },
  { name: "CAL PM", macro_categoria: "mano_obra" },
  { name: "Operación de Redes", macro_categoria: "operacion" },
]);

describe("buildBucketMixByYear", () => {
  it("clasifica con el mapa guardado, no por el nombre", () => {
    const propio = mapaMacroCategorias([{ name: "EDM180 Series", macro_categoria: "operacion" }]);
    const r = buildBucketMixByYear(
      [
        { categories: { name: "EDM180 Series" }, record_type: "INVOICE", record_year: 2024, amount_usd: 1000 },
        { categories: { name: "C&R EDM 180" }, record_type: "INVOICE", record_year: 2024, amount_usd: 200 },
      ],
      "INVOICE",
      propio
    );
    // «C&R EDM 180» no está en este mapa: cuenta como Equipos aunque empiece por «C&R ».
    expect(r).toEqual([{ year: 2024, mano_obra: 0, cr: 0, equipos: 200, operacion: 1000 }]);
  });

```

y, en el mismo fichero, sustituir `const r = buildBucketMixByYear(records, "INVOICE");` por `const r = buildBucketMixByYear(records, "INVOICE", mapa);`, `const b = buildBucketByClient(rows);` por `const b = buildBucketByClient(rows, mapa);` y `const s = buildBucketSeason(rows);` por `const s = buildBucketSeason(rows, mapa);`.

En `src/lib/__tests__/customer-detail.test.ts`, sustituir

```ts
import type { CustomerYearRow, CustomerItemRow, CustomerMonthRow, MarginCustomerRow } from "@/types/database";
```

por

```ts
import type { CustomerYearRow, CustomerItemRow, CustomerMonthRow, MarginCustomerRow } from "@/types/database";
import { mapaMacroCategorias } from "@/lib/customer-item";
```

y sustituir

```ts
describe("customerBuckets", () => {
  it("suma por bucket del cliente", () => {
    expect(customerBuckets(items, "A")).toEqual({ mano_obra: 40, cr: 100, equipos: 200, operacion: 0, total: 340 });
  });
});
```

por

```ts
describe("customerBuckets", () => {
  it("suma por bucket del cliente segun el mapa; lo que no esta en el mapa es Equipos", () => {
    const mapa = mapaMacroCategorias([
      { name: "C&R EDM 180", macro_categoria: "cr" },
      { name: "CAL PM", macro_categoria: "mano_obra" },
    ]);
    expect(customerBuckets(items, "A", mapa)).toEqual({ mano_obra: 40, cr: 100, equipos: 200, operacion: 0, total: 340 });
  });
});
```

En `src/lib/__tests__/dashboard-insights.test.ts`, sustituir

```ts
import { cumulativeSeries, executionByMonth, bucketMix, topCustomers, yoyChange } from "@/lib/dashboard-insights";
```

por

```ts
import { cumulativeSeries, executionByMonth, bucketMix, topCustomers, yoyChange } from "@/lib/dashboard-insights";
import { mapaMacroCategorias } from "@/lib/customer-item";
```

y sustituir

```ts
    const cats = new Map([["c1", "C&R Algo"], ["c2", "Equipos X"]]);
    const mix = bucketMix([rec("INVOICE", 1, 100, "c1"), rec("INVOICE", 2, 300, "c2"), rec("SALES_ORDER", 1, 999, "c1")], cats, "INVOICE");
    expect(mix).toHaveLength(4);
```

por

```ts
    const cats = new Map([["c1", "C&R Algo"], ["c2", "Equipos X"]]);
    const mapa = mapaMacroCategorias([{ name: "C&R Algo", macro_categoria: "cr" }]);
    const mix = bucketMix([rec("INVOICE", 1, 100, "c1"), rec("INVOICE", 2, 300, "c2"), rec("SALES_ORDER", 1, 999, "c1")], cats, mapa, "INVOICE");
    expect(mix).toHaveLength(4);
    expect(mix.map((m) => m.label)).toEqual(["Mano de obra", "Consumos y repuestos", "Equipos", "Operaciones"]);
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts src/lib/__tests__/analytics-comercial.test.ts src/lib/__tests__/customer-detail.test.ts src/lib/__tests__/dashboard-insights.test.ts`
Expected: FAIL. `bucketForCategory` sigue aplicando las reglas de nombre e ignora el mapa, así que fallan:
- en customer-item: «sin entrada … cuenta como Equipos» («C&R Sin Marcar» sale `cr`), «casa el nombre sin distinguir mayusculas» y «reparte segun el mapa»;
- en analytics-comercial: «clasifica con el mapa guardado»;
- en dashboard-insights: el test de `bucketMix`, que recibe el mapa en la posición del tipo y ya no filtra por `INVOICE`.

- [ ] **Step 3: `customer-item.ts` con la firma nueva**

En `src/lib/customer-item.ts`, sustituir

```ts
export function bucketForCategory(categoria: string | null): Bucket {
  if (categoria) {
    if (categoria.startsWith("C&R ")) return "cr";
    if (categoria.startsWith("CAL ") || categoria === "ST" || categoria.startsWith("ST ") || categoria === "Alquileres") {
      return "mano_obra";
    }
    if (categoria === "Operación de Redes" || categoria === "Consultoría") return "operacion";
  }
  return "equipos";
}
```

por

```ts
/**
 * Macro-categoría de una venta según el nombre de su categoría. `mapa` sale de
 * mapaMacroCategorias(). Sin entrada cuenta como Equipos, igual que con las reglas de
 * nombre de antes: categoría sin marcar, venta sin categoría o categoría del hub que no
 * existe en la app.
 */
export function bucketForCategory(categoria: string | null, mapa: Map<string, Bucket>): Bucket {
  if (!categoria) return "equipos";
  return mapa.get(categoria.toLowerCase()) ?? "equipos";
}
```

sustituir

```ts
export function groupByCustomer(rows: CustomerItemRow[]): CustomerGroup[] {
```

por

```ts
export function groupByCustomer(rows: CustomerItemRow[], mapa: Map<string, Bucket>): CustomerGroup[] {
```

y, dentro de esa función, `g.totals[bucketForCategory(r.categoria)] += r.importe;` por `g.totals[bucketForCategory(r.categoria, mapa)] += r.importe;`.

Sustituir

```ts
export function customerItemToCsv(groups: CustomerGroup[], grand: Record<Bucket, number>): string {
```

por

```ts
export function customerItemToCsv(
  groups: CustomerGroup[],
  grand: Record<Bucket, number>,
  mapa: Map<string, Bucket>
): string {
```

y

```ts
export function customerItemToExcel(groups: CustomerGroup[], grand: Record<Bucket, number>): ExcelSheet {
```

por

```ts
export function customerItemToExcel(
  groups: CustomerGroup[],
  grand: Record<Bucket, number>,
  mapa: Map<string, Bucket>
): ExcelSheet {
```

En las dos funciones de exportación, sustituir la línea `const b = bucketForCategory(it.categoria);` por `const b = bucketForCategory(it.categoria, mapa);`. Hay una en cada función: usar Edit con `replace_all: true`.

- [ ] **Step 4: Las funciones puras de los gráficos reciben el mapa**

En `src/lib/analytics-comercial.ts`:

- Sustituir `import { bucketForCategory } from "@/lib/customer-item";` por `import { bucketForCategory, type Bucket } from "@/lib/customer-item";`.
- Sustituir

```ts
export function buildBucketMixByYear(records: MixRecord[], tipo: string): BucketMixYear[] {
```

por

```ts
/** `mapa` sale de mapaMacroCategorias(): lo que no está en él cuenta como Equipos. */
export function buildBucketMixByYear(records: MixRecord[], tipo: string, mapa: Map<string, Bucket>): BucketMixYear[] {
```

  y `row[bucketForCategory(r.categories?.name ?? null)] += r.amount_usd;` por `row[bucketForCategory(r.categories?.name ?? null, mapa)] += r.amount_usd;`.
- Sustituir

```ts
export function buildBucketByClient(rows: CustomerItemRow[]): BucketClientRow[] {
```

por

```ts
export function buildBucketByClient(rows: CustomerItemRow[], mapa: Map<string, Bucket>): BucketClientRow[] {
```

  y `row[bucketForCategory(r.categoria)] += r.importe;` por `row[bucketForCategory(r.categoria, mapa)] += r.importe;`.
- Sustituir

```ts
export function buildBucketSeason(rows: CategoryMonthRow[]): BucketSeasonRow[] {
```

por

```ts
export function buildBucketSeason(rows: CategoryMonthRow[], mapa: Map<string, Bucket>): BucketSeasonRow[] {
```

  y `if (r.mes >= 1 && r.mes <= 12) months[r.mes - 1][bucketForCategory(r.categoria)] += r.importe;` por `if (r.mes >= 1 && r.mes <= 12) months[r.mes - 1][bucketForCategory(r.categoria, mapa)] += r.importe;`.

En `src/lib/customer-detail.ts`:

- Sustituir `import { bucketForCategory } from "@/lib/customer-item";` por `import { bucketForCategory, type Bucket } from "@/lib/customer-item";`.
- Sustituir

```ts
export function customerBuckets(rows: CustomerItemRow[], customer: string): CustomerBuckets {
  const acc: CustomerBuckets = { mano_obra: 0, cr: 0, equipos: 0, operacion: 0, total: 0 };
  for (const r of rows) {
    if (r.customer !== customer) continue;
    acc[bucketForCategory(r.categoria)] += r.importe;
```

por

```ts
/** `mapa` sale de mapaMacroCategorias(): lo que no está en él cuenta como Equipos. */
export function customerBuckets(rows: CustomerItemRow[], customer: string, mapa: Map<string, Bucket>): CustomerBuckets {
  const acc: CustomerBuckets = { mano_obra: 0, cr: 0, equipos: 0, operacion: 0, total: 0 };
  for (const r of rows) {
    if (r.customer !== customer) continue;
    acc[bucketForCategory(r.categoria, mapa)] += r.importe;
```

En `src/lib/dashboard-insights.ts`:

- Sustituir `import { bucketForCategory, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";` por `import { BUCKETS, bucketForCategory, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";`.
- Sustituir

```ts
export function bucketMix(
  records: InsightRecord[],
  catMap: Map<string, string>,
  recordType: string
): { bucket: Bucket; label: string; amount: number; pct: number }[] {
  const order: Bucket[] = ["mano_obra", "cr", "equipos", "operacion"];
  const sums = new Map<Bucket, number>(order.map((b) => [b, 0]));
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const b = bucketForCategory(catMap.get(r.category_id) ?? null);
```

por

```ts
/**
 * `catMap` traduce el id de categoría de cada venta a su nombre; `mapa` (de
 * mapaMacroCategorias) traduce ese nombre a su macro-categoría.
 */
export function bucketMix(
  records: InsightRecord[],
  catMap: Map<string, string>,
  mapa: Map<string, Bucket>,
  recordType: string
): { bucket: Bucket; label: string; amount: number; pct: number }[] {
  const sums = new Map<Bucket, number>(BUCKETS.map((b) => [b, 0]));
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const b = bucketForCategory(catMap.get(r.category_id) ?? null, mapa);
```

  y

```ts
  return order.map((b) => {
```

por

```ts
  return BUCKETS.map((b) => {
```

- [ ] **Step 5: Ejecutar los tests de la lógica pura**

Run: `npx vitest run src/lib/__tests__/customer-item.test.ts src/lib/__tests__/analytics-comercial.test.ts src/lib/__tests__/customer-detail.test.ts src/lib/__tests__/dashboard-insights.test.ts`
Expected: PASS.

- [ ] **Step 6: `bucket-mix-card.tsx`**

Reescribir `src/components/charts/comercial/bucket-mix-card.tsx` entero (Write, y convertirlo a CRLF):

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import type { SalesRecord } from "@/types/database";
import { buildBucketMixByYear } from "@/lib/analytics-comercial";
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
] as const;

type MixPoint = { year: number; mano_obra: number; cr: number; equipos: number; operacion: number };

function MixTooltip({ active, payload, label }: ChartTooltipProps<MixPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketMixCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  // Clasificación guardada en Configuración. Sin ella todo caería en Equipos y el
  // gráfico saltaría después a las cifras buenas, así que hasta que llega se ve el
  // esqueleto. Se mira `data` y no `isPending`: si la consulta falla, el esqueleto se
  // queda en lugar de pintar un reparto equivocado.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const rows = useMemo(
    () => buildBucketMixByYear((data ?? []) as SalesRecord[], recordType, mapa),
    [data, recordType, mapa]
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Mix por macro-categoría (evolución anual)</CardTitle>
          <InfoTooltip text={CHART_HELP.bucketMixAnual} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading || macro === undefined ? (
          <Skeleton className="h-full min-h-[340px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={340}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <Tooltip content={<MixTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend />
              {/* fillOpacity 0.5: tono suave de la paleta.
                  maxBarSize: con pocos años a ancho completo, sin límite cada barra sería un bloque enorme. */}
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} fillOpacity={0.5} maxBarSize={64} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: `bucket-by-client-card.tsx`**

Reescribir `src/components/charts/comercial/bucket-by-client-card.tsx` entero (Write, y convertirlo a CRLF):

```tsx
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { buildBucketByClient, type BucketClientRow } from "@/lib/analytics-comercial";
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
] as const;

function BClientTooltip({ active, payload, label }: ChartTooltipProps<BucketClientRow>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketByClientCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const top = useMemo(() => buildBucketByClient(data ?? [], mapa).slice(0, 15), [data, mapa]);
  const router = useRouter();
  const goCustomer = (d: { customer?: string; payload?: { customer?: string } }) => {
    const name = d?.payload?.customer ?? d?.customer;
    if (name) router.push(customerHref(name));
  };

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Macro-categoría × cliente {year} (top 15)</CardTitle>
          <InfoTooltip text={CHART_HELP.bucketByClient} />
        </span>
        <p className="text-xs text-muted-foreground">Clic en un cliente para ver su detalle.</p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading || macro === undefined ? (
          <Skeleton className="h-full min-h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={440} className="cursor-pointer">
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<BClientTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} onClick={(d) => goCustomer(d as { customer?: string; payload?: { customer?: string } })} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: `season-by-bucket-card.tsx`**

Reescribir `src/components/charts/comercial/season-by-bucket-card.tsx` entero (Write, y convertirlo a CRLF):

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryMonthSales } from "@/actions/category-month-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { buildBucketSeason } from "@/lib/analytics-comercial";
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
] as const;

type SeasonPoint = { mesLabel: string; mano_obra: number; cr: number; equipos: number; operacion: number };

function SeasonTooltip({ active, payload, label }: ChartTooltipProps<SeasonPoint>) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-white/10 mt-1 pt-1 font-semibold">
        <span>Total</span>
        <span className="font-mono">{formatUSD(total)}</span>
      </div>
    </div>
  );
}

export function SeasonByBucketCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["category-month", { tipo: recordType, anio: year }],
    queryFn: () => getCategoryMonthSales({ tipo: recordType, anio: year }),
  });
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const rows = useMemo(
    () => buildBucketSeason(data ?? [], mapa).map((r) => ({
      mesLabel: MESES[r.mes - 1], mano_obra: r.mano_obra, cr: r.cr, equipos: r.equipos, operacion: r.operacion,
    })),
    [data, mapa]
  );
  const hasData = useMemo(() => rows.some((r) => r.mano_obra || r.cr || r.equipos || r.operacion), [rows]);

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Estacionalidad por categoría {year}</CardTitle>
          <InfoTooltip text={CHART_HELP.estacionalidadCategoria} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading || macro === undefined ? (
          <Skeleton className="h-full min-h-[380px] w-full" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={380}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="mesLabel" className="text-[10px] fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<SeasonTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 9: `customer-bucket-mix-card.tsx`**

Reescribir `src/components/customers/customer-bucket-mix-card.tsx` entero (Write, y convertirlo a CRLF):

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { customerBuckets } from "@/lib/customer-detail";
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
] as const;

type Slice = { name: string; value: number; color: string };

function BucketTooltip({ active, payload, total }: ChartTooltipProps<Slice> & { total: number }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  const v = p?.value ?? 0;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{p?.name}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(v)}</span></div>
      <div className="flex justify-between gap-4"><span>% del total</span><span className="font-mono">{total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</span></div>
    </div>
  );
}

export function CustomerBucketMixCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const { slices, total } = useMemo(() => {
    const b = customerBuckets(data ?? [], customer, mapa);
    return {
      slices: SERIES.map((s) => ({ name: s.label, value: b[s.key], color: s.color })).filter((s) => s.value > 0),
      total: b.total,
    };
  }, [data, customer, mapa]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Mezcla por macro-categoría {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading || macro === undefined ? (
          <Skeleton className="h-[360px] w-full" />
        ) : slices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<BucketTooltip total={total} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 10: `category-mix-donut.tsx`**

Reescribir `src/components/charts/dashboard/category-mix-donut.tsx` entero (Write, y convertirlo a CRLF):

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getMacroCategorias } from "@/actions/category-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bucketMix, type InsightRecord } from "@/lib/dashboard-insights";
import { MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD } from "@/lib/constants";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import type { ChartTooltipProps } from "@/lib/chart-types";

const COLORS: Record<string, string> = {
  mano_obra: "#6366f1", cr: "#10b981", equipos: "#f59e0b", operacion: "#ef4444",
};

type MixSlice = { bucket: string; label: string; amount: number; pct: number };

function MixTooltip({ active, payload }: ChartTooltipProps<MixSlice>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold">{p.label}</div>
      <div className="font-mono">{formatUSD(p.amount)} · {Math.round(p.pct)}%</div>
    </div>
  );
}

export function CategoryMixDonut({
  records, catMap,
}: {
  records: InsightRecord[];
  catMap: Map<string, string>;
}) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  // La clasificación se carga aquí y no en el proveedor del dashboard: así solo la
  // espera este widget, y el resto del dashboard no se retrasa. Hasta que llega se ve el
  // esqueleto, nunca un reparto con el mapa vacío (todo en Equipos).
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const mix = useMemo(
    () => bucketMix(records, catMap, mapa, tipo).filter((m) => m.amount > 0),
    [records, catMap, mapa, tipo]
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      {/* flex-wrap: si el título no deja 260px al conmutador OV/FAC, este baja de
          línea en lugar de acortarse a "OV/FAC". */}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            Mix por macro-categoría
            <InfoTooltip text={CHART_HELP.mixCategoria} />
          </span>
        </CardTitle>
        <RecordTypeToggle value={tipo} onValueChange={setTipo} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {macro === undefined ? (
          <Skeleton className="h-full min-h-[340px] w-full" />
        ) : mix.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={340}>
            <PieChart>
              <Pie data={mix} dataKey="amount" nameKey="label" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {mix.map((m) => <Cell key={m.bucket} fill={COLORS[m.bucket]} />)}
              </Pie>
              <Tooltip content={<MixTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 11: Página Cliente × Artículo**

En `src/app/(dashboard)/cliente-articulo/page.tsx`, hacer estas sustituciones con Edit:

1. Sustituir

```tsx
import { getCustomerItemSales } from "@/actions/customer-item-actions";
```

por

```tsx
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getMacroCategorias } from "@/actions/category-actions";
```

2. Sustituir

```tsx
import {
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
} from "@/lib/customer-item";
```

por

```tsx
import {
  BUCKET_LABELS,
  MACRO_CATEGORIAS_KEY,
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
  mapaMacroCategorias,
} from "@/lib/customer-item";
```

3. Sustituir

```tsx
  const rows = useMemo<CustomerItemRow[]>(() => data ?? [], [data]);
  const groups = useMemo(() => groupByCustomer(filterRows(rows, search)), [rows, search]);
```

por

```tsx
  // Clasificación guardada en Configuración. Hasta que llega, la tabla muestra el
  // esqueleto y la exportación está desactivada: nunca se reparte con el mapa vacío
  // (todo en Equipos). Si la consulta falla, el esqueleto se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const sinClasificacion = macro === undefined;

  const rows = useMemo<CustomerItemRow[]>(() => data ?? [], [data]);
  const groups = useMemo(() => groupByCustomer(filterRows(rows, search), mapa), [rows, search, mapa]);
```

4. Sustituir

```tsx
    const blob = new Blob([customerItemToCsv(groups, grand)], { type: "text/csv;charset=utf-8" });
```

por

```tsx
    const blob = new Blob([customerItemToCsv(groups, grand, mapa)], { type: "text/csv;charset=utf-8" });
```

5. Sustituir

```tsx
    downloadXlsx([customerItemToExcel(groups, grand)], `ventas_cliente_articulo_${tipo}_${anio}.xlsx`);
```

por

```tsx
    downloadXlsx([customerItemToExcel(groups, grand, mapa)], `ventas_cliente_articulo_${tipo}_${anio}.xlsx`);
```

6. Sustituir

```tsx
    try { await copySheetToClipboard(customerItemToExcel(groups, grand)); toast.success("Tabla copiada"); }
```

por

```tsx
    try { await copySheetToClipboard(customerItemToExcel(groups, grand, mapa)); toast.success("Tabla copiada"); }
```

7. Sustituir

```tsx
            <ExportMenu onCopy={onCopy} onCsv={exportCsv} onXlsx={exportXlsx} disabled={groups.length === 0} />
```

por

```tsx
            <ExportMenu onCopy={onCopy} onCsv={exportCsv} onXlsx={exportXlsx} disabled={groups.length === 0 || sinClasificacion} />
```

8. Sustituir

```tsx
          {isLoading ? (
            <Skeleton className="h-[500px] w-full rounded-xl" />
```

por

```tsx
          {isLoading || sinClasificacion ? (
            <Skeleton className="h-[500px] w-full rounded-xl" />
```

9. Sustituir

```tsx
                    <TableHead className="text-right">Mano de Obra / Cal</TableHead>
                    <TableHead className="text-right">C&amp;R</TableHead>
                    <TableHead className="text-right">Equipos</TableHead>
                    <TableHead className="text-right">Operación</TableHead>
```

por

```tsx
                    <TableHead className="text-right">{BUCKET_LABELS.mano_obra}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.cr}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.equipos}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.operacion}</TableHead>
```

10. Sustituir

```tsx
                            const b = bucketForCategory(it.categoria);
```

por

```tsx
                            const b = bucketForCategory(it.categoria, mapa);
```

- [ ] **Step 12: No queda ninguna llamada antigua ni ningún nombre viejo**

Run: `grep -rn "Mano de Obra\|\"Operación\"\|label: \"C&R\"\|C&amp;R" src --include=*.ts --include=*.tsx`
Expected: ninguna coincidencia. El `cr: "C&R"` de `tech-service-categories-form.tsx` es de Servicio Técnico y no sale con este patrón.

Run: `grep -rn "bucketForCategory(" src --include=*.ts --include=*.tsx`
Expected: todas las llamadas llevan dos argumentos, y la definición está en `customer-item.ts`.

- [ ] **Step 13: Tipos, lint y tests**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**.

Run: `npx vitest run`
Expected: **398 passed, 1 skipped**. Son 5 más que tras la Task 3: 4 en customer-item y 1 en analytics-comercial.

- [ ] **Step 14: Commit**

```bash
git add src/lib/customer-item.ts src/lib/analytics-comercial.ts src/lib/customer-detail.ts src/lib/dashboard-insights.ts src/lib/__tests__/customer-item.test.ts src/lib/__tests__/analytics-comercial.test.ts src/lib/__tests__/customer-detail.test.ts src/lib/__tests__/dashboard-insights.test.ts src/components/charts/comercial/bucket-mix-card.tsx src/components/charts/comercial/bucket-by-client-card.tsx src/components/charts/comercial/season-by-bucket-card.tsx src/components/customers/customer-bucket-mix-card.tsx src/components/charts/dashboard/category-mix-donut.tsx "src/app/(dashboard)/cliente-articulo/page.tsx"
git commit -m "feat(graficos): las macro-categorias salen de la configuracion"
```

---

## Task 5: Tarjeta «Macro-categorías» en Configuración

**Files:**
- Modify: `e2e/db/seed-app.mjs`
- Modify: `e2e/constants.ts`
- Create: `e2e/specs/macro-categorias.spec.ts`
- Modify: `e2e/specs/charts.spec.ts` (solo un comentario)
- Create: `src/app/(dashboard)/settings/_components/grupo-categorias.tsx`
- Modify: `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`
- Create: `src/app/(dashboard)/settings/_components/macro-categories-form.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Semilla y constantes E2E**

En `e2e/db/seed-app.mjs`, sustituir

```js
// tech_service_bucket (migracion 0011): una categoria inventada en cada grupo de
// Servicio Tecnico y otra sin clasificar. Debe coincidir con TECH_SERVICE_SEED de
// e2e/constants.ts.
const CATEGORIES = [
  { name: "Aguas", color: "#2563eb", sort_order: 1, tech_service_bucket: "st" },
  { name: "Aire", color: "#16a34a", sort_order: 2, tech_service_bucket: "cr" },
  { name: "Suelos", color: "#ca8a04", sort_order: 3, tech_service_bucket: null },
];
```

por

```js
// tech_service_bucket (migracion 0011): una categoria inventada en cada grupo de
// Servicio Tecnico y otra sin clasificar. Debe coincidir con TECH_SERVICE_SEED de
// e2e/constants.ts.
// macro_categoria (migracion 0013): Aguas en Mano de obra, Aire en Consumos y
// repuestos y Suelos sin marcar, asi que cuenta como Equipos. Debe coincidir con
// MACRO_SEED de e2e/constants.ts.
const CATEGORIES = [
  { name: "Aguas", color: "#2563eb", sort_order: 1, tech_service_bucket: "st", macro_categoria: "mano_obra" },
  { name: "Aire", color: "#16a34a", sort_order: 2, tech_service_bucket: "cr", macro_categoria: "cr" },
  { name: "Suelos", color: "#ca8a04", sort_order: 3, tech_service_bucket: null, macro_categoria: null },
];
```

y sustituir

```js
        `INSERT INTO categories (company_id, name, color, sort_order, is_active, tech_service_bucket)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [company.id, cat.name, cat.color, cat.sort_order, cat.tech_service_bucket],
```

por

```js
        `INSERT INTO categories (company_id, name, color, sort_order, is_active, tech_service_bucket, macro_categoria)
         VALUES ($1, $2, $3, $4, true, $5, $6) RETURNING id`,
        [company.id, cat.name, cat.color, cat.sort_order, cat.tech_service_bucket, cat.macro_categoria],
```

En `e2e/constants.ts`, justo después de `TECH_SERVICE_SEED`, añadir

```ts

/**
 * Macro-categorías que deja e2e/db/seed-app.mjs: una categoría inventada en Mano de
 * obra, otra en Consumos y repuestos y otra sin marcar, que cuenta como Equipos.
 */
export const MACRO_SEED = { mano_obra: "Aguas", cr: "Aire", sinMarcar: "Suelos" } as const;
```

En `e2e/specs/charts.spec.ts`, sustituir

```ts
  // Primero se espera a que haya barras: garantiza que el gráfico ya se pintó.
  // Con la semilla, todas las categorías caen en "Equipos", así que hay una
  // barra de un solo tramo por año.
```

por

```ts
  // Primero se espera a que haya barras: garantiza que el gráfico ya se pintó.
  // Con la semilla (e2e/db/seed-app.mjs), Aguas es Mano de obra, Aire es Consumos y
  // repuestos y Suelos, sin marcar, Equipos: cada año apila hasta tres tramos.
```

- [ ] **Step 2: Escribir el E2E que falla**

Crear `e2e/specs/macro-categorias.spec.ts` (y convertirlo a CRLF):

```ts
import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, MACRO_SEED } from "../constants";

// Nombres de los grupos: los de BUCKET_LABELS (src/lib/customer-item.ts).
const MANO_OBRA = "Mano de obra";
const CR = "Consumos y repuestos";
const EQUIPOS = "Equipos";
const OPERACIONES = "Operaciones";
const GUARDAR = "Guardar macro-categorías";

// Busca la tarjeta por su título. Ninguna otra tarjeta de /settings contiene
// «Macro-categorías», y esta no contiene «Categorías de Servicio Técnico», que es lo que
// busca el spec de esa tarjeta.
function tarjeta(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: "Macro-categorías" });
}

/**
 * Deja la clasificación como la siembra e2e/db/seed-app.mjs: Aire en Consumos y
 * repuestos. Otros specs comparten la base en la misma ejecución y no deben depender de
 * que este corra el último. Si el test falló antes de guardar, no hay nada que guardar y
 * el botón está apagado.
 */
async function restaurarMacro(page: Page) {
  await page.goto("/settings");
  const card = tarjeta(page);
  // Espera a que la tarjeta tenga datos: sin esto, los count() de abajo mirarían listas
  // que aún no se han pintado.
  await expect(card.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();

  if ((await card.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr).count()) > 0) {
    await card.getByRole("button", { name: `Quitar ${MACRO_SEED.cr} de ${OPERACIONES}` }).click();
  }
  if ((await card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr).count()) === 0) {
    await card.getByRole("button", { name: `Elegir ${CR}` }).click();
    await page.getByRole("option", { name: MACRO_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
  }
  const guardar = card.getByRole("button", { name: GUARDAR });
  if (await guardar.isEnabled()) {
    await guardar.click();
    await expect(page.getByText("Macro-categorías guardadas")).toBeVisible();
  }

  await page.reload();
  const tras = tarjeta(page);
  await expect(tras.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
  await expect(tras.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toHaveCount(0);
}

// El lector va primero: no cambia nada, y así no depende de que la restauración del
// admin haya ido bien.
test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("ve las macro-categorias pero no puede cambiarlas", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    await expect(card.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();
    await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
    // Suelos no está marcada: no sale en ninguna lista, y cuenta como Equipos.
    await expect(card.getByText(MACRO_SEED.sinMarcar)).toHaveCount(0);

    // Sin desplegables, sin quitar etiquetas y sin botón de guardar.
    for (const grupo of [MANO_OBRA, CR, EQUIPOS, OPERACIONES]) {
      await expect(card.getByRole("button", { name: `Elegir ${grupo}` })).toHaveCount(0);
    }
    await expect(card.getByRole("button", { name: /^Quitar / })).toHaveCount(0);
    await expect(card.getByRole("button", { name: GUARDAR })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: APPROVED_STATE });

  test("una categoria marcada en un grupo aparece desactivada en los demas", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: `Elegir ${MANO_OBRA}` }).click();
    // Regex y no texto exacto: el nombre accesible junta los dos span sin espacio
    // garantizado entre el nombre y la nota.
    const enCr = page.getByRole("option", { name: new RegExp(`^${MACRO_SEED.cr}\\s*en ${CR}$`) });
    await expect(enCr).toBeVisible();
    await expect(enCr).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
  });

  test("mover una categoria de macro-categoria persiste al recargar", async ({ page }) => {
    // Un guardado, una recarga y la restauración: más que el minuto por defecto en la
    // máquina local.
    test.setTimeout(120_000);
    try {
      await page.goto("/settings");
      const card = tarjeta(page);
      await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
      const guardar = card.getByRole("button", { name: GUARDAR });
      // Sin cambios no hay nada que guardar.
      await expect(guardar).toBeDisabled();

      // La X la saca de Consumos y repuestos...
      await card.getByRole("button", { name: `Quitar ${MACRO_SEED.cr} de ${CR}` }).click();
      await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toHaveCount(0);

      // ...y ya se puede marcar en Operaciones, donde no sale desactivada.
      await card.getByRole("button", { name: `Elegir ${OPERACIONES}` }).click();
      await page.getByRole("option", { name: MACRO_SEED.cr, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(card.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toBeVisible();

      await guardar.click();
      await expect(page.getByText("Macro-categorías guardadas")).toBeVisible();
      // Lo guardado ya es lo que se ve: el botón se apaga hasta el siguiente cambio.
      await expect(guardar).toBeDisabled();

      await page.reload();
      const tras = tarjeta(page);
      // Primero lo que tiene que estar: así se espera a que la tarjeta cargue antes de
      // comprobar lo que no tiene que estar.
      await expect(tras.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toBeVisible();
      await expect(tras.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();
      await expect(tras.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toHaveCount(0);
    } finally {
      await restaurarMacro(page);
    }
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Con Docker Desktop arrancado, el puerto 3100 libre y al menos 60 s desde la última ejecución de Playwright:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/macro-categorias.spec.ts
```

Expected: FAIL en los 3 tests, porque la tarjeta «Macro-categorías» no existe. El reset tiene que completarse sin errores: la semilla ya escribe en la columna `macro_categoria` de la Task 1.

- [ ] **Step 4: Componente de grupo compartido**

Crear `src/app/(dashboard)/settings/_components/grupo-categorias.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { grupoDe, type Seleccion } from "@/lib/seleccion-grupos";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Lo que un grupo necesita saber de cada categoría. */
export interface CategoriaDeGrupo {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * Un grupo de una tarjeta de clasificación: el desplegable con buscador (solo para
 * quien edita) y las etiquetas de lo marcado. Lo comparten «Categorías de Servicio
 * Técnico» y «Macro-categorías».
 *
 * Las etiquetas salen de la selección y no de las categorías activas, para que una
 * inactiva ya clasificada se siga viendo. Si no se viera, desaparecería del grupo al
 * guardar sin que nadie lo hubiera decidido.
 *
 * `corto` es el nombre de cada grupo que se usa en la nota junto a una categoría que ya
 * está en otro grupo y al final del nombre accesible del botón de quitar.
 */
export function GrupoCategorias<G extends string>({
  bucket,
  titulo,
  corto,
  seleccion,
  activas,
  porId,
  editable,
  onToggle,
}: {
  bucket: G;
  titulo: string;
  corto: Record<G, string>;
  seleccion: Seleccion<G>;
  activas: CategoriaDeGrupo[];
  porId: Map<string, CategoriaDeGrupo>;
  editable: boolean;
  onToggle: (id: string) => void;
}) {
  const ids = seleccion[bucket];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{titulo}</p>

      {editable && (
        <Popover>
          <PopoverTrigger
            aria-label={`Elegir ${titulo}`}
            className="inline-flex items-center justify-between w-full px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer h-10"
          >
            <span className="truncate flex-1 text-left">
              {ids.length === 0 ? "Seleccionar categorías..." : `${ids.length} seleccionadas`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="start">
            <Command>
              <CommandInput placeholder="Buscar..." />
              <CommandList>
                <CommandEmpty>No hay resultados.</CommandEmpty>
                <CommandGroup>
                  {activas.map((c) => {
                    const grupo = grupoDe(seleccion, c.id);
                    const marcada = grupo === bucket;
                    // En otro grupo: se ve, pero desactivada y con la nota de dónde está.
                    const enOtro = grupo !== null && grupo !== bucket;
                    return (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        disabled={enOtro}
                        onSelect={() => onToggle(c.id)}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                            marcada
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-white/20 opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="flex-1">{c.name}</span>
                        {enOtro && grupo && (
                          <span className="text-[11px] text-muted-foreground">en {corto[grupo]}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <ul aria-label={titulo} className="flex flex-wrap gap-2">
        {ids.length === 0 && <li className="text-xs text-muted-foreground">Ninguna categoría.</li>}
        {ids.map((id) => {
          const c = porId.get(id);
          if (!c) return null;
          return (
            <li key={id}>
              <Badge variant="secondary" className="gap-1">
                {c.name}
                {!c.is_active && " (inactiva)"}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Quitar ${c.name} de ${corto[bucket]}`}
                    onClick={() => onToggle(id)}
                    className="rounded-full hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: La tarjeta de Servicio Técnico usa el grupo compartido**

Reescribir `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx` entero (Write, y convertirlo a CRLF). El comportamiento y los nombres accesibles no cambian:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Wrench } from "lucide-react";
import { getTechServiceCategories, saveTechServiceBuckets } from "@/actions/category-actions";
import { puedeEditarMetas } from "@/lib/commercial-kpis";
import { TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
import {
  alternarCategoria,
  haCambiado,
  seleccionInicial,
  type SeleccionServicioTecnico,
} from "@/lib/tech-service-selection";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TechServiceBucket, TechServiceCategory } from "@/types/database";
import { GrupoCategorias } from "./grupo-categorias";

// Nombre corto de cada grupo. Es la nota junto a una categoría que ya está en el
// otro grupo, y el final del nombre accesible del botón de quitar.
const CORTO: Record<TechServiceBucket, string> = { st: "ST", cr: "C&R" };

const GRUPOS: { bucket: TechServiceBucket; titulo: string }[] = [
  { bucket: "st", titulo: "Categorías de ST (mano de obra)" },
  { bucket: "cr", titulo: "Categorías de C&R (consumibles y repuestos)" },
];

/**
 * Los dos grupos y el botón de guardar. El padre lo remonta con `key` cada vez que
 * llegan datos nuevos, así que el estado inicial no necesita un efecto que lo
 * sincronice con lo guardado.
 */
function TechServiceCategoriesFields({
  categorias,
  editable,
  onSaved,
}: {
  categorias: TechServiceCategory[];
  editable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const inicial = useMemo(() => seleccionInicial(categorias), [categorias]);
  const [seleccion, setSeleccion] = useState<SeleccionServicioTecnico>(inicial);
  const [saving, setSaving] = useState(false);

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  // Los desplegables solo ofrecen las activas: no tiene sentido clasificar ahora una
  // categoría que ya no se usa.
  const activas = useMemo(() => categorias.filter((c) => c.is_active), [categorias]);
  const cambiado = haCambiado(inicial, seleccion);

  const alternar = (bucket: TechServiceBucket, id: string) =>
    setSeleccion((prev) => alternarCategoria(prev, bucket, id));

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveTechServiceBuckets(seleccion.st, seleccion.cr);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Clasificación guardada");
      // Se espera la recarga: si «saving» volviera a false antes, el botón se
      // reactivaría un instante comparando contra la selección inicial ya obsoleta.
      await onSaved();
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {GRUPOS.map((g) => (
          <GrupoCategorias
            key={g.bucket}
            bucket={g.bucket}
            titulo={g.titulo}
            corto={CORTO}
            seleccion={seleccion}
            activas={activas}
            porId={porId}
            editable={editable}
            onToggle={(id) => alternar(g.bucket, id)}
          />
        ))}
      </div>
      {/* El lector solo consulta: sin botón. */}
      {editable && (
        <div className="flex justify-end border-t border-white/10 pt-4">
          <Button onClick={guardar} disabled={!cambiado || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar categorías
          </Button>
        </div>
      )}
    </>
  );
}

export function TechServiceCategoriesForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Todo usuario aprobado ve la clasificación; cambiarla depende del rol, con la misma
  // regla que las metas. El servidor aplica la misma regla: esto solo evita ofrecer
  // algo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
          <Wrench className="size-4 text-primary" /> Categorías de Servicio Técnico
        </CardTitle>
        <CardDescription>
          {editable
            ? "Qué categorías suman como ST (mano de obra) y cuáles como C&R (consumibles y repuestos) en el Análisis de Servicio Técnico y en el KPI de incremento. Una categoría solo puede estar en un grupo."
            : "Qué categorías suman como ST (mano de obra) y cuáles como C&R (consumibles y repuestos) en el Análisis de Servicio Técnico y en el KPI de incremento. Solo lectura."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando categorías…</p>
        ) : (
          <TechServiceCategoriesFields
            key={dataUpdatedAt}
            categorias={data}
            editable={editable}
            // Invalida ["categories"] entero: por prefijo refresca esta consulta, la del
            // gráfico, la del widget y la del KPI, sin recargar la página.
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["categories"] })}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Tarjeta «Macro-categorías»**

Crear `src/app/(dashboard)/settings/_components/macro-categories-form.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Loader2, Save } from "lucide-react";
import { getMacroCategorias, saveMacroCategorias } from "@/actions/category-actions";
import { puedeEditarMetas } from "@/lib/commercial-kpis";
import { BUCKETS, BUCKET_LABELS, MACRO_CATEGORIAS_KEY } from "@/lib/customer-item";
import { alternarCategoria, haCambiado, seleccionPorGrupo, type Seleccion } from "@/lib/seleccion-grupos";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Bucket, MacroCategoria } from "@/types/database";
import { GrupoCategorias } from "./grupo-categorias";

// No debe contener «Categorías de Servicio Técnico»: el E2E de esa tarjeta la busca por
// ese texto y encontraría dos.
const DESCRIPCION =
  "Qué categorías suman en cada macro-categoría en los gráficos de mezcla, en Cliente × Artículo y en sus exportaciones. Lo que no esté marcado cuenta como Equipos. Una categoría solo puede estar en una macro-categoría.";

/**
 * Los cuatro grupos y el botón de guardar. El padre lo remonta con `key` cada vez que
 * llegan datos nuevos, así que el estado inicial no necesita un efecto que lo
 * sincronice con lo guardado.
 */
function MacroCategoriasFields({
  categorias,
  editable,
  onSaved,
}: {
  categorias: MacroCategoria[];
  editable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const inicial = useMemo(
    () => seleccionPorGrupo(BUCKETS, categorias.map((c) => ({ id: c.id, grupo: c.macro_categoria }))),
    [categorias]
  );
  const [seleccion, setSeleccion] = useState<Seleccion<Bucket>>(inicial);
  const [saving, setSaving] = useState(false);

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  // Los desplegables solo ofrecen las activas: no tiene sentido clasificar ahora una
  // categoría que ya no se usa. Las inactivas ya marcadas siguen como etiqueta.
  const activas = useMemo(() => categorias.filter((c) => c.is_active), [categorias]);
  const cambiado = haCambiado(inicial, seleccion);

  const alternar = (bucket: Bucket, id: string) =>
    setSeleccion((prev) => alternarCategoria(prev, bucket, id));

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveMacroCategorias(seleccion);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Macro-categorías guardadas");
      // Se espera la recarga: si «saving» volviera a false antes, el botón se
      // reactivaría un instante comparando contra la selección inicial ya obsoleta.
      await onSaved();
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {BUCKETS.map((b) => (
          <GrupoCategorias
            key={b}
            bucket={b}
            titulo={BUCKET_LABELS[b]}
            corto={BUCKET_LABELS}
            seleccion={seleccion}
            activas={activas}
            porId={porId}
            editable={editable}
            onToggle={(id) => alternar(b, id)}
          />
        ))}
      </div>
      {/* El lector solo consulta: sin botón. */}
      {editable && (
        <div className="flex justify-end border-t border-white/10 pt-4">
          <Button onClick={guardar} disabled={!cambiado || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar macro-categorías
          </Button>
        </div>
      )}
    </>
  );
}

export function MacroCategoriasForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Todo usuario aprobado ve la clasificación; cambiarla es de Admin y Editor. El
  // servidor aplica la misma regla: esto solo evita ofrecer algo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
          <Layers className="size-4 text-primary" /> Macro-categorías
        </CardTitle>
        <CardDescription>{editable ? DESCRIPCION : `${DESCRIPCION} Solo lectura.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando categorías…</p>
        ) : (
          <MacroCategoriasFields
            key={dataUpdatedAt}
            categorias={data}
            editable={editable}
            // Invalida ["categories"] entero: por prefijo refresca esta tarjeta y todos
            // los gráficos que clasifican por macro-categoría, sin recargar la página.
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["categories"] })}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Montar la tarjeta en Configuración**

En `src/app/(dashboard)/settings/page.tsx`, sustituir

```tsx
import { TechServiceCategoriesForm } from "./_components/tech-service-categories-form";
```

por

```tsx
import { TechServiceCategoriesForm } from "./_components/tech-service-categories-form";
import { MacroCategoriasForm } from "./_components/macro-categories-form";
```

y sustituir

```tsx
      <TechServiceCategoriesForm />
    </div>
```

por

```tsx
      <TechServiceCategoriesForm />

      <MacroCategoriasForm />
    </div>
```

- [ ] **Step 8: Tipos, lint y tests unitarios**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**.

Run: `npx vitest run`
Expected: **398 passed, 1 skipped**. Esta tarea no añade tests unitarios.

- [ ] **Step 9: Ejecutar los E2E de las dos tarjetas y ver que pasan**

Con el puerto 3100 libre y al menos 60 s desde la ejecución anterior:

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/macro-categorias.spec.ts e2e/specs/tech-service-categories.spec.ts
```

Expected: PASS en los 3 tests nuevos y en los 3 de Servicio Técnico. Estos últimos prueban que extraer `GrupoCategorias` no ha cambiado la tarjeta vieja.

- [ ] **Step 10: Commit**

```bash
git add e2e/db/seed-app.mjs e2e/constants.ts e2e/specs/macro-categorias.spec.ts e2e/specs/charts.spec.ts "src/app/(dashboard)/settings/_components/grupo-categorias.tsx" "src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx" "src/app/(dashboard)/settings/_components/macro-categories-form.tsx" "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(configuracion): tarjeta de macro-categorias"
```

---

## Task 6: Verificación final y despliegue

**Files:** ninguno, solo verificación. Si alguna comprobación obliga a cambiar código, el arreglo va en un commit nuevo `fix(...)`, nunca con `--amend`.

- [ ] **Step 1: Tipos**

Run: `npx tsc --noEmit`
Expected: sin salida (0 errores).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**, los mismos que antes de empezar.

- [ ] **Step 3: Tests unitarios**

Run: `npx vitest run`
Expected: todo en verde. Sobre la línea base de 373 passed y 1 skipped se suman 25 tests:
- 6 de `validation-macro-categorias.test.ts` (Task 1);
- 10 de `seleccion-grupos.test.ts` (Task 2);
- 4 de `customer-item.test.ts` en la Task 3;
- 4 de `customer-item.test.ts` y 1 de `analytics-comercial.test.ts` en la Task 4.

Resultado esperado: **398 passed, 1 skipped**. Si sale menos, comprobar que no se ha perdido ningún test al reescribir `customer-item.test.ts` (debe tener 14) y que los 12 de `tech-service-selection.test.ts` siguen ahí.

- [ ] **Step 4: E2E completo**

Con Docker Desktop arrancado (`"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` si hace falta), el puerto 3100 libre (`netstat -ano | grep ":3100"`) y al menos 60 s desde la última ejecución de Playwright:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run test:e2e
```

Expected: los 65 de la línea base más los 3 nuevos de `macro-categorias.spec.ts`, es decir **68 passed**. Si un test cae por timeout en una página lenta, es ambiental: se repite ese spec pasado el minuto antes de tocar código.

- [ ] **Step 5: No quedan reglas de nombre ni nombres viejos**

Run: `grep -rn "startsWith(\"C&R \")\|startsWith(\"CAL \")" src`
Expected: solo en `src/lib/__tests__/customer-item.test.ts`, dentro de `reglasAntiguas` y `marcaDeLaMigracion` del test de coherencia.

Run: `grep -rn "Mano de Obra\|Operación\"" src e2e`
Expected: ninguna coincidencia.

- [ ] **Step 6: Nota de despliegue**

Tres pasos, en este orden.

**1. Consulta previa (solo lectura).** Sirve para ver qué ventas pasarían a Equipos porque su categoría del hub no existe en la app. Son dos consultas sobre dos bases distintas; se comparan a mano, sin distinguir mayúsculas.

Consulta A, en la base del hub **`zoho-hub`**. Lista los nombres de categoría con ventas que las reglas de antes no mandaban a Equipos. La spec pedía solo «C&R » y «CAL », pero `ST`, `ST …`, `Alquileres`, `Operación de Redes` y `Consultoría` tampoco se clasificarán si no existen en la app, así que la consulta también los incluye:

```sql
SELECT DISTINCT it.category_name
FROM books.items it
WHERE (it.category_name LIKE 'C&R %' OR it.category_name LIKE 'CAL %'
       OR it.category_name = 'ST' OR it.category_name LIKE 'ST %'
       OR it.category_name IN ('Alquileres', 'Operación de Redes', 'Consultoría'))
  AND (EXISTS (SELECT 1 FROM books.invoice_line_items l WHERE l.item_id = it.item_id)
       OR EXISTS (SELECT 1 FROM books.salesorder_line_items l WHERE l.item_id = it.item_id))
ORDER BY 1;
```

Consulta B, en la base de la app **`sales_tracker`**. Lista las categorías de la app con esos mismos nombres:

```sql
SELECT name
FROM categories
WHERE name LIKE 'C&R %' OR name LIKE 'CAL %'
   OR name = 'ST' OR name LIKE 'ST %'
   OR name IN ('Alquileres', 'Operación de Redes', 'Consultoría')
ORDER BY 1;
```

Cada nombre que salga en A y no en B cambiará de macro-categoría al desplegar: sus ventas pasarán a Equipos en Cliente × Artículo, en la tarjeta por cliente, en la de temporada y en el detalle de cliente. El mix anual y el donut ya ignoraban esas ventas. Antes de seguir, el usuario decide con cada uno:
- crear la categoría en la app y clasificarla después en Configuración;
- o aceptar el cambio.

**2. Migración en `sales_tracker`,** antes de desplegar:

```bash
PGCLIENTENCODING=UTF8 psql "$DATABASE_URL" -f drizzle/0013_macro_categoria.sql
```

`PGCLIENTENCODING=UTF8` asegura que los nombres con tilde de los `UPDATE`, como «Operación de Redes» y «Consultoría», llegan bien si se lanza desde Windows. La migración es aditiva y se puede volver a ejecutar: sus `UPDATE` solo tocan categorías sin macro-categoría.

Comprobación:

```sql
SELECT macro_categoria, count(*) FROM categories GROUP BY 1 ORDER BY 1;
```

Deben salir filas `cr`, `mano_obra` y `operacion` con los recuentos que correspondan a la consulta B, y el resto en `NULL`, que cuenta como Equipos.

**3. Desplegar la app.** Con la migración aplicada, las cifras de los gráficos son las mismas que antes para toda categoría que exista en la app. Solo cambian las del punto 1 que el usuario haya decidido aceptar.
