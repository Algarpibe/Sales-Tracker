# Categorías de Servicio Técnico configurables — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin y Editor eligen en Configuración qué categorías cuentan como **ST** (mano de obra) y cuáles como **C&R** (consumibles y repuestos). El Lector ve la clasificación pero no puede cambiarla. Se eliminan las listas fijas `ST_CATEGORIES` y `CR_CATEGORIES`.

**Architecture:** La columna nueva `categories.tech_service_bucket` (`'st' | 'cr' | NULL`) guarda el grupo de cada categoría. La función pura `gruposServicioTecnico(categorias)` convierte las categorías en un `Map<string, TechServiceBucket>` indexado por id. Ese mapa alimenta `buildTechServiceData` (el gráfico de `/analytics` y el widget del dashboard) y `stGrowthByQuarter` (el KPI de la tabla comercial). Los tres consumidores leen las categorías con la misma acción, `getTechServiceCategories()`, y la misma clave de react-query, `["categories", "servicio-tecnico"]`. La escritura se hace con `saveTechServiceBuckets(st, cr)`, validada con zod y limitada a Admin y Editor. La interfaz es una tarjeta nueva en Configuración. Su lógica de selección vive en funciones puras con tests.

**Tech Stack:** Next 16, React, @tanstack/react-query v5, Drizzle ORM 0.45, zod 4, base-ui (`@base-ui/react`, no Radix: se usa `render={}` en lugar de `asChild`), cmdk, vitest (entorno node, solo funciones puras) y Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-categorias-servicio-tecnico-design.md`.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash sobre Windows.
- **Rama:** `feat/categorias-servicio-tecnico`, ya creada y con la spec commiteada (`3f51e56`). No cambies de rama ni hagas push.
- **Repo público:** no pongas nombres reales de clientes ni importes reales en el código, los tests, los comentarios ni la documentación. La semilla E2E usa solo datos inventados. Los 27 nombres de categoría de la migración ya son públicos: están hoy en `src/lib/tech-service.ts`.
- **Commits:** convencionales, en español **sin tildes ni eñes**, y **sin** `Co-Authored-By` ni ninguna atribución a IA. Un commit por task. Añade con `git add` solo los ficheros de la task.
- **No reescribas la historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **No uses `sed -i`:** en la copia de trabajo los ficheros tienen finales CRLF (`core.autocrlf=true`) y el repo los guarda en LF. `sed -i` reescribiría el fichero entero. Edita con la herramienta Edit, o con scripts de node que conserven el CRLF.
- **Comentarios de código:** en español y explicando el **porqué**. Los de `src/` llevan tildes, como el resto de cada fichero. Los nombres de `it(...)`, los comentarios de `e2e/` y los de los `.sql` van sin tildes, como los existentes.
- **Migraciones:** `0011` es un SQL manual en `drizzle/`. La `0009` está reservada para el reset de contraseña: no la uses. No toques `drizzle/meta/_journal.json`, que solo llega a la `0001`.
- **Permisos:** las lecturas usan `requireApproved()` y las escrituras `requireRole(...ROLES_EDITAN_METAS)`. Toda escritura filtra por `company_id = profile.company_id`.
- **Tipos:** `npx tsc --noEmit` no debe mostrar nada.
- **Lint:** el punto de partida es exactamente **10 warnings y 0 errores**. Ninguna task puede sumar warnings: un import sin usar ya suma uno, y una dependencia sobrante en `useMemo` también.
- **Vitest:** hoy hay **306 pasados + 1 saltado**. No hay librería para testear componentes: solo se testean funciones puras.
- **E2E:** hoy pasan **57**. Antes de lanzar Playwright:
  - Docker Desktop tiene que estar arrancado. Si no lo está: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &`, y espera a que `docker info` responda.
  - Usa siempre `E2E_PG_PORT=55433`.
  - El puerto 3100 tiene que estar libre.
  - Deja **al menos 60 s entre ejecuciones de Playwright**. El login admite 5 intentos por minuto y el setup gasta 3.
  - `npm run test:e2e` ya reinicia la base (`e2e:db:reset`) en cada ejecución.

## Contexto verificado (2026-09-25)

- `src/lib/tech-service.ts:7-16` define `ST_CATEGORIES` (12 nombres) y `CR_CATEGORIES` (15 nombres). Las usan:
  - `buildTechServiceData` (37-75), que compara `catMap.get(category_id)` por **nombre**;
  - `acumuladoServicioTecnico` (101-115, privada), que alimenta `stGrowthByQuarter` (125-140).
- `src/lib/__tests__/tech-service.test.ts` importa las dos constantes (línea 2) para construir su `catMap`. Ningún otro fichero de `src/` ni de `e2e/` las usa. Solo aparecen además en planes y specs antiguos de `docs/`, que no se tocan.
- **`getCategories()` (`src/actions/category-actions.ts:11-27`) filtra `is_active = true`.** Con esa consulta, `gruposServicioTecnico` no podría incluir las inactivas, como pide la spec. Por eso el plan añade `getTechServiceCategories()`, que devuelve todas las categorías de la compañía. Su clave, `["categories", "servicio-tecnico"]`, cuelga de `["categories"]`: invalidar `["categories"]` también la refresca, porque react-query invalida por prefijo.
- **El widget no carga categorías.** `TechServiceWidget` (`src/components/charts/dashboard/tech-service-widget.tsx`) recibe `catMap` por props desde `src/lib/widget-registry.tsx:157-159`. El registro lo saca de `WidgetContext.catMap`, que construye `src/components/dashboard/dashboard-data-provider.tsx:51` con `getCategories()`: solo categorías activas y por nombre. El plan hace que el widget lea la clasificación él mismo, con la misma clave. El `catMap` del contexto se queda, porque lo sigue usando `CategoryMixDonut`.
- `src/app/(dashboard)/analytics/page.tsx:152-155` carga `["categories"]`; `:183-186` construye el `catMap`. `categories` se sigue usando en `GroupingAnalysisCard` (287), así que esa consulta se mantiene.
- `src/components/charts/comercial/commercial-kpi-table.tsx`:
  - `:340` hace la consulta `["categories"]`;
  - `:354` construye `categorias`;
  - `:372-378` construye el `catMap` y llama a `stGrowthByQuarter`;
  - `:50` importa `Category`, que solo se usa en la línea 354.
- `ROLES_EDITAN_METAS = ["admin", "editor"] as const` y `puedeEditarMetas(role)` están en `src/lib/commercial-kpis.ts:95-99`.
- `requireApproved()` garantiza que `profile` no es nulo (`src/lib/auth/guards.ts:37-45`). `runAction` convierte un `ZodError` en `{ ok: false, error: issues[0].message }` (`src/lib/errors.ts:33-46`).
- `uuidSchema = z.string().uuid("ID inválido")` (`src/lib/validation.ts:15`). Con zod 4 la validación sigue el RFC, así que los UUID de los tests deben ser válidos (por ejemplo `11111111-1111-4111-8111-111111111111`).
- En `src/db/schema.ts` ya se importan `check` y `sql`. La tabla `categories` está en las líneas 113-123.
- **Cómo crea el esquema el E2E:** `e2e/db/reset.mjs` recrea las bases y llama a `applyMigrations` (`e2e/db/apply-migrations.mjs`). Esa función aplica **todos** los `drizzle/*.sql` en orden alfabético, cada uno en su propia transacción. La `0011` se aplica sola, sin tocar nada. Después, `seedApp` siembra las categorías inventadas `Aguas`, `Aire` y `Suelos`. Los `UPDATE` de la `0011` no encuentran ninguna de ellas, así que la semilla es la que las clasifica.
- `getSalesData` (hub) mapea las ventas a categorías de la app **sin** filtrar por `is_active`. Las ventas de categorías inactivas llegan a los consumidores. Hoy no cuentan solo porque el `catMap` se construye con las categorías activas.
- UI: `Popover`/`PopoverTrigger`/`PopoverContent` son base-ui (el Trigger ya es un `<button>`). `Command*` es cmdk 1.1, y `CommandItem` admite `disabled` y `value`. `Badge` admite las variantes `default | secondary | destructive | outline | ghost | link`.
- La tarjeta de metas (`settings/_components/kpi-targets-form.tsx`) sirve de modelo:
  - la clase de la `Card` es `border-border/40 bg-card/30 backdrop-blur-sm`;
  - `editable = puedeEditarMetas(profile?.role)`;
  - la descripción termina en «Solo lectura.» para el lector;
  - el componente interior se remonta con `key`.

## Estructura de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `drizzle/0011_tech_service_bucket.sql` | crear | Columna, CHECK idempotente y clasificación inicial copiada de las listas fijas. |
| `src/db/schema.ts` | modificar | Columna `tech_service_bucket` y su `check` en `categories`. |
| `src/types/database.ts` | modificar | `TechServiceBucket`, campo nuevo en `Category` e interfaz `TechServiceCategory`. |
| `src/actions/category-actions.ts` | modificar | `getTechServiceCategories()` (lectura) y `saveTechServiceBuckets(st, cr)` (escritura). |
| `src/lib/validation.ts` | modificar | `techServiceBucketsSchema`. |
| `src/lib/__tests__/validation-tech-service.test.ts` | crear | Tests del esquema. |
| `src/lib/tech-service.ts` | modificar | Quita las listas fijas. Añade `gruposServicioTecnico`, `TECH_SERVICE_CATEGORIES_KEY` y `acumuladoServicioTecnico` exportada. |
| `src/lib/__tests__/tech-service.test.ts` | modificar | Tests adaptados al mapa, tests de `gruposServicioTecnico` y test de coherencia. |
| `src/app/(dashboard)/analytics/page.tsx` | modificar | El gráfico usa la clasificación guardada. |
| `src/components/charts/dashboard/tech-service-widget.tsx` | modificar | El widget lee la clasificación él mismo. |
| `src/lib/widget-registry.tsx` | modificar | Deja de pasar `catMap` al widget. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | modificar | El KPI usa la clasificación guardada. |
| `src/lib/tech-service-selection.ts` | crear | Lógica pura de selección: estado inicial, alternar con exclusión mutua, grupo de una categoría y detección de cambios. |
| `src/lib/__tests__/tech-service-selection.test.ts` | crear | Tests de esa lógica. |
| `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx` | crear | Tarjeta «Categorías de Servicio Técnico». |
| `src/app/(dashboard)/settings/page.tsx` | modificar | Monta la tarjeta debajo de `KpiTargetsForm`. |
| `e2e/db/seed-app.mjs` | modificar | Clasifica `Aguas` como ST y `Aire` como C&R. |
| `e2e/constants.ts` | modificar | `TECH_SERVICE_SEED`. |
| `e2e/specs/tech-service-categories.spec.ts` | crear | Pruebas E2E del lector y del admin. |

Tipos y nombres fijos en todo el plan:
- `type TechServiceBucket = "st" | "cr"`;
- `interface TechServiceCategory { id; name; color; is_active; tech_service_bucket: TechServiceBucket | null }`;
- `gruposServicioTecnico(categorias): Map<string, TechServiceBucket>`;
- `TECH_SERVICE_CATEGORIES_KEY = ["categories", "servicio-tecnico"] as const`;
- `getTechServiceCategories(): Promise<TechServiceCategory[]>`;
- `saveTechServiceBuckets(st: string[], cr: string[]): Promise<ActionResult>`;
- `techServiceBucketsSchema`;
- `interface SeleccionServicioTecnico { st: string[]; cr: string[] }`.

---

## Task 1: Columna `tech_service_bucket`, tipos y lectura

**Files:**
- Create: `drizzle/0011_tech_service_bucket.sql`
- Modify: `src/db/schema.ts` (tabla `categories`, líneas 113-123)
- Modify: `src/types/database.ts` (interfaz `Category`, líneas 47-57)
- Modify: `src/actions/category-actions.ts`

Una migración no se puede probar con vitest. Aquí la prueba que falla primero es la comprobación contra la base E2E: la columna todavía no existe.

- [ ] **Paso 1: Levantar la base E2E y escribir la comprobación que falla**

Arranca Docker Desktop si no está arrancado, y levanta y reinicia la base:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset
```

Crea el script de comprobación en el scratchpad, **no** dentro del repo: `$SCRATCH/check-0011.mjs`, donde `$SCRATCH` es el directorio de scratchpad de la sesión. Importa `pg` y `config.mjs` con rutas absolutas del repo:

```js
// Comprueba la migracion 0011 contra la base E2E: columna, CHECK e idempotencia.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = process.env.REPO;
const { default: pg } = await import(pathToFileURL(path.join(REPO, "node_modules/pg/lib/index.js")).href);
const { APP_URL } = await import(pathToFileURL(path.join(REPO, "e2e/db/config.mjs")).href);

const c = new pg.Client({ connectionString: APP_URL });
await c.connect();
try {
  const { rows } = await c.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'tech_service_bucket'"
  );
  console.log("columna:", rows.length === 1 ? "ok" : "FALTA");
  try {
    await c.query("UPDATE categories SET tech_service_bucket = 'xx'");
    console.log("check: FALTA");
  } catch (e) {
    console.log("check:", e.code === "23514" ? "ok" : `error inesperado ${e.code} ${e.message}`);
  }
  // Volver a aplicar el fichero no debe fallar (ADD COLUMN IF NOT EXISTS + duplicate_object).
  await c.query(readFileSync(path.join(REPO, "drizzle/0011_tech_service_bucket.sql"), "utf8"));
  console.log("idempotente: ok");
} finally {
  await c.end();
}
```

- [ ] **Paso 2: Ejecutarla y ver que falla**

```bash
REPO="$(pwd)" E2E_PG_PORT=55433 node "$SCRATCH/check-0011.mjs"
```

Esperado: `columna: FALTA`. Después, el script termina con un error de `readFileSync` (ENOENT), porque el fichero `0011` todavía no existe. El `UPDATE` también falla, con `error inesperado 42703` (columna inexistente).

- [ ] **Paso 3: Crear la migración `drizzle/0011_tech_service_bucket.sql`**

```sql
-- Grupo de Servicio Tecnico de cada categoria: 'st' (mano de obra), 'cr'
-- (consumibles y repuestos) o NULL si no cuenta. Sustituye a las listas fijas
-- ST_CATEGORIES y CR_CATEGORIES de src/lib/tech-service.ts. Una sola columna
-- garantiza que una categoria no este en los dos grupos, y al indexar por
-- categoria (no por nombre) renombrarla no la saca de su grupo.
--
-- Cambio aditivo. Aplicar a mano en la BD del app ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0011_tech_service_bucket.sql
--
-- Los UPDATE copian las listas fijas de hoy. Solo cambian las cifras si alguna
-- categoria inactiva lleva uno de estos nombres: antes no contaba y ahora si.
-- No volver a ejecutar despues de cambiar la clasificacion desde
-- Configuracion: los UPDATE la devolverian a las listas de partida.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tech_service_bucket text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE categories ADD CONSTRAINT categories_tech_service_bucket_check
		CHECK (tech_service_bucket IS NULL OR tech_service_bucket IN ('st', 'cr'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
UPDATE categories SET tech_service_bucket = 'st' WHERE name IN (
	'Alquileres', 'CAL CO', 'CAL NOx', 'CAL O3', 'CAL PM', 'CAL SO2', 'ST',
	'ST APMA', 'ST APNA', 'ST APOA', 'ST APSA', 'ST EDM 180'
);
--> statement-breakpoint
UPDATE categories SET tech_service_bucket = 'cr' WHERE name IN (
	'C&R AP Series', 'C&R APMA-370', 'C&R APNA-370', 'C&R APOA-370', 'C&R APSA-370',
	'C&R D-R 290', 'C&R EDM 180', 'C&R ENDA Series', 'C&R Enviro', 'C&R OCMA-500',
	'C&R PG Series', 'C&R Series 6103', 'C&R Series 7000', 'C&R Shelter', 'C&R U-50 Series'
);
```

Coteja los nombres, carácter a carácter, con `src/lib/tech-service.ts:7-16`: son 12 de ST y 15 de C&R.

- [ ] **Paso 4: Columna y `check` en `src/db/schema.ts`**

Sustituye el bloque de `categories` (líneas 113-123) por:

```ts
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3b82f6"),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  // Grupo de Servicio Técnico: 'st' (mano de obra), 'cr' (consumibles y repuestos)
  // o NULL si no cuenta. Una sola columna impide que una categoría esté en los dos
  // grupos. Migración 0011.
  tech_service_bucket: text("tech_service_bucket").$type<"st" | "cr">(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("categories_company_name_unique").on(t.company_id, t.name),
  check(
    "categories_tech_service_bucket_check",
    sql`${t.tech_service_bucket} IS NULL OR ${t.tech_service_bucket} IN ('st', 'cr')`
  ),
]);
```

- [ ] **Paso 5: Tipos en `src/types/database.ts`**

Sustituye la interfaz `Category` (líneas 47-57) por:

```ts
/** Grupo de Servicio Técnico de una categoría: ST (mano de obra) o C&R (consumibles y repuestos). */
export type TechServiceBucket = "st" | "cr";

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  tech_service_bucket: TechServiceBucket | null;
  created_at: string;
  updated_at: string;
}

/**
 * Categoría tal como la necesitan el Análisis de Servicio Técnico, su widget, el KPI
 * de incremento y la tarjeta de Configuración: solo lo imprescindible, incluidas las
 * inactivas.
 */
export interface TechServiceCategory {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  tech_service_bucket: TechServiceBucket | null;
}
```

- [ ] **Paso 6: Lectura `getTechServiceCategories()` en `src/actions/category-actions.ts`**

Cambia la importación de tipos, que queda así (añádela debajo de la de `runAction`):

```ts
import type { TechServiceCategory } from "@/types/database";
```

Y añade, justo después de `getCategories()`:

```ts
/**
 * Categorías de la compañía con su grupo de Servicio Técnico, activas e inactivas.
 * A diferencia de getCategories(), no filtra por is_active: una categoría desactivada
 * que sigue clasificada tiene ventas históricas que el gráfico y el KPI deben seguir
 * contando al comparar años.
 */
export async function getTechServiceCategories(): Promise<TechServiceCategory[]> {
  const { profile } = await requireApproved();
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      is_active: categories.is_active,
      tech_service_bucket: categories.tech_service_bucket,
    })
    .from(categories)
    .where(eq(categories.company_id, profile.company_id))
    .orderBy(asc(categories.sort_order), asc(categories.name));
}
```

- [ ] **Paso 7: Reiniciar la base y ver que la comprobación pasa**

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset
REPO="$(pwd)" E2E_PG_PORT=55433 node "$SCRATCH/check-0011.mjs"
```

Esperado:
- el reset lista `migracion aplicada: 0011_tech_service_bucket.sql`;
- la comprobación imprime `columna: ok`, `check: ok` e `idempotente: ok`.

- [ ] **Paso 8: Tipos y lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: `tsc` sin salida, y el lint con 10 warnings y 0 errores.

- [ ] **Paso 9: Commit**

```bash
git add drizzle/0011_tech_service_bucket.sql src/db/schema.ts src/types/database.ts src/actions/category-actions.ts
git commit -m "feat(categorias): columna tech_service_bucket y lectura de la clasificacion de servicio tecnico"
```

---

## Task 2: Validación y guardado de la clasificación

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/lib/__tests__/validation-tech-service.test.ts`
- Modify: `src/actions/category-actions.ts`

- [ ] **Paso 1: Escribir el test que falla**

Crea `src/lib/__tests__/validation-tech-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { techServiceBucketsSchema } from "@/lib/validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("techServiceBucketsSchema", () => {
  it("acepta dos grupos disjuntos", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [A, B], cr: [C] }).success).toBe(true);
  });

  it("acepta grupos vacios: un grupo sin categorias vale 0", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: [] }).success).toBe(true);
  });

  it("rechaza una categoria en los dos grupos", () => {
    const r = techServiceBucketsSchema.safeParse({ st: [A], cr: [A, C] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Una categoría no puede estar en ST y en C&R a la vez");
  });

  it("rechaza duplicados dentro de ST", () => {
    const r = techServiceBucketsSchema.safeParse({ st: [A, A], cr: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Hay categorías repetidas en un grupo");
  });

  it("rechaza duplicados dentro de C&R", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: [B, B] }).success).toBe(false);
  });

  it("rechaza lo que no es UUID", () => {
    expect(techServiceBucketsSchema.safeParse({ st: ["no-es-uuid"], cr: [] }).success).toBe(false);
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: ["Aguas"] }).success).toBe(false);
  });

  it("rechaza que falte un grupo", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [A] }).success).toBe(false);
  });
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

```bash
npx vitest run src/lib/__tests__/validation-tech-service.test.ts
```

Esperado: FAIL. `techServiceBucketsSchema` no existe, así que `safeParse` falla con «Cannot read properties of undefined».

- [ ] **Paso 3: Añadir el esquema al final de `src/lib/validation.ts`**

```ts
// Clasificación de Servicio Técnico: ids de las categorías de cada grupo. Una
// categoría no puede estar en los dos grupos: la columna solo guarda un valor, y
// si llegase en los dos, el segundo UPDATE pisaría al primero sin avisar. Las listas
// vacías valen, porque un grupo sin categorías suma 0.
const idsDeCategoria = z
  .array(uuidSchema)
  .max(1000, "Demasiadas categorías")
  .refine((ids) => new Set(ids).size === ids.length, "Hay categorías repetidas en un grupo");

export const techServiceBucketsSchema = z
  .object({ st: idsDeCategoria, cr: idsDeCategoria })
  .refine((v) => !v.st.some((id) => v.cr.includes(id)), {
    message: "Una categoría no puede estar en ST y en C&R a la vez",
    path: ["cr"],
  });
```

- [ ] **Paso 4: Ejecutarlo y ver que pasa**

```bash
npx vitest run src/lib/__tests__/validation-tech-service.test.ts
```

Esperado: 7 pasados.

- [ ] **Paso 5: Acción `saveTechServiceBuckets` en `src/actions/category-actions.ts`**

Cambia las importaciones de cabecera a:

```ts
import { revalidatePath } from "next/cache";
import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { ROLES_EDITAN_METAS } from "@/lib/commercial-kpis";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  techServiceBucketsSchema,
  uuidSchema,
} from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import type { TechServiceCategory } from "@/types/database";
```

Añade la acción al final del fichero:

```ts
/**
 * Guarda de una vez los dos grupos de Servicio Técnico. Admin y Editor, la misma
 * regla que las metas de KPIs, porque decide qué cuenta en el KPI de incremento.
 * Primero se vacía la clasificación de toda la compañía y después se marcan los dos
 * grupos: así, una categoría que ya no se envía deja de contar. Todo va en una
 * transacción, para que nadie vea la compañía a medio clasificar. El filtro por
 * company_id hace que un id de otra compañía no toque nada.
 */
export async function saveTechServiceBuckets(st: string[], cr: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole(...ROLES_EDITAN_METAS);
    const data = techServiceBucketsSchema.parse({ st, cr });

    await db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({ tech_service_bucket: null })
        .where(eq(categories.company_id, profile.company_id));

      if (data.st.length > 0) {
        await tx
          .update(categories)
          .set({ tech_service_bucket: "st" })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, data.st)));
      }
      if (data.cr.length > 0) {
        await tx
          .update(categories)
          .set({ tech_service_bucket: "cr" })
          .where(and(eq(categories.company_id, profile.company_id), inArray(categories.id, data.cr)));
      }
    });

    revalidatePath("/settings");
    revalidatePath("/analytics");
  });
}
```

- [ ] **Paso 6: Tipos, lint y suite completa**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Esperado:
- `tsc` sin salida;
- el lint con 10 warnings y 0 errores;
- vitest con 313 pasados (306 + 7) y 1 saltado.

- [ ] **Paso 7: Commit**

```bash
git add src/lib/validation.ts src/lib/__tests__/validation-tech-service.test.ts src/actions/category-actions.ts
git commit -m "feat(categorias): guardar la clasificacion de servicio tecnico con validacion"
```

---

## Task 3: El gráfico, el widget y el KPI usan la clasificación guardada

**Files:**
- Modify: `src/lib/tech-service.ts`
- Test: `src/lib/__tests__/tech-service.test.ts`
- Modify: `src/app/(dashboard)/analytics/page.tsx`
- Modify: `src/components/charts/dashboard/tech-service-widget.tsx`
- Modify: `src/lib/widget-registry.tsx`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Paso 1: Reescribir el test para que falle**

Sustituye todo el contenido de `src/lib/__tests__/tech-service.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import {
  acumuladoServicioTecnico,
  buildTechServiceData,
  gruposServicioTecnico,
  stGrowthByQuarter,
  yoy,
  type TechServiceBucket,
} from "@/lib/tech-service";
import type { TechServiceCategory } from "@/types/database";

const rec = (record_month: number, amount_usd: number, category_id: string, record_type = "INVOICE") =>
  ({ record_month, amount_usd, category_id, record_type }) as never;

const cat = (
  id: string,
  tech_service_bucket: TechServiceBucket | null,
  is_active = true,
  name = `Categoria ${id}`
): TechServiceCategory => ({ id, name, color: "#000000", is_active, tech_service_bucket });

// c1 -> ST, c2 -> C&R, c9 -> sin clasificar (no esta en el mapa)
const grupos = new Map<string, TechServiceBucket>([["c1", "st"], ["c2", "cr"]]);

const TODO_EL_ANIO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("gruposServicioTecnico", () => {
  it("devuelve solo las categorias clasificadas, con su grupo", () => {
    const r = gruposServicioTecnico([cat("c1", "st"), cat("c2", "cr"), cat("c3", null)]);
    expect(r.size).toBe(2);
    expect(r.get("c1")).toBe("st");
    expect(r.get("c2")).toBe("cr");
    expect(r.has("c3")).toBe(false);
  });

  it("incluye las inactivas clasificadas: sus ventas historicas siguen contando", () => {
    const r = gruposServicioTecnico([cat("c4", "st", false), cat("c5", null, false)]);
    expect(r.get("c4")).toBe("st");
    expect(r.has("c5")).toBe(false);
  });

  it("clasifica por id: renombrar una categoria no la saca de su grupo", () => {
    const antes = gruposServicioTecnico([cat("c1", "st", true, "Nombre viejo")]);
    const despues = gruposServicioTecnico([cat("c1", "st", true, "Nombre nuevo")]);
    expect(despues).toEqual(antes);
  });

  it("ignora un valor de grupo desconocido", () => {
    const r = gruposServicioTecnico([{ id: "c1", tech_service_bucket: "xx" as never }]);
    expect(r.size).toBe(0);
  });
});

describe("buildTechServiceData", () => {
  it("agrega ST y C&R por trimestre y acumula", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(4, 10, "c1")];
    const r = buildTechServiceData(a, [], grupos, "INVOICE", "QUARTERLY");
    expect(r).toHaveLength(4);
    expect(r[0].st).toBe(100);
    expect(r[0].cr).toBe(50);
    expect(r[0].total).toBe(150);
    expect(r[0].acum).toBe(150);
    expect(r[1].st).toBe(10);
    expect(r[1].acum).toBe(160); // acumulado corriente
  });
  it("separa anio A de anio B", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [rec(1, 40, "c1")], grupos, "INVOICE", "ANNUAL");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
    expect(r[0].total_prev).toBe(40);
    expect(r[0].acum_prev).toBe(40);
  });
  it("ignora categorias sin clasificar y otro record_type", () => {
    const a = [rec(1, 999, "c9"), rec(1, 500, "c1", "SALES_ORDER")];
    const r = buildTechServiceData(a, [], grupos, "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("con el mapa vacio todo suma 0", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [], new Map(), "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("MONTHLY devuelve 12 slots", () => {
    expect(buildTechServiceData([], [], grupos, "INVOICE", "MONTHLY")).toHaveLength(12);
  });
});

// recordsA es el anio analizado y recordsB el de referencia, igual que en
// buildTechServiceData: la funcion no filtra por record_year, los separa el array.
describe("stGrowthByQuarter", () => {
  it("compara el acumulado de cada trimestre con el del anio anterior", () => {
    const a = [rec(1, 120, "c1")];
    const b = [rec(1, 100, "c1")];
    // Acumulado T1: 120 frente a 100 = +20 %. El acumulado se arrastra, asi que
    // los trimestres siguientes repiten mientras no entren mas ventas.
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")).toEqual([20, 20, 20, 20]);
  });

  it("si el anio de referencia no tiene ventas pero el analizado si, es +100%", () => {
    // Mismo convenio que getYoY() en el Analisis de Servicio Tecnico: sin base
    // pero con ventas nuevas no es "sin datos", es un crecimiento del 100%.
    expect(stGrowthByQuarter([rec(1, 50, "c1")], [], grupos, "INVOICE")).toEqual([
      100, 100, 100, 100,
    ]);
  });

  it("sin ventas en ninguno de los dos anios no hay variacion que calcular", () => {
    expect(stGrowthByQuarter([], [], grupos, "INVOICE")).toEqual([null, null, null, null]);
  });

  it("ignora categorias que no son ni ST ni C&R", () => {
    const a = [rec(1, 1000, "c9")];
    const b = [rec(1, 100, "c1")];
    // Las mil de la categoria sin clasificar no entran: el acumulado del anio A sigue a cero.
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(-100);
  });

  it("cuenta tambien las ventas de C&R, igual que el Analisis de Servicio Tecnico", () => {
    // c1 es ST, c2 es C&R: el acumulado combina las dos, igual que buildTechServiceData.
    const a = [rec(1, 100, "c1"), rec(1, 50, "c2")];
    const b = [rec(1, 100, "c1"), rec(1, 25, "c2")];
    // 150 frente a 125 = +20 %.
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(20);
  });

  it("respeta el tipo de registro pedido", () => {
    const a = [rec(1, 200, "c1", "SALES_ORDER")];
    const b = [rec(1, 100, "c1")];
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(-100);
  });

  it("devuelve siempre cuatro trimestres", () => {
    expect(stGrowthByQuarter([], [], grupos, "INVOICE")).toHaveLength(4);
  });
});

describe("yoy", () => {
  it("variacion normal", () => {
    expect(yoy(120, 100)).toBe(20);
  });
  it("sin base pero con valor actual es +100%", () => {
    expect(yoy(50, 0)).toBe(100);
  });
  it("sin base y sin valor actual no hay variacion", () => {
    expect(yoy(0, 0)).toBeNull();
  });
});

describe("stGrowthByQuarter coincide con VAR. ACUMULADA de Analisis de Servicio Tecnico", () => {
  // Es la garantia de que las dos tablas nunca puedan volver a divergir: la misma
  // funcion yoy() sobre el mismo acumulado de buildTechServiceData.
  it("el KPI trimestral es exactamente el yoy del acumulado ST+C&R", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(5, 30, "c1"), rec(8, 20, "c2")];
    const b = [rec(1, 80, "c1"), rec(4, 40, "c2")];
    const trimestres = buildTechServiceData(a, b, grupos, "INVOICE", "QUARTERLY");
    const kpi = stGrowthByQuarter(a, b, grupos, "INVOICE");
    trimestres.forEach((t, i) => {
      expect(kpi[i]).toBe(yoy(t.acum, t.acum_prev));
    });
  });
});

describe("coherencia entre el grafico y el KPI con la clasificacion guardada", () => {
  // El grafico y el KPI construyen el mapa con la misma funcion a partir de las
  // mismas categorias: con la misma clasificacion, el acumulado anual tiene que ser
  // identico, incluidas las ventas de una categoria inactiva clasificada.
  it("el acumulado anual del grafico es el mismo que suma el KPI", () => {
    const categorias = [cat("c1", "st"), cat("c2", "cr"), cat("c3", "st", false), cat("c9", null)];
    const g = gruposServicioTecnico(categorias);
    const a = [rec(1, 100, "c1"), rec(3, 40, "c2"), rec(6, 25, "c3"), rec(9, 999, "c9"), rec(12, 10, "c2")];
    const b = [rec(2, 70, "c1"), rec(7, 30, "c3"), rec(11, 500, "c9")];

    const [anual] = buildTechServiceData(a, b, g, "INVOICE", "ANNUAL");
    expect(anual.acum).toBe(acumuladoServicioTecnico(a, TODO_EL_ANIO, g, "INVOICE"));
    expect(anual.acum_prev).toBe(acumuladoServicioTecnico(b, TODO_EL_ANIO, g, "INVOICE"));
    expect(anual.acum).toBe(175);
    expect(anual.acum_prev).toBe(100);
    // Y el KPI al cierre (T4) es el yoy de ese mismo acumulado anual.
    expect(stGrowthByQuarter(a, b, g, "INVOICE")[3]).toBe(yoy(anual.acum, anual.acum_prev));
  });
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

```bash
npx vitest run src/lib/__tests__/tech-service.test.ts
```

Esperado: FAIL. `gruposServicioTecnico` y `acumuladoServicioTecnico` no son funciones (no están exportadas), y los tests de `buildTechServiceData` dan 0 porque el mapa trae grupos y no nombres.

- [ ] **Paso 3: Reescribir `src/lib/tech-service.ts`**

Sustituye todo el contenido del fichero por:

```ts
import { MONTHS } from "@/lib/constants";
import type { SalesRecord, RecordType, TechServiceBucket, TechServiceCategory } from "@/types/database";
import type { TechServiceDataPoint } from "@/components/charts/tech-service-analysis";

export type { TechServiceBucket } from "@/types/database";

export type TechServiceViewMode = "MONTHLY" | "QUARTERLY" | "ANNUAL";

/**
 * Clave de react-query de las categorías con su grupo de Servicio Técnico. Cuelga de
 * ["categories"] a propósito: invalidar ["categories"] (al guardar la clasificación
 * en Configuración o al editar una categoría) refresca también esta consulta, porque
 * react-query invalida por prefijo. No reutiliza ["categories"] tal cual porque
 * getCategories() solo trae las activas, y aquí también hacen falta las inactivas.
 */
export const TECH_SERVICE_CATEGORIES_KEY = ["categories", "servicio-tecnico"] as const;

/**
 * Grupo de Servicio Técnico de cada categoría clasificada, indexado por id. Entran
 * también las inactivas, porque sus ventas históricas tienen que seguir contando al
 * comparar años. Se indexa por id y no por nombre para que renombrar una categoría no
 * la saque de su grupo sin avisar, que es lo que pasaba con las listas fijas. El
 * gráfico, su widget y el KPI construyen el mapa con esta misma función, así que
 * siempre clasifican igual.
 */
export function gruposServicioTecnico(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): Map<string, TechServiceBucket> {
  const grupos = new Map<string, TechServiceBucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como grupo.
    if (c.tech_service_bucket === "st" || c.tech_service_bucket === "cr") {
      grupos.set(String(c.id), c.tech_service_bucket);
    }
  }
  return grupos;
}

function slotsFor(viewMode: TechServiceViewMode): { label: string; months: number[] }[] {
  if (viewMode === "MONTHLY") return MONTHS.map((m) => ({ label: m.label, months: [m.value] }));
  if (viewMode === "QUARTERLY") {
    return [
      { label: "T1", months: [1, 2, 3] },
      { label: "T2", months: [4, 5, 6] },
      { label: "T3", months: [7, 8, 9] },
      { label: "T4", months: [10, 11, 12] },
    ];
  }
  return [{ label: "Anual", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }];
}

/**
 * Agrega las líneas ST (mano de obra) y C&R (consumibles) por slot temporal,
 * comparando el año A (`recordsA`) con el año B (`recordsB`) y llevando el
 * acumulado corriente de cada uno. Función pura: la usan tanto `analytics/page.tsx`
 * como el widget `TechServiceWidget` del dashboard configurable. `grupos` sale de
 * gruposServicioTecnico(): una categoría que no está en el mapa no cuenta.
 */
export function buildTechServiceData(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType,
  viewMode: TechServiceViewMode,
): TechServiceDataPoint[] {
  const slots = slotsFor(viewMode);
  let acumA = 0;
  let acumB = 0;

  const sum = (records: SalesRecord[], months: number[]) => {
    let st = 0;
    let cr = 0;
    for (const r of records) {
      if (r.record_type !== recordType) continue;
      if (!months.includes(Number(r.record_month))) continue;
      const grupo = grupos.get(r.category_id);
      const amt = Number(r.amount_usd);
      if (grupo === "st") st += amt;
      else if (grupo === "cr") cr += amt;
    }
    return { st, cr };
  };

  return slots.map((slot) => {
    const a = sum(recordsA, slot.months);
    const b = sum(recordsB, slot.months);
    const totalA = a.st + a.cr;
    const totalB = b.st + b.cr;
    acumA += totalA;
    acumB += totalB;
    return {
      label: slot.label,
      st: a.st, cr: a.cr, total: totalA, acum: acumA,
      st_prev: b.st, cr_prev: b.cr, total_prev: totalB, acum_prev: acumB,
    };
  });
}

const TRIMESTRES = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
];

/**
 * Variación interanual en porcentaje. Misma fórmula y mismo convenio que usa el
 * Análisis de Servicio Técnico para "VAR. ACUMULADA VS AÑO ANTERIOR": sin base con la
 * que comparar pero con valor este año es un crecimiento del 100 %, no una división
 * por cero; sin valor en ninguno de los dos años no hay variación que calcular.
 */
export function yoy(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : null;
  return ((actual - anterior) / anterior) * 100;
}

/**
 * Ventas de Servicio Técnico en un periodo: ST (mano de obra) más C&R (consumibles),
 * el mismo total que suma buildTechServiceData con el mismo mapa de grupos. Se
 * exporta para el test de coherencia entre el gráfico y el KPI.
 */
export function acumuladoServicioTecnico(
  records: SalesRecord[],
  meses: number[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType
): number {
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    if (!meses.includes(Number(r.record_month))) continue;
    if (grupos.has(r.category_id)) total += Number(r.amount_usd);
  }
  return total;
}

/**
 * Variación acumulada de las ventas de Servicio Técnico (ST + C&R) frente al mismo
 * periodo del año anterior, trimestre a trimestre. Es la misma cifra que la fila
 * "VAR. ACUMULADA VS AÑO ANTERIOR" del Análisis de Servicio Técnico para el mismo tipo
 * de registro y los mismos dos años: comparten yoy() y la misma clasificación
 * guardada. Es un KPI de compañía: estas líneas no llevan comercial asignado, así que
 * no se filtra por vendedor.
 */
export function stGrowthByQuarter(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  grupos: Map<string, TechServiceBucket>,
  recordType: RecordType
): (number | null)[] {
  const out: (number | null)[] = [];
  let acumMeses: number[] = [];
  for (const trimestre of TRIMESTRES) {
    acumMeses = [...acumMeses, ...trimestre];
    const a = acumuladoServicioTecnico(recordsA, acumMeses, grupos, recordType);
    const b = acumuladoServicioTecnico(recordsB, acumMeses, grupos, recordType);
    out.push(yoy(a, b));
  }
  return out;
}
```

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

```bash
npx vitest run src/lib/__tests__/tech-service.test.ts
```

Esperado: todos pasan (4 + 5 + 7 + 3 + 1 + 1 = 21).

- [ ] **Paso 5: `analytics/page.tsx` usa la clasificación guardada**

Con Edit, en `src/app/(dashboard)/analytics/page.tsx`:

1. Sustituye `import { getCategories } from "@/actions/category-actions";` por:
```ts
import { getCategories, getTechServiceCategories } from "@/actions/category-actions";
```
2. Sustituye `import { buildTechServiceData } from "@/lib/tech-service";` por:
```ts
import { buildTechServiceData, gruposServicioTecnico, TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
```
3. Sustituye:
```ts
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const loading = l1 || l2;
```
por:
```ts
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  // Clasificación ST / C&R guardada, incluidas las categorías inactivas: la misma
  // consulta que usan el widget del dashboard y el KPI de la tabla comercial.
  const { data: techCatsData, isLoading: l3 } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
  });
  const loading = l1 || l2 || l3;
```
4. Sustituye:
```ts
  // 2. Análisis de Servicio Técnico ST vs C&R: mismo lib puro que usa el widget del dashboard.
  const techServiceData = useMemo(() => {
    const dataA = allRecords.filter((r: SalesRecord) => r.record_year === yearA);
    const dataB = allRecords.filter((r: SalesRecord) => r.record_year === yearB);
    const catMap = new Map<string, string>(
      categories.map((c) => [String(c.id), String(c.name)])
    );
    return buildTechServiceData(dataA, dataB, catMap, techServiceRecordType, techServiceViewMode);
  }, [allRecords, categories, yearA, yearB, techServiceRecordType, techServiceViewMode]);
```
por:
```ts
  // 2. Análisis de Servicio Técnico ST vs C&R: mismo lib puro y misma clasificación
  // guardada que el widget del dashboard y el KPI de la tabla comercial.
  const gruposST = useMemo(() => gruposServicioTecnico(techCatsData ?? []), [techCatsData]);
  const techServiceData = useMemo(() => {
    const dataA = allRecords.filter((r: SalesRecord) => r.record_year === yearA);
    const dataB = allRecords.filter((r: SalesRecord) => r.record_year === yearB);
    return buildTechServiceData(dataA, dataB, gruposST, techServiceRecordType, techServiceViewMode);
  }, [allRecords, gruposST, yearA, yearB, techServiceRecordType, techServiceViewMode]);
```

- [ ] **Paso 6: El widget lee la clasificación él mismo**

Sustituye todo `src/components/charts/dashboard/tech-service-widget.tsx` por:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTechServiceCategories } from "@/actions/category-actions";
import { TechServiceAnalysis } from "@/components/charts/tech-service-analysis";
import {
  buildTechServiceData,
  gruposServicioTecnico,
  TECH_SERVICE_CATEGORIES_KEY,
  type TechServiceViewMode,
} from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

/**
 * Análisis de Servicio Técnico (ST vs C&R) como widget autónomo: tanto el
 * selector de resolución (mensual/trimestral/anual) como el tipo de
 * registro (OV/Facturas) son estado propio, independiente del contexto
 * del dashboard. La clasificación ST / C&R la lee él mismo, con la misma consulta
 * que /analytics y el KPI de la tabla comercial. El catMap del contexto no sirve:
 * trae solo las categorías activas, y por nombre.
 */
export function TechServiceWidget({
  yearA, yearB, records, prevRecords,
}: {
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
}) {
  const [viewMode, setViewMode] = useState<TechServiceViewMode>("QUARTERLY");
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const { data: categorias } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
  });
  const grupos = useMemo(() => gruposServicioTecnico(categorias ?? []), [categorias]);
  const data = useMemo(
    () => buildTechServiceData(records, prevRecords, grupos, recordType, viewMode),
    [records, prevRecords, grupos, recordType, viewMode]
  );
  return (
    <TechServiceAnalysis
      data={data}
      yearA={yearA}
      yearB={yearB}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      recordType={recordType}
      onRecordTypeChange={setRecordType}
    />
  );
}
```

- [ ] **Paso 7: El registro deja de pasar `catMap` al widget**

En `src/lib/widget-registry.tsx`, sustituye:
```tsx
      <TechServiceWidget yearA={c.year} yearB={c.year - 1}
        records={c.records} prevRecords={c.prevRecords} catMap={c.catMap} />
```
por:
```tsx
      <TechServiceWidget yearA={c.year} yearB={c.year - 1}
        records={c.records} prevRecords={c.prevRecords} />
```
`WidgetContext.catMap` se queda, porque lo sigue usando `CategoryMixDonut`.

- [ ] **Paso 8: El KPI usa la clasificación guardada**

Con Edit, en `src/components/charts/comercial/commercial-kpi-table.tsx`:

1. Sustituye `import { getCategories } from "@/actions/category-actions";` por:
```ts
import { getTechServiceCategories } from "@/actions/category-actions";
```
2. Sustituye `import { stGrowthByQuarter } from "@/lib/tech-service";` por:
```ts
import { gruposServicioTecnico, stGrowthByQuarter, TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
```
3. Sustituye `import type { Category, SalesRecord } from "@/types/database";` por:
```ts
import type { SalesRecord, TechServiceCategory } from "@/types/database";
```
4. Sustituye:
```ts
  // incremento_st no sale del hub: sale de sales_records cruzado con las
  // categorías. Las dos claves son las que ya carga analytics/page.tsx.
  const ventasQ = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  const categoriasQ = useQuery({ queryKey: ["categories"], queryFn: getCategories });
```
por:
```ts
  // incremento_st no sale del hub: sale de sales_records cruzado con la clasificación
  // de Servicio Técnico guardada en las categorías. Las dos claves son las que ya carga
  // analytics/page.tsx, así que el KPI y el gráfico comparten caché y clasificación.
  const ventasQ = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  const categoriasQ = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
  });
```
5. Sustituye:
```ts
  const categorias = useMemo<Category[]>(() => (categoriasQ.data as Category[]) ?? [], [categoriasQ.data]);
```
por:
```ts
  const categorias = useMemo<TechServiceCategory[]>(() => categoriasQ.data ?? [], [categoriasQ.data]);
```
6. Sustituye:
```ts
    const catMap = new Map<string, string>(categorias.map((c) => [String(c.id), String(c.name)]));
```
por:
```ts
    const grupos = gruposServicioTecnico(categorias);
```
7. Sustituye:
```ts
      registros.filter((r) => r.record_year === year - 1),
      catMap,
```
por:
```ts
      registros.filter((r) => r.record_year === year - 1),
      grupos,
```

La lista de dependencias del `useMemo` de las filas (línea ~457) ya incluye `categorias`, que sigue siendo lo que se usa. No la toques.

- [ ] **Paso 9: No quedan referencias a las listas fijas**

```bash
grep -rn "ST_CATEGORIES\|CR_CATEGORIES" src e2e
grep -rn "catMap" src/lib/tech-service.ts src/components/charts/dashboard/tech-service-widget.tsx src/components/charts/comercial/commercial-kpi-table.tsx
```

Esperado: ninguna salida en los dos comandos. Las menciones en `docs/` son planes y specs históricos y no se tocan.

- [ ] **Paso 10: Tipos, lint y suite completa**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Esperado:
- `tsc` sin salida;
- el lint con 10 warnings y 0 errores;
- vitest con 319 pasados (313 + 6 nuevos: 4 de `gruposServicioTecnico`, 1 de mapa vacío y 1 de coherencia) y 1 saltado.

- [ ] **Paso 11: Commit**

```bash
git add src/lib/tech-service.ts src/lib/__tests__/tech-service.test.ts "src/app/(dashboard)/analytics/page.tsx" src/components/charts/dashboard/tech-service-widget.tsx src/lib/widget-registry.tsx src/components/charts/comercial/commercial-kpi-table.tsx
git commit -m "feat(servicio-tecnico): el grafico, el widget y el KPI usan la clasificacion guardada"
```

---

## Task 4: Lógica pura de la selección en la interfaz

**Files:**
- Create: `src/lib/tech-service-selection.ts`
- Test: `src/lib/__tests__/tech-service-selection.test.ts`

- [ ] **Paso 1: Escribir el test que falla**

Crea `src/lib/__tests__/tech-service-selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionInicial,
  type SeleccionServicioTecnico,
} from "@/lib/tech-service-selection";

describe("seleccionInicial", () => {
  it("reparte las categorias por su grupo guardado y respeta el orden", () => {
    const sel = seleccionInicial([
      { id: "a", tech_service_bucket: "st" },
      { id: "b", tech_service_bucket: "cr" },
      { id: "c", tech_service_bucket: null },
      { id: "d", tech_service_bucket: "st" },
    ]);
    expect(sel).toEqual({ st: ["a", "d"], cr: ["b"] });
  });

  it("sin categorias clasificadas los dos grupos quedan vacios", () => {
    expect(seleccionInicial([{ id: "a", tech_service_bucket: null }])).toEqual({ st: [], cr: [] });
  });
});

describe("grupoDe", () => {
  const sel: SeleccionServicioTecnico = { st: ["a"], cr: ["b"] };
  it("dice en que grupo esta una categoria, o null", () => {
    expect(grupoDe(sel, "a")).toBe("st");
    expect(grupoDe(sel, "b")).toBe("cr");
    expect(grupoDe(sel, "z")).toBeNull();
  });
});

describe("alternarCategoria", () => {
  it("marca una categoria libre en el grupo pedido", () => {
    expect(alternarCategoria({ st: ["a"], cr: [] }, "st", "c")).toEqual({ st: ["a", "c"], cr: [] });
    expect(alternarCategoria({ st: [], cr: [] }, "cr", "c")).toEqual({ st: [], cr: ["c"] });
  });

  it("desmarca una categoria que ya estaba en ese grupo", () => {
    expect(alternarCategoria({ st: ["a", "c"], cr: ["b"] }, "st", "c")).toEqual({ st: ["a"], cr: ["b"] });
  });

  it("no mueve una categoria que ya esta en el otro grupo: exclusion mutua", () => {
    const sel: SeleccionServicioTecnico = { st: ["a"], cr: ["b"] };
    expect(alternarCategoria(sel, "st", "b")).toBe(sel);
    expect(alternarCategoria(sel, "cr", "a")).toBe(sel);
  });

  it("no muta la seleccion recibida", () => {
    const sel: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    alternarCategoria(sel, "st", "c");
    alternarCategoria(sel, "st", "a");
    expect(sel).toEqual({ st: ["a"], cr: [] });
  });

  it("para mover de grupo hay que desmarcar primero y marcar despues", () => {
    let sel: SeleccionServicioTecnico = { st: [], cr: ["b"] };
    sel = alternarCategoria(sel, "cr", "b");
    sel = alternarCategoria(sel, "st", "b");
    expect(sel).toEqual({ st: ["b"], cr: [] });
  });
});

describe("haCambiado", () => {
  it("el mismo contenido en otro orden no es un cambio", () => {
    expect(haCambiado({ st: ["a", "b"], cr: ["c"] }, { st: ["b", "a"], cr: ["c"] })).toBe(false);
  });

  it("marcar o desmarcar es un cambio", () => {
    const inicial: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    expect(haCambiado(inicial, alternarCategoria(inicial, "cr", "b"))).toBe(true);
    expect(haCambiado(inicial, alternarCategoria(inicial, "st", "a"))).toBe(true);
  });

  it("volver al estado de partida deja de ser un cambio", () => {
    const inicial: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    const ida = alternarCategoria(inicial, "st", "a");
    const vuelta = alternarCategoria(ida, "st", "a");
    expect(haCambiado(inicial, vuelta)).toBe(false);
  });
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

```bash
npx vitest run src/lib/__tests__/tech-service-selection.test.ts
```

Esperado: FAIL. No se puede resolver `@/lib/tech-service-selection`.

- [ ] **Paso 3: Implementar `src/lib/tech-service-selection.ts`**

```ts
import type { TechServiceBucket, TechServiceCategory } from "@/types/database";

/**
 * Selección en curso de la tarjeta «Categorías de Servicio Técnico»: ids de categoría
 * de cada grupo. Vive fuera del componente para poder testearla: vitest corre en
 * node y no hay librería de tests de componentes.
 */
export interface SeleccionServicioTecnico {
  st: string[];
  cr: string[];
}

/** Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. */
export function seleccionInicial(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): SeleccionServicioTecnico {
  const st: string[] = [];
  const cr: string[] = [];
  for (const c of categorias) {
    if (c.tech_service_bucket === "st") st.push(c.id);
    else if (c.tech_service_bucket === "cr") cr.push(c.id);
  }
  return { st, cr };
}

/** Grupo en el que está marcada una categoría, o null si no está en ninguno. */
export function grupoDe(sel: SeleccionServicioTecnico, id: string): TechServiceBucket | null {
  if (sel.st.includes(id)) return "st";
  if (sel.cr.includes(id)) return "cr";
  return null;
}

/**
 * Marca o desmarca una categoría en un grupo. Si ya está en el otro grupo, devuelve
 * la misma selección sin tocarla. La interfaz ya la enseña desactivada, pero la regla
 * se aplica también aquí, porque la columna solo admite un grupo y el servidor
 * rechazaría la intersección. Para moverla de grupo hay que desmarcarla primero, así
 * nadie la cambia de grupo sin darse cuenta.
 */
export function alternarCategoria(
  sel: SeleccionServicioTecnico,
  grupo: TechServiceBucket,
  id: string
): SeleccionServicioTecnico {
  const actual = grupoDe(sel, id);
  if (actual !== null && actual !== grupo) return sel;
  const lista = sel[grupo];
  const nueva = actual === grupo ? lista.filter((x) => x !== id) : [...lista, id];
  return grupo === "st" ? { st: nueva, cr: sel.cr } : { st: sel.st, cr: nueva };
}

/**
 * Si la selección difiere de la de partida. Se compara como conjuntos: el orden de
 * las etiquetas no es un cambio que merezca guardar.
 */
export function haCambiado(inicial: SeleccionServicioTecnico, actual: SeleccionServicioTecnico): boolean {
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  return !igual(inicial.st, actual.st) || !igual(inicial.cr, actual.cr);
}
```

- [ ] **Paso 4: Ejecutarlo y ver que pasa**

```bash
npx vitest run src/lib/__tests__/tech-service-selection.test.ts
```

Esperado: 11 pasados.

- [ ] **Paso 5: Tipos, lint y suite completa**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Esperado:
- `tsc` sin salida;
- el lint con 10 warnings y 0 errores;
- vitest con 330 pasados y 1 saltado.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/tech-service-selection.ts src/lib/__tests__/tech-service-selection.test.ts
git commit -m "feat(configuracion): logica pura de seleccion de categorias de servicio tecnico"
```

---

## Task 5: Tarjeta «Categorías de Servicio Técnico» en Configuración

**Files:**
- Create: `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

No hay librería de tests de componentes. La lógica ya está cubierta en la Task 4, y el comportamiento lo cubre el E2E de la Task 6.

- [ ] **Paso 1: Crear el componente**

`src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Save, Wrench, X } from "lucide-react";
import { getTechServiceCategories, saveTechServiceBuckets } from "@/actions/category-actions";
import { puedeEditarMetas } from "@/lib/commercial-kpis";
import { TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionInicial,
  type SeleccionServicioTecnico,
} from "@/lib/tech-service-selection";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TechServiceBucket, TechServiceCategory } from "@/types/database";

// Nombre corto de cada grupo. Es la nota junto a una categoría que ya está en el
// otro grupo, y el final del nombre accesible del botón de quitar.
const CORTO: Record<TechServiceBucket, string> = { st: "ST", cr: "C&R" };

const GRUPOS: { bucket: TechServiceBucket; titulo: string }[] = [
  { bucket: "st", titulo: "Categorías de ST (mano de obra)" },
  { bucket: "cr", titulo: "Categorías de C&R (consumibles y repuestos)" },
];

/**
 * Un grupo: el desplegable con buscador (solo para quien edita) y las etiquetas de
 * lo marcado. Las etiquetas salen de la selección y no de las categorías activas,
 * para que una inactiva ya clasificada se siga viendo. Si no se viera, desaparecería
 * del grupo al guardar sin que nadie lo hubiera decidido.
 */
function GrupoCategorias({
  bucket,
  titulo,
  seleccion,
  activas,
  porId,
  editable,
  onToggle,
}: {
  bucket: TechServiceBucket;
  titulo: string;
  seleccion: SeleccionServicioTecnico;
  activas: TechServiceCategory[];
  porId: Map<string, TechServiceCategory>;
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
                    // En el otro grupo: se ve, pero desactivada y con la nota de dónde está.
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
                          <span className="text-[11px] text-muted-foreground">en {CORTO[grupo]}</span>
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
                    aria-label={`Quitar ${c.name} de ${CORTO[bucket]}`}
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
  onSaved: () => void;
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
      onSaved();
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
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ["categories"] }); }}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Montar la tarjeta en `src/app/(dashboard)/settings/page.tsx`**

Sustituye:
```tsx
import { KpiTargetsForm } from "./_components/kpi-targets-form";
```
por:
```tsx
import { KpiTargetsForm } from "./_components/kpi-targets-form";
import { TechServiceCategoriesForm } from "./_components/tech-service-categories-form";
```

Y sustituye:
```tsx
      <KpiTargetsForm />
    </div>
```
por:
```tsx
      <KpiTargetsForm />

      <TechServiceCategoriesForm />
    </div>
```

- [ ] **Paso 3: Tipos, lint y suite completa**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Esperado:
- `tsc` sin salida;
- el lint con 10 warnings y 0 errores;
- vitest con 330 pasados y 1 saltado.

- [ ] **Paso 4: Commit**

```bash
git add "src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx" "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(configuracion): tarjeta de categorias de servicio tecnico"
```

---

## Task 6: E2E. Semilla clasificada, admin que mueve una categoría y lector de solo lectura

**Files:**
- Modify: `e2e/constants.ts`
- Create: `e2e/specs/tech-service-categories.spec.ts`
- Modify: `e2e/db/seed-app.mjs`

- [ ] **Paso 1: Constante de la semilla en `e2e/constants.ts`**

Añade debajo de `CATEGORIES`:

```ts
/**
 * Clasificacion de Servicio Tecnico que deja e2e/db/seed-app.mjs: una categoria
 * inventada en cada grupo y otra sin clasificar.
 */
export const TECH_SERVICE_SEED = { st: "Aguas", cr: "Aire", sinGrupo: "Suelos" } as const;
```

- [ ] **Paso 2: Escribir el spec que falla**

Crea `e2e/specs/tech-service-categories.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, TECH_SERVICE_SEED } from "../constants";

const TITULO = "Categorías de Servicio Técnico";
const ST = "Categorías de ST (mano de obra)";
const CR = "Categorías de C&R (consumibles y repuestos)";

function tarjeta(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: TITULO });
}

// El lector va primero: el test del admin cambia la clasificacion guardada, y la
// base solo se reinicia al principio de cada ejecucion de test:e2e.
test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("ve la clasificacion pero no puede cambiarla", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    await expect(card.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.st)).toBeVisible();
    await expect(card.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();

    // Sin desplegables, sin quitar etiquetas y sin boton de guardar.
    await expect(card.getByRole("button", { name: `Elegir ${ST}` })).toHaveCount(0);
    await expect(card.getByRole("button", { name: `Elegir ${CR}` })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /^Quitar / })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Guardar categorías" })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: APPROVED_STATE });

  test("una categoria de un grupo aparece desactivada en el otro", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: `Elegir ${ST}` }).click();
    // Regex y no texto exacto: el nombre accesible junta los dos span sin espacio
    // garantizado entre el nombre y la nota.
    const enCr = page.getByRole("option", { name: new RegExp(`^${TECH_SERVICE_SEED.cr}\\s*en C&R$`) });
    await expect(enCr).toBeVisible();
    await expect(enCr).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
  });

  test("mover una categoria de grupo persiste al recargar", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    const guardar = card.getByRole("button", { name: "Guardar categorías" });
    // Sin cambios no hay nada que guardar.
    await expect(guardar).toBeDisabled();

    // Para cambiarla de grupo hay que sacarla primero de C&R...
    await card.getByRole("button", { name: `Elegir ${CR}` }).click();
    await page.getByRole("option", { name: TECH_SERVICE_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toHaveCount(0);

    // ...y despues marcarla en ST, donde ya no sale desactivada.
    await card.getByRole("button", { name: `Elegir ${ST}` }).click();
    await page.getByRole("option", { name: TECH_SERVICE_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();

    await guardar.click();
    await expect(page.getByText("Clasificación guardada")).toBeVisible();

    await page.reload();
    const tras = tarjeta(page);
    await expect(tras.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();
    await expect(tras.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.st)).toBeVisible();
    await expect(tras.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toHaveCount(0);
  });
});
```

- [ ] **Paso 3: Ejecutarlo y ver que falla**

Comprueba que Docker está arrancado y que el puerto 3100 está libre. Después:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset
E2E_PG_PORT=55433 npx playwright test tech-service-categories
```

Esperado: FAIL en los tres tests. La semilla no clasifica ninguna categoría, así que las listas solo dicen «Ninguna categoría.», no hay etiqueta `Aguas` ni `Aire`, y la opción `Aire en C&R` no existe.

- [ ] **Paso 4: Clasificar la semilla en `e2e/db/seed-app.mjs`**

Sustituye:
```js
const CATEGORIES = [
  { name: "Aguas", color: "#2563eb", sort_order: 1 },
  { name: "Aire", color: "#16a34a", sort_order: 2 },
  { name: "Suelos", color: "#ca8a04", sort_order: 3 },
];
```
por:
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

Y sustituye:
```js
      const { rows: [row] } = await client.query(
        `INSERT INTO categories (company_id, name, color, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [company.id, cat.name, cat.color, cat.sort_order],
      );
```
por:
```js
      const { rows: [row] } = await client.query(
        `INSERT INTO categories (company_id, name, color, sort_order, is_active, tech_service_bucket)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [company.id, cat.name, cat.color, cat.sort_order, cat.tech_service_bucket],
      );
```

- [ ] **Paso 5: Reiniciar la base y ver que pasa**

Espera al menos 60 s desde la ejecución anterior de Playwright. Después:

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset
E2E_PG_PORT=55433 npx playwright test tech-service-categories
```

Esperado: pasan los 3 tests de `tech-service-categories.spec.ts` y los 3 del setup.

- [ ] **Paso 6: Commit**

```bash
git add e2e/constants.ts e2e/specs/tech-service-categories.spec.ts e2e/db/seed-app.mjs
git commit -m "test(e2e): clasificacion de categorias de servicio tecnico en configuracion"
```

---

## Task 7: Puertas finales

**Files:** ninguno, salvo que alguna puerta obligue a corregir algo. Si hay que corregir, haz un commit `fix(...)` con los ficheros tocados y vuelve a pasar todas las puertas.

- [ ] **Paso 1: No quedan referencias a las listas fijas**

```bash
grep -rn "ST_CATEGORIES\|CR_CATEGORIES" src e2e drizzle --include=*.ts --include=*.tsx --include=*.mjs
```

Esperado: ninguna salida. La migración `0011` solo las nombra en un comentario, que este grep no mira porque no incluye `*.sql`.

- [ ] **Paso 2: Tipos**

```bash
npx tsc --noEmit
```

Esperado: sin salida.

- [ ] **Paso 3: Lint**

```bash
npm run lint
```

Esperado: exactamente `10 problems (0 errors, 10 warnings)`.

- [ ] **Paso 4: Vitest**

```bash
npx vitest run
```

Esperado: 330 pasados, 1 saltado y 0 fallidos. Son los 306 de partida más 24 nuevos: 7 de validación, 6 de `tech-service` y 11 de selección.

- [ ] **Paso 5: E2E completo**

1. Arranca Docker Desktop si no lo está (`"/c/Program Files/Docker/Docker/Docker Desktop.exe" &`) y espera a que `docker info` responda.
2. Comprueba que el puerto 3100 está libre: `netstat -ano | grep ":3100 "` no debe mostrar nada en LISTENING.
3. Espera al menos 60 s desde la última ejecución de Playwright.
4. Lanza:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run test:e2e
```

Esperado: 60 pasados (los 57 de partida más 3 nuevos) y 0 fallidos.

- [ ] **Paso 6: Estado limpio**

```bash
git status --short
git log --oneline -7
```

Esperado: el árbol de trabajo limpio y los seis commits de las Tasks 1-6 encima de `3f51e56`.

---

## Despliegue

1. **Antes de desplegar**, el usuario ejecuta la migración a mano en la base `sales_tracker` de producción:
   ```bash
   psql "$DATABASE_URL" -f drizzle/0011_tech_service_bucket.sql
   ```
2. Comprobaciones tras la migración:
   ```sql
   SELECT tech_service_bucket, count(*) FROM categories GROUP BY 1 ORDER BY 1;
   -- Esperado: como mucho 12 'st' y 15 'cr' (menos si alguna categoria ya no existe con ese nombre).
   SELECT name FROM categories WHERE NOT is_active AND tech_service_bucket IS NOT NULL;
   -- Si sale alguna fila, esas categorias inactivas ahora cuentan en el grafico y en el KPI
   -- (antes no contaban, porque el catMap solo tenia las activas). Revisarlas en Configuracion.
   ```
3. Despliega la app. No hace falta tocar el worker ni el hub.
4. No vuelvas a ejecutar la `0011` después de cambiar la clasificación desde Configuración: sus `UPDATE` la devolverían a las listas de partida.
