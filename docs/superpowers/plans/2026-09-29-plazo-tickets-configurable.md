# Plazo configurable de tickets en plazo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar desde Configuración → «Metas de KPIs comerciales» cuántas horas laborables cuentan como plazo en el KPI «Tickets de Servicio Técnico en plazo», por año y solo en el ámbito «Total compañía». Si un año no tiene plazo guardado, vale 12 h, como hasta ahora.

**Architecture:** Columna nueva `kpi_targets.plazo_horas` (migración manual `0012`), rellena solo en la fila `tickets_st` del total de cada año. La lógica pura de `src/lib/kpi-tickets.ts` recibe el plazo como parámetro obligatorio (`plazoHoras`) en lugar de leer una constante, y `plazoTicketsDelAnio` lo saca de las metas del total. La tabla de KPIs pide siempre las metas del total del año para obtener el plazo, también con un comercial elegido. La conversión del borrador de la pantalla de metas va a funciones puras con tests en `src/lib/kpi-metas.ts`.

**Tech Stack:** Next.js (App Router, server actions), React, TanStack Query, Drizzle ORM + PostgreSQL, Zod 4, componentes base-ui (no Radix: `render={}` en lugar de `asChild`), vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-plazo-tickets-configurable-design.md`

---

## Contexto para quien ejecuta

Convenciones obligatorias en todas las tareas:

- **Idioma.** El plan está en español. Los comentarios del código van en español y explican el porqué, no el qué.
- **Commits.** Conventional commits en español **sin tildes ni eñes** (`anio`, no `año`). **Sin** `Co-Authored-By` ni ninguna atribución a IA. **Un commit por tarea.** Nunca se reescribe historia: nada de `git commit --amend`, `rebase` ni `reset`. Si algo sale mal tras un commit, se arregla con un commit nuevo.
- **Finales de línea.** El repo guarda LF; la copia de trabajo está en CRLF por `core.autocrlf=true`. **Nunca `sed -i`.** Para modificar ficheros existentes se usa la herramienta Edit (conserva el CRLF) o un script de node que lo conserve. Los ficheros **nuevos** creados con Write quedan en LF: conviértelos a CRLF justo después con

  ```bash
  node -e "const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))" RUTA_DEL_FICHERO
  ```

- **Migraciones.** SQL manual en `drizzle/`. La nueva es la `0012` (la `0009` está reservada). **No se toca** `drizzle/meta/_journal.json`.
- **Permisos.** Las lecturas usan `requireApproved()`; las escrituras, `requireRole(...ROLES_EDITAN_METAS)` (Admin y Editor). No cambia ninguno.
- **Datos de E2E.** Solo datos inventados: el repositorio es público. Los tests E2E que cambian datos los restauran al terminar, aunque fallen a medias (`try/finally`).
- **UI.** Los componentes de `@/components/ui` son base-ui, no Radix.
- **Comandos E2E** (Windows, Git Bash):
  - Si Docker no está arrancado: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar a que `docker info` responda.
  - `E2E_PG_PORT=55433 npm run e2e:db:up`
  - Suite completa: `E2E_PG_PORT=55433 npm run test:e2e` (reinicia la BD y lanza Playwright).
  - Un solo spec: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/NOMBRE.spec.ts`
  - El puerto **3100 tiene que estar libre**: si hay un servidor vivo, Playwright lo reutiliza (`reuseExistingServer`) y probaría un build viejo. Comprobar con `netstat -ano | grep ":3100"`.
  - Deja **al menos 60 s entre dos ejecuciones de Playwright**: el proyecto `setup` hace logins y el login admite 5 intentos por minuto.

## Contexto verificado (2026-09-29, rama `feat/plazo-tickets-configurable`)

- `src/lib/kpi-tickets.ts:21` define `PLAZO_HORAS = 12`. Solo lo usa `clasificarEpisodio` (líneas 233 y 237). De ella dependen `contarTicketsEnPlazo` (254), `ticketsEnPlazoPorMes` (269) y `detalleTicketsMes` (304). No hay más usos de `PLAZO_HORAS` en `src/` ni en `e2e/`.
- Consumidores de esas funciones fuera de los tests: solo `src/components/charts/comercial/commercial-kpi-table.tsx`, línea 447 (`ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets)`) y línea 498 (`detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets)`). El comentario de la línea 414 habla de «cruzara las 12 horas».
- `tickets-detalle-dialog.tsx` **no** lleva ningún 12 escrito: su subtítulo solo explica el horario (`HORA_INICIO`/`HORA_FIN`). Hay que **añadir** el plazo aplicado, no sustituirlo.
- `KpiTargetRow` (`src/actions/kpi-actions.ts:26`) tiene `kpi_key`, `target_value`, `weight_pct`. `getKpiTargets` (40) convierte los numeric con `Number()`. `saveKpiTargets` (66) hace upsert por item y **borra las filas del ámbito cuyos KPIs no se envían** (98-106). La pantalla solo envía los KPIs con peso mayor que 0 (`kpi-targets-form.tsx:83-91`).
- `kpiTargetsSchema` (`src/lib/validation.ts:89`): Zod 4; `z.object` descarta las claves desconocidas, así que hoy un `plazo_horas` pasaría sin error y sin guardarse.
- `kpiTargets` (`src/db/schema.ts:236`) con `check()` de Drizzle para `target_value` y `weight_pct`.
- `drizzle/0011_tech_service_bucket.sql`: comentario de cabecera sin tildes, `ADD COLUMN IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object` para el `CHECK`, `--> statement-breakpoint` entre sentencias, sangría con tabuladores.
- `e2e/db/apply-migrations.mjs` aplica **todos** los `.sql` de `drizzle/` ordenados por nombre: recoge la `0012` sin cambios.
- `e2e/db/seed-app.mjs:108-120` siembra solo `ventas_nuevos` (1000, peso 60) y `ventas_existentes` (2000, peso 40) en el total del año en curso. **No hay fila de `tickets_st`**.
- `e2e/db/seed-hub.mjs:97-139`: febrero del año en curso tiene cinco episodios contables de 2 h, 18 h, 8 h (T-FICT-003), 1 h y 18 h, más un rechazo. Con plazo 12: 3/5 = 60,0 %. **Con plazo 8**, el de 8 h queda justo en la frontera (fuera) y da 2/5 = 40,0 %. La semilla ya tiene episodios entre los dos plazos: **no hace falta tocarla**.
- `e2e/specs/kpis-comerciales.spec.ts:215-274` comprueba el 60.0 % de febrero y el pie «3 en plazo de 5 → 60.0%». Sigue valiendo si el E2E nuevo restaura el estado.
- La pantalla de metas remonta `KpiTargetsFields` con `key={year|scope}` y superpone `edits` a lo guardado; el lector la ve con `readOnly` (`puedeEditarMetas`). La rejilla es `FILA = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px] sm:items-center"`.
- La tabla pide las metas con la clave `["kpi-targets", year, owner]`, donde `owner` es `"__total__"` para el total; la pantalla de metas invalida `["kpi-targets", year, scope]` con el mismo centinela.
- Playwright corre en serie (`workers: 1`, `fullyParallel: false`).

## Decisiones del plan que la spec no fijaba

1. **Dónde vive el plazo cuando `tickets_st` no tiene peso.** `saveKpiTargets` borra la fila de un KPI sin peso, y con ella su plazo. Para no perder un plazo sin avisar, la pantalla **no deja guardar** un plazo distinto de 12 si «Tickets de Servicio Técnico en plazo» no tiene meta y peso, y lo explica con un aviso. Con 12 (el valor por defecto) sí deja guardar, porque sin fila el plazo vale 12 igualmente.
2. **Consulta del total en la tabla.** Se usa la clave `["kpi-targets", year, TOTAL]`. Con el total elegido coincide con la de `metasQ` y TanStack Query hace una sola petición (es «reutilizar esa consulta»); con un comercial elegido es una consulta aparte. La pantalla de metas ya invalida esa misma clave al guardar el total.
3. **Coma decimal.** El campo de plazo acepta `4,5` y `4.5`.
4. **Tras guardar**, el campo de plazo vuelve a enseñar lo guardado (o 12 si la fila de tickets desapareció).

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `drizzle/0012_kpi_plazo_horas.sql` | Crear | Columna `plazo_horas numeric(6,2)` y su `CHECK`, re-ejecutable. |
| `src/db/schema.ts` | Modificar | `plazo_horas` y su `check` en `kpiTargets`. |
| `src/lib/commercial-kpis.ts` | Modificar | Constante `KPI_CON_PLAZO = "tickets_st"`. |
| `src/lib/validation.ts` | Modificar | `plazo_horas` en `kpiTargetsSchema` y regla de dónde puede ir. |
| `src/lib/__tests__/validation-kpi.test.ts` | Modificar | Tests del plazo en el esquema. |
| `src/lib/kpi-metas.ts` | Crear | Lógica pura: fila de BD → `KpiTargetRow`, borrador de la pantalla, validación del plazo. |
| `src/lib/__tests__/kpi-metas.test.ts` | Crear | Tests de `kpi-metas`. |
| `src/actions/kpi-actions.ts` | Modificar | `KpiTargetRow.plazo_horas`; leer y guardar la columna. |
| `src/lib/kpi-tickets.ts` | Modificar | `PLAZO_HORAS_POR_DEFECTO`, parámetro `plazoHoras`, `plazoTicketsDelAnio`, `textoPlazo`. |
| `src/lib/__tests__/kpi-tickets.test.ts` | Modificar | Firma nueva y tests de plazos distintos. |
| `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx` | Modificar | Campo «Plazo (h)» en el total. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Plazo del total del año a la fila y al detalle. |
| `src/components/charts/comercial/tickets-detalle-dialog.tsx` | Modificar | Enseñar el plazo aplicado. |
| `e2e/specs/kpi-targets.spec.ts` | Modificar | Campo de plazo: valor por defecto, ámbito de vendedor, validación, lector. |
| `e2e/specs/plazo-tickets.spec.ts` | Crear | Cambiar el plazo cambia la cifra y el detalle; restaura al terminar. |

---

## Task 1: Esquema de validación del plazo

**Files:**
- Modify: `src/lib/commercial-kpis.ts`
- Modify: `src/lib/validation.ts`
- Test: `src/lib/__tests__/validation-kpi.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/__tests__/validation-kpi.test.ts` (después del `describe("kpiTargetsSchema", ...)` existente):

```ts
describe("kpiTargetsSchema: plazo de tickets", () => {
  // Pesos que suman 100 con tickets_st medido: solo cambia el plazo o en qué KPI va.
  const conPlazo = (plazo_horas: number | null, kpi_key = "tickets_st") => [
    { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 60, plazo_horas: null },
    { kpi_key, target_value: 80, weight_pct: 40, plazo_horas },
  ];
  const total = (items: unknown[]) => kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success;
  const vendedor = (items: unknown[]) =>
    kpiTargetsSchema.safeParse({ year, salesperson: "Vendedor Ficticio", items }).success;

  it("acepta el plazo en tickets_st del total", () => {
    expect(total(conPlazo(8))).toBe(true);
  });
  it("acepta un plazo con dos decimales", () => {
    expect(total(conPlazo(4.5))).toBe(true);
    expect(total(conPlazo(12.25))).toBe(true);
  });
  it("acepta un plazo nulo", () => {
    expect(total(conPlazo(null))).toBe(true);
  });
  // La pantalla envía plazo_horas: null en todos los KPIs de un vendedor.
  it("acepta plazos nulos en el ambito de un vendedor", () => {
    expect(vendedor(conPlazo(null))).toBe(true);
  });
  it("rechaza el plazo en otro KPI", () => {
    expect(total(conPlazo(8, "ventas_existentes"))).toBe(false);
  });
  // El KPI de tickets solo se mide a nivel compañía: un plazo por vendedor no se usaría nunca.
  it("rechaza el plazo en el ambito de un vendedor", () => {
    expect(vendedor(conPlazo(8))).toBe(false);
  });
  it("rechaza un plazo de 0 o negativo", () => {
    expect(total(conPlazo(0))).toBe(false);
    expect(total(conPlazo(-4))).toBe(false);
  });
  // numeric(6,2) redondearía al guardar: lo guardado no cuadraría con lo validado.
  it("rechaza un plazo con mas de dos decimales", () => {
    expect(total(conPlazo(4.125))).toBe(false);
  });
  it("rechaza un plazo de mas de 999 horas", () => {
    expect(total(conPlazo(1000))).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/validation-kpi.test.ts`
Expected: FAIL. 5 tests fallan («rechaza el plazo en otro KPI», «... en el ambito de un vendedor», «... de 0 o negativo», «... mas de dos decimales», «... mas de 999 horas»): Zod descarta `plazo_horas` como clave desconocida y el esquema devuelve `true`. Los de «acepta» pasan.

- [ ] **Step 3: Implementación mínima**

En `src/lib/commercial-kpis.ts`, justo debajo de `export const KPI_KEYS: string[] = COMMERCIAL_KPIS.map((k) => k.key);` añadir:

```ts

/** Único KPI con plazo configurable: «Tickets de Servicio Técnico en plazo». Solo se
 *  mide a nivel compañía, así que su plazo solo se guarda en las metas del total. */
export const KPI_CON_PLAZO = "tickets_st";
```

En `src/lib/validation.ts`, añadir `KPI_CON_PLAZO` al import existente de `@/lib/commercial-kpis` (el que ya trae `KPI_KEYS` y `KPI_FIRST_YEAR`; conservar el resto de nombres de ese import tal cual). Después sustituir el bloque completo de `kpiTargetsSchema` (desde el comentario `// Metas y pesos de un ámbito:` hasta el `);` que cierra el `.refine` de los pesos) por:

```ts
// Metas y pesos de un ámbito: el total de la compañía (salesperson nulo) o un
// vendedor. Solo se envían los KPIs que se miden ese año en ese ámbito, y sus
// pesos suman 100. Los dos decimales son los que admite la columna numeric:
// aceptar más haría que lo guardado no cuadrase con lo validado.
export const kpiTargetsSchema = z
  .object({
    year: z.number().int().min(KPI_FIRST_YEAR).max(currentYear + 1),
    salesperson: z.string().trim().min(1, "El vendedor no puede ir vacío").max(120).nullable(),
    items: z
      .array(
        z.object({
          kpi_key: z.string().refine((k) => KPI_KEYS.includes(k), "KPI desconocido"),
          target_value: z.number().positive("La meta debe ser mayor que cero").multipleOf(0.01, "La meta admite dos decimales como mucho"),
          weight_pct: z.number().min(0).max(100).multipleOf(0.01, "El peso admite dos decimales como mucho"),
          // Horas laborables del plazo de tickets. Opcional y nulo en el resto de KPIs:
          // la columna es numeric(6,2) y 999 h ya son meses de jornada.
          plazo_horas: z
            .number()
            .positive("El plazo debe ser mayor que cero")
            .max(999, "El plazo admite 999 horas como mucho")
            .multipleOf(0.01, "El plazo admite dos decimales como mucho")
            .nullable()
            .optional(),
        })
      )
      .min(1, "Hay que enviar al menos un KPI"),
  })
  .refine(
    (v) => Math.round(v.items.reduce((s, i) => s + i.weight_pct, 0) * 100) === 10000,
    { message: "Los pesos deben sumar 100", path: ["items"] }
  )
  // El plazo solo tiene sentido en tickets_st del total: es el único ámbito en que se
  // mide ese KPI. En otro sitio se guardaría un dato que nadie lee.
  .refine(
    (v) => v.items.every((i) => i.plazo_horas == null || (i.kpi_key === KPI_CON_PLAZO && v.salesperson === null)),
    { message: "El plazo solo se configura en Tickets de Servicio Técnico en plazo del total de compañía", path: ["items"] }
  );
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/validation-kpi.test.ts`
Expected: PASS (los 11 tests previos y los 9 nuevos).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commercial-kpis.ts src/lib/validation.ts src/lib/__tests__/validation-kpi.test.ts
git commit -m "feat(kpis): valida el plazo de tickets en las metas del total"
```

---

## Task 2: Columna `plazo_horas`, lectura y guardado

**Files:**
- Create: `drizzle/0012_kpi_plazo_horas.sql`
- Modify: `src/db/schema.ts`
- Create: `src/lib/kpi-metas.ts`
- Create: `src/lib/__tests__/kpi-metas.test.ts`
- Modify: `src/actions/kpi-actions.ts`
- Modify: `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx` (solo para que compile)

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/kpi-metas.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { filaDeMeta } from "@/lib/kpi-metas";

describe("filaDeMeta", () => {
  it("convierte a numero los numeric que Drizzle devuelve como texto", () => {
    expect(filaDeMeta({ kpi_key: "tickets_st", target_value: "80.00", weight_pct: "40.00", plazo_horas: "4.50" }))
      .toEqual({ kpi_key: "tickets_st", target_value: 80, weight_pct: 40, plazo_horas: 4.5 });
  });

  // Number(null) es 0: sin este cuidado, un anio sin plazo guardado mediria con plazo 0
  // y todos sus tickets saldrian fuera de plazo.
  it("un plazo nulo sigue siendo nulo, no 0", () => {
    expect(
      filaDeMeta({ kpi_key: "ventas_nuevos", target_value: "1000.00", weight_pct: "60.00", plazo_horas: null }).plazo_horas
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/__tests__/kpi-metas.test.ts`
Expected: FAIL: no se puede resolver `@/lib/kpi-metas`.

- [ ] **Step 3: Implementación mínima**

Crear `drizzle/0012_kpi_plazo_horas.sql` (y convertirlo a CRLF; la sangría del `DO` es con tabuladores, como en la 0011):

```sql
-- Plazo, en horas laborables, del KPI "Tickets de Servicio Tecnico en plazo".
-- Sustituye a la constante PLAZO_HORAS = 12 de src/lib/kpi-tickets.ts. Solo se
-- rellena en la fila tickets_st del total de la compania (salesperson nulo) de
-- cada anio: ese KPI solo se mide a nivel compania. Nulo = 12 horas, el valor de
-- antes, asi que las cifras no cambian al desplegar.
--
-- Cambio aditivo. Aplicar a mano en la BD del app ANTES de desplegar:
--   psql "$DATABASE_URL" -f drizzle/0012_kpi_plazo_horas.sql
--
-- No lleva ningun UPDATE: se puede volver a ejecutar sin efectos.
ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS plazo_horas numeric(6,2);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE kpi_targets ADD CONSTRAINT kpi_targets_plazo_horas_check
		CHECK (plazo_horas IS NULL OR plazo_horas > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

En `src/db/schema.ts`, dentro de `kpiTargets`, sustituir:

```ts
  weight_pct: numeric("weight_pct", { precision: 5, scale: 2 }).notNull(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("kpi_targets_unique").on(t.company_id, t.record_year, t.kpi_key, t.salesperson).nullsNotDistinct(),
  check("kpi_targets_target_check", sql`${t.target_value} > 0`),
  check("kpi_targets_weight_check", sql`${t.weight_pct} >= 0 AND ${t.weight_pct} <= 100`),
]);
```

por:

```ts
  weight_pct: numeric("weight_pct", { precision: 5, scale: 2 }).notNull(),
  // Horas laborables del plazo del KPI de tickets. Solo en la fila tickets_st del
  // total; nulo = PLAZO_HORAS_POR_DEFECTO (12). Migración 0012.
  plazo_horas: numeric("plazo_horas", { precision: 6, scale: 2 }),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("kpi_targets_unique").on(t.company_id, t.record_year, t.kpi_key, t.salesperson).nullsNotDistinct(),
  check("kpi_targets_target_check", sql`${t.target_value} > 0`),
  check("kpi_targets_weight_check", sql`${t.weight_pct} >= 0 AND ${t.weight_pct} <= 100`),
  check("kpi_targets_plazo_horas_check", sql`${t.plazo_horas} IS NULL OR ${t.plazo_horas} > 0`),
]);
```

Crear `src/lib/kpi-metas.ts` (y convertirlo a CRLF):

```ts
/**
 * Lógica pura de las metas de KPIs: la conversión de la fila de la base y, más
 * adelante, la del borrador de la pantalla de Configuración. Vive fuera de la acción
 * y del componente para poder probarla con vitest, que corre en node.
 */
import type { KpiTargetRow } from "@/actions/kpi-actions";

/** Fila de kpi_targets tal como la devuelve Drizzle: numeric llega como string. */
export interface FilaMetaBd {
  kpi_key: string;
  target_value: string;
  weight_pct: string;
  plazo_horas: string | null;
}

export function filaDeMeta(r: FilaMetaBd): KpiTargetRow {
  return {
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
    // Number(null) sería 0, no «sin plazo»: se conserva el nulo para que la lectura
    // aplique el plazo por defecto.
    plazo_horas: r.plazo_horas === null ? null : Number(r.plazo_horas),
  };
}
```

En `src/actions/kpi-actions.ts`:

1. Añadir el import, debajo de `import { kpiTargetsSchema } from "@/lib/validation";`:

```ts
import { filaDeMeta } from "@/lib/kpi-metas";
```

2. Sustituir la interfaz:

```ts
export interface KpiTargetRow {
  kpi_key: string;
  target_value: number;
  weight_pct: number;
}
```

por:

```ts
export interface KpiTargetRow {
  kpi_key: string;
  target_value: number;
  weight_pct: number;
  /** Plazo en horas laborables. Solo en tickets_st del total; null = plazo por defecto. */
  plazo_horas: number | null;
}
```

3. En `getKpiTargets`, sustituir:

```ts
      weight_pct: kpiTargets.weight_pct,
    })
    .from(kpiTargets)
```

por:

```ts
      weight_pct: kpiTargets.weight_pct,
      plazo_horas: kpiTargets.plazo_horas,
    })
    .from(kpiTargets)
```

y sustituir:

```ts
  // numeric llega como string desde Drizzle.
  return rows.map((r) => ({
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
  }));
```

por:

```ts
  // numeric llega como string desde Drizzle: filaDeMeta lo convierte sin volver 0 un plazo nulo.
  return rows.map(filaDeMeta);
```

4. En `saveKpiTargets`, sustituir el bucle `for (const it of data.items) { ... }` completo por:

```ts
      for (const it of data.items) {
        // Solo tickets_st del total trae plazo (lo garantiza kpiTargetsSchema); el resto
        // guarda nulo, que en la lectura vale el plazo por defecto.
        const plazo = it.plazo_horas == null ? null : String(it.plazo_horas);
        await tx
          .insert(kpiTargets)
          .values({
            company_id: profile.company_id,
            record_year: data.year,
            kpi_key: it.kpi_key,
            salesperson: data.salesperson,
            target_value: String(it.target_value),
            weight_pct: String(it.weight_pct),
            plazo_horas: plazo,
          })
          .onConflictDoUpdate({
            target: [kpiTargets.company_id, kpiTargets.record_year, kpiTargets.kpi_key, kpiTargets.salesperson],
            set: {
              target_value: String(it.target_value),
              weight_pct: String(it.weight_pct),
              plazo_horas: plazo,
              updated_at: new Date().toISOString(),
            },
          });
      }
```

En `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx`, solo para que compile hasta la Task 5, sustituir:

```ts
        weight_pct: Number(draft[k.key]?.weight ?? ""),
      })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0),
```

por:

```ts
        weight_pct: Number(draft[k.key]?.weight ?? ""),
        plazo_horas: null,
      })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0),
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/__tests__/kpi-metas.test.ts`
Expected: PASS (2 tests).

Run: `npx tsc --noEmit`
Expected: sin errores.

Comprobar que la migración aplica y que se puede volver a ejecutar (Docker arrancado):

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset
docker exec -i salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -v ON_ERROR_STOP=1 < drizzle/0012_kpi_plazo_horas.sql
```

Expected: el reset imprime `migracion aplicada: 0012_kpi_plazo_horas.sql`; la segunda ejecución con `psql` termina sin error (solo el NOTICE `column "plazo_horas" of relation "kpi_targets" already exists, skipping`).

- [ ] **Step 5: Commit**

```bash
git add drizzle/0012_kpi_plazo_horas.sql src/db/schema.ts src/lib/kpi-metas.ts src/lib/__tests__/kpi-metas.test.ts src/actions/kpi-actions.ts "src/app/(dashboard)/settings/_components/kpi-targets-form.tsx"
git commit -m "feat(kpis): columna plazo_horas en kpi_targets (migracion 0012)"
```

---

## Task 3: El plazo pasa a ser un parámetro de la lógica de tickets

**Files:**
- Modify: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx` (solo para que compile; el plazo real llega en la Task 6)

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/kpi-tickets.test.ts`, sustituir el bloque de imports (líneas 1-15) por:

```ts
import { describe, it, expect } from "vitest";
import type { KpiTargetRow } from "@/actions/kpi-actions";
import {
  FASE_NOTIFICACION_COMERCIAL,
  PLAZO_HORAS_POR_DEFECTO,
  clasificarEpisodio,
  contarTicketsEnPlazo,
  detalleTicketsMes,
  episodiosNotificacionComercial,
  festivosColombia,
  formatoInstanteBogota,
  horasLaborables,
  normalizarFase,
  plazoTicketsDelAnio,
  ticketsEnPlazoPorMes,
  type CambioFase,
  type Episodio,
} from "@/lib/kpi-tickets";
```

Después sustituir todo el tramo que va desde la línea `// La fase de salida no influye en la clasificación (ya la resume `estado`): se rellena` hasta justo antes de `describe("formatoInstanteBogota", () => {` (es decir, las definiciones de `episodio`, `LUNES_MARZO`, `AHORA` y los `describe` de `ticketsEnPlazoPorMes`, `clasificarEpisodio` y `detalleTicketsMes`) por este bloque completo. Mantiene todos los tests existentes con el plazo por defecto y añade los de otros plazos y los de `plazoTicketsDelAnio`:

```ts
// La fase de salida no influye en la clasificación (ya la resume `estado`): se rellena
// con una coherente con el estado para que el episodio sea verosímil.
const episodio = (inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio => ({
  ticketId: "T-FICT-1",
  numero: null,
  cliente: null,
  inicio,
  fin,
  faseSalida: estado === "medible" ? "Notificación cliente" : estado === "excluido" ? "Por Facturar" : null,
  estado,
});

// Lunes 2 mar 2026 a las 9:00 en Bogota: ninguna de las fechas de estos tests es festiva.
const LUNES_MARZO = bog(2026, 3, 2, 9);
const AHORA = bog(2026, 9, 23, 12);
// Los tests que no hablan del plazo usan el de por defecto: sus cifras son las de
// antes de hacerlo configurable.
const PLAZO = PLAZO_HORAS_POR_DEFECTO;

describe("ticketsEnPlazoPorMes", () => {
  it("un medible de menos de 12 horas laborables esta en plazo", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible")], 2026, AHORA, PLAZO);
    expect(v[2]).toBe(100);
  });

  it("12 horas laborables justas ya estan fuera de plazo", () => {
    // Lunes 9:00 -> martes 12:00: 8 h + 4 h. El plazo es "menos de 12".
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 3, 12), "medible")], 2026, AHORA, PLAZO);
    expect(v[2]).toBe(0);
  });

  it("el valor del mes es en plazo entre contables", () => {
    const v = ticketsEnPlazoPorMes(
      [
        episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
        episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "medible"),
      ],
      2026,
      AHORA,
      PLAZO
    );
    expect(v[2]).toBe(50);
  });

  it("los excluidos no cuentan y un mes sin contables vale null, no 0", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "excluido")], 2026, AHORA, PLAZO);
    expect(v[2]).toBeNull();
  });

  it("un abierto que ya consumio el plazo cuenta como fuera de plazo", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, null, "abierto")], 2026, AHORA, PLAZO);
    expect(v[2]).toBe(0);
  });

  it("un abierto que aun no consumio el plazo todavia no cuenta", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, null, "abierto")], 2026, bog(2026, 3, 2, 15), PLAZO);
    expect(v[2]).toBeNull();
  });

  it("cuenta en el mes de entrada en hora de Bogota, no en UTC", () => {
    // Martes 31 mar 22:00 en Bogota ya es 1 de abril en UTC.
    const v = ticketsEnPlazoPorMes(
      [episodio(bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible")],
      2026,
      AHORA,
      PLAZO
    );
    expect(v[2]).toBe(100);
    expect(v[3]).toBeNull();
  });

  it("descarta los episodios de otros anios", () => {
    const v = ticketsEnPlazoPorMes([episodio(bog(2025, 12, 30, 9), bog(2025, 12, 30, 10), "medible")], 2026, AHORA, PLAZO);
    expect(v).toEqual(new Array(12).fill(null));
  });

  it("devuelve siempre doce valores", () => {
    expect(ticketsEnPlazoPorMes([], 2026, AHORA, PLAZO)).toHaveLength(12);
  });

  it("los contadores de los doce meses suman los episodios del anio que cuentan", () => {
    const episodios = [
      episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // cuenta: en plazo
      episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "medible"), // cuenta: fuera
      episodio(bog(2026, 5, 4, 9), bog(2026, 5, 4, 10), "excluido"), // no cuenta
      episodio(bog(2026, 6, 1, 9), null, "abierto"), // cuenta: fuera
      episodio(bog(2026, 9, 23, 11), null, "abierto"), // no cuenta todavia
      episodio(bog(2025, 7, 1, 9), bog(2025, 7, 1, 10), "medible"), // otro anio
    ];
    const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, 2026, AHORA, PLAZO);
    const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(suma(enPlazo)).toBe(1);
    expect(suma(fueraDePlazo)).toBe(2);
  });
});

describe("ticketsEnPlazoPorMes con otro plazo", () => {
  // La celda tiene que usar el plazo que recibe, no el de por defecto: con 8 horas el
  // episodio de 8 h justas pasa de en plazo a fuera.
  it("con plazo 8, un medible de 8 horas justas deja de contar en plazo", () => {
    const episodios = [
      episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // 1 h
      episodio(LUNES_MARZO, bog(2026, 3, 2, 17), "medible"), // 8 h
    ];
    expect(ticketsEnPlazoPorMes(episodios, 2026, AHORA, 12)[2]).toBe(100);
    expect(ticketsEnPlazoPorMes(episodios, 2026, AHORA, 8)[2]).toBe(50);
  });
});

describe("clasificarEpisodio", () => {
  it("un medible de menos de 12 horas laborables esta en plazo y lleva sus horas", () => {
    // Lunes 9:00 -> martes 11:30: 8 h + 3,5 h.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 3, 11, 30), "medible"), AHORA, PLAZO))
      .toEqual({ estado: "en_plazo", horas: 11.5 });
  });

  it("un medible de 12 horas justas esta fuera de plazo", () => {
    // Lunes 9:00 -> martes 12:00: 8 h + 4 h. El plazo es "menos de 12".
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 3, 12), "medible"), AHORA, PLAZO))
      .toEqual({ estado: "fuera_de_plazo", horas: 12 });
  });

  it("un abierto que a fecha de ahora llega justo a 12 horas esta fuera de plazo", () => {
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 3, 12), PLAZO))
      .toEqual({ estado: "fuera_de_plazo", horas: 12 });
  });

  it("un abierto con menos de 12 horas todavia no vence y cuenta sus horas hasta ahora", () => {
    // Lunes 9:00 -> lunes 15:00.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 2, 15), PLAZO))
      .toEqual({ estado: "abierto_sin_vencer", horas: 6 });
  });

  // El plazo es configurable por año: la frontera se mueve con él y sigue siendo
  // «menos de», tanto en los cerrados como en los abiertos.
  it("con plazo 8, un medible de 8 horas justas esta fuera y uno de 7,5 en plazo", () => {
    // Lunes 9:00 -> lunes 17:00: 8 h. Lunes 9:00 -> lunes 16:30: 7,5 h.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 2, 17), "medible"), AHORA, 8))
      .toEqual({ estado: "fuera_de_plazo", horas: 8 });
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 2, 16, 30), "medible"), AHORA, 8))
      .toEqual({ estado: "en_plazo", horas: 7.5 });
  });

  it("con plazo 8, un abierto vence al llegar a 8 horas y no antes", () => {
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 2, 17), 8))
      .toEqual({ estado: "fuera_de_plazo", horas: 8 });
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 2, 16, 30), 8))
      .toEqual({ estado: "abierto_sin_vencer", horas: 7.5 });
  });

  it("con plazo 12, justo por debajo de 12 horas sigue en plazo o sin vencer", () => {
    // Lunes 9:00 -> martes 11:30: 8 h + 3,5 h.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 3, 11, 30), "medible"), AHORA, 12))
      .toEqual({ estado: "en_plazo", horas: 11.5 });
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 3, 11, 30), 12))
      .toEqual({ estado: "abierto_sin_vencer", horas: 11.5 });
  });

  it("un excluido no mide horas", () => {
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "excluido"), AHORA, PLAZO))
      .toEqual({ estado: "excluido", horas: 0 });
  });
});

/** Episodio de un ticket concreto, para los tests que comprueban qué filas salen. */
const ep = (ticketId: string, inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio =>
  ({ ...episodio(inicio, fin, estado), ticketId });

describe("detalleTicketsMes", () => {
  it("toma los episodios por su mes de entrada en hora de Bogota y descarta otros anios", () => {
    const episodios = [
      // Martes 31 mar 22:00 en Bogota ya es 1 de abril en UTC: es de marzo.
      ep("T-FICT-MAR", bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible"),
      ep("T-FICT-ABR", bog(2026, 4, 1, 9), bog(2026, 4, 1, 10), "medible"),
      ep("T-FICT-2025", bog(2025, 3, 10, 9), bog(2025, 3, 10, 10), "medible"),
    ];
    expect(detalleTicketsMes(episodios, 2026, 3, AHORA, PLAZO).cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-MAR"]);
    expect(detalleTicketsMes(episodios, 2026, 4, AHORA, PLAZO).cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-ABR"]);
  });

  it("cuentan: primero los fuera de plazo y despues los en plazo, de mas horas a menos", () => {
    const d = detalleTicketsMes(
      [
        ep("T-FICT-EN-1", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // 1 h
        ep("T-FICT-FUERA-12", LUNES_MARZO, bog(2026, 3, 3, 12), "medible"), // 12 h
        ep("T-FICT-EN-8", LUNES_MARZO, bog(2026, 3, 2, 17), "medible"), // 8 h
        ep("T-FICT-FUERA-18B", bog(2026, 3, 3, 9), bog(2026, 3, 5, 9), "medible"), // 18 h, entra el martes
        ep("T-FICT-ABIERTO", bog(2026, 3, 9, 9), null, "abierto"), // meses abierto: fuera
        ep("T-FICT-FUERA-18", LUNES_MARZO, bog(2026, 3, 4, 9), "medible"), // 18 h, entra el lunes
      ],
      2026,
      3,
      AHORA,
      PLAZO
    );
    // A igualdad de horas desempata la entrada: el orden no puede depender de cómo
    // lleguen los cambios del hub.
    expect(d.cuentan.map((f) => f.ticketId)).toEqual([
      "T-FICT-ABIERTO", "T-FICT-FUERA-18", "T-FICT-FUERA-18B", "T-FICT-FUERA-12", "T-FICT-EN-8", "T-FICT-EN-1",
    ]);
    expect([d.enPlazo, d.total]).toEqual([2, 6]);
  });

  it("no cuentan: los excluidos y los abiertos sin vencer, por orden de entrada", () => {
    const ahora = bog(2026, 3, 10, 12);
    const d = detalleTicketsMes(
      [
        ep("T-FICT-X1", bog(2026, 3, 5, 9), bog(2026, 3, 5, 10), "excluido"),
        ep("T-FICT-AB", bog(2026, 3, 10, 9), null, "abierto"), // 3 h a fecha de ahora
        ep("T-FICT-X0", bog(2026, 3, 2, 9), bog(2026, 3, 2, 10), "excluido"),
        ep("T-FICT-M", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
      ],
      2026,
      3,
      ahora,
      PLAZO
    );
    expect(d.noCuentan.map((f) => [f.ticketId, f.estado, f.horas])).toEqual([
      ["T-FICT-X0", "excluido", 0],
      ["T-FICT-X1", "excluido", 0],
      ["T-FICT-AB", "abierto_sin_vencer", 3],
    ]);
    expect(d.cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-M"]);
    expect([d.enPlazo, d.total]).toEqual([1, 1]);
  });

  it("cada fila lleva el ticket, el cliente, la salida y las horas del episodio", () => {
    const e: Episodio = {
      ticketId: "T-FICT-1",
      numero: 9001,
      cliente: "Cliente Ficticio A",
      inicio: LUNES_MARZO,
      fin: bog(2026, 3, 2, 11),
      faseSalida: "Notificación cliente",
      estado: "medible",
    };
    expect(detalleTicketsMes([e], 2026, 3, AHORA, PLAZO)).toEqual({
      cuentan: [
        {
          ticketId: "T-FICT-1",
          numero: 9001,
          cliente: "Cliente Ficticio A",
          inicio: LUNES_MARZO,
          fin: bog(2026, 3, 2, 11),
          faseSalida: "Notificación cliente",
          horas: 2,
          estado: "en_plazo",
        },
      ],
      noCuentan: [],
      enPlazo: 1,
      total: 1,
    });
  });

  it("clasifica con el plazo recibido", () => {
    const episodios = [
      ep("T-FICT-1H", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // 1 h
      ep("T-FICT-8H", LUNES_MARZO, bog(2026, 3, 2, 17), "medible"), // 8 h
    ];
    const d = detalleTicketsMes(episodios, 2026, 3, AHORA, 8);
    expect(d.cuentan.map((f) => [f.ticketId, f.estado])).toEqual([
      ["T-FICT-8H", "fuera_de_plazo"],
      ["T-FICT-1H", "en_plazo"],
    ]);
    expect([d.enPlazo, d.total]).toEqual([1, 2]);
  });

  // La celda y el diálogo tienen que decir lo mismo: si esto falla, el pie del detalle
  // enseñaría un porcentaje distinto del de la celda pulsada.
  it("para cada mes, en plazo y total coinciden con los contadores de la celda", () => {
    const episodios = [
      ep("T-FICT-A", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
      ep("T-FICT-B", LUNES_MARZO, bog(2026, 3, 4, 9), "medible"),
      ep("T-FICT-C", bog(2026, 5, 4, 9), bog(2026, 5, 4, 10), "excluido"),
      ep("T-FICT-D", bog(2026, 6, 1, 9), null, "abierto"),
      ep("T-FICT-E", bog(2026, 9, 23, 11), null, "abierto"),
      ep("T-FICT-F", bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible"),
      ep("T-FICT-G", bog(2025, 7, 1, 9), bog(2025, 7, 1, 10), "medible"),
    ];
    const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, 2026, AHORA, PLAZO);
    for (let mes = 1; mes <= 12; mes++) {
      const d = detalleTicketsMes(episodios, 2026, mes, AHORA, PLAZO);
      expect([d.enPlazo, d.total]).toEqual([enPlazo[mes - 1], enPlazo[mes - 1] + fueraDePlazo[mes - 1]]);
    }
  });
});

describe("plazoTicketsDelAnio", () => {
  const meta = (kpi_key: string, plazo_horas: number | null): KpiTargetRow =>
    ({ kpi_key, target_value: 80, weight_pct: 40, plazo_horas });

  it("sin fila de tickets vale el plazo por defecto", () => {
    expect(plazoTicketsDelAnio([])).toBe(12);
    expect(plazoTicketsDelAnio([meta("ventas_nuevos", null)])).toBe(PLAZO_HORAS_POR_DEFECTO);
  });

  it("con la fila de tickets sin plazo guardado vale el plazo por defecto", () => {
    expect(plazoTicketsDelAnio([meta("ventas_nuevos", null), meta("tickets_st", null)])).toBe(12);
  });

  it("con plazo guardado devuelve ese plazo", () => {
    expect(plazoTicketsDelAnio([meta("ventas_nuevos", null), meta("tickets_st", 4.5)])).toBe(4.5);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL. `PLAZO_HORAS_POR_DEFECTO` es `undefined` (las comparaciones con él dan `false`, así que fallan los tests de `ticketsEnPlazoPorMes`, `clasificarEpisodio` y `detalleTicketsMes`), `plazoTicketsDelAnio` no es una función y los tests con plazo 8 siguen clasificando con 12. Los de `festivosColombia`, `horasLaborables`, `normalizarFase`, `episodiosNotificacionComercial` y `formatoInstanteBogota` pasan.

- [ ] **Step 3: Implementación mínima**

En `src/lib/kpi-tickets.ts`:

1. Sustituir la línea

```ts
/** Fase de Zoho Desk en la que Comercial tiene el ticket. Literal exacto de Desk.
```

por:

```ts
import type { KpiTargetRow } from "@/actions/kpi-actions";
import { KPI_CON_PLAZO } from "@/lib/commercial-kpis";

/** Fase de Zoho Desk en la que Comercial tiene el ticket. Literal exacto de Desk.
```

2. Sustituir `export const PLAZO_HORAS = 12;` por:

```ts
/** Plazo, en horas laborables, de un año sin plazo guardado en sus metas: el que había
 *  fijo antes de hacerlo configurable, para que esos años no cambien de cifra. */
export const PLAZO_HORAS_POR_DEFECTO = 12;
```

3. Sustituir la función `clasificarEpisodio` completa (con su comentario) por:

```ts
/**
 * Única regla de plazo del KPI (spec base, §2): de aquí salen la cifra de la celda y
 * el detalle, así que no pueden discrepar. Un medible se mide hasta su salida; un
 * abierto, hasta `ahora`, y solo cuenta (fuera de plazo) cuando ya consumió el plazo
 * entero, porque antes todavía puede acabar en plazo. Cualquier otro caso se trata como
 * excluido, igual que hacía el contador antes de apoyarse en esta función.
 * `plazoHoras` es obligatorio a propósito: ningún consumidor puede quedarse con el de
 * por defecto sin darse cuenta.
 */
export function clasificarEpisodio(e: Episodio, ahora: number, plazoHoras: number): Clasificacion {
  if (e.estado === "medible" && e.fin !== null) {
    const horas = horasLaborables(e.inicio, e.fin);
    return { estado: horas < plazoHoras ? "en_plazo" : "fuera_de_plazo", horas };
  }
  if (e.estado === "abierto") {
    const horas = horasLaborables(e.inicio, ahora);
    return { estado: horas >= plazoHoras ? "fuera_de_plazo" : "abierto_sin_vencer", horas };
  }
  return { estado: "excluido", horas: 0 };
}

/**
 * Plazo del año a partir de las metas del TOTAL de la compañía: el KPI de tickets solo
 * se mide a ese nivel, así que las metas de un vendedor no traen plazo. Sin fila de
 * tickets o con el plazo nulo vale el de por defecto.
 */
export function plazoTicketsDelAnio(metasTotal: KpiTargetRow[]): number {
  return metasTotal.find((m) => m.kpi_key === KPI_CON_PLAZO)?.plazo_horas ?? PLAZO_HORAS_POR_DEFECTO;
}
```

4. Sustituir:

```ts
export function contarTicketsEnPlazo(episodios: Episodio[], anio: number, ahora: number): ConteoTickets {
```

por:

```ts
export function contarTicketsEnPlazo(
  episodios: Episodio[],
  anio: number,
  ahora: number,
  plazoHoras: number
): ConteoTickets {
```

y, dentro de esa función, `const { estado } = clasificarEpisodio(e, ahora);` por `const { estado } = clasificarEpisodio(e, ahora, plazoHoras);`.

5. Sustituir:

```ts
export function ticketsEnPlazoPorMes(episodios: Episodio[], anio: number, ahora: number): (number | null)[] {
  const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, anio, ahora);
```

por:

```ts
export function ticketsEnPlazoPorMes(
  episodios: Episodio[],
  anio: number,
  ahora: number,
  plazoHoras: number
): (number | null)[] {
  const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, anio, ahora, plazoHoras);
```

6. Sustituir:

```ts
export function detalleTicketsMes(episodios: Episodio[], anio: number, mes: number, ahora: number): DetalleTicketsMes {
```

por:

```ts
export function detalleTicketsMes(
  episodios: Episodio[],
  anio: number,
  mes: number,
  ahora: number,
  plazoHoras: number
): DetalleTicketsMes {
```

y, dentro de esa función, `const { estado, horas } = clasificarEpisodio(e, ahora);` por `const { estado, horas } = clasificarEpisodio(e, ahora, plazoHoras);`.

En `src/components/charts/comercial/commercial-kpi-table.tsx` (paso transitorio para que compile; la Task 6 lo cambia por el plazo del año):

- Sustituir `import { detalleTicketsMes, episodiosNotificacionComercial, ticketsEnPlazoPorMes } from "@/lib/kpi-tickets";` por:

```ts
import {
  PLAZO_HORAS_POR_DEFECTO, detalleTicketsMes, episodiosNotificacionComercial, ticketsEnPlazoPorMes,
} from "@/lib/kpi-tickets";
```

- Sustituir `return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets), meta, null, year, hoy);` por:

```ts
        return construirFila(
          def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets, PLAZO_HORAS_POR_DEFECTO), meta, null, year, hoy
        );
```

- Sustituir `? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets)` por `? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets, PLAZO_HORAS_POR_DEFECTO)`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS (los existentes y los 8 nuevos).

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `grep -rn "PLAZO_HORAS\b" src e2e`
Expected: ninguna coincidencia (solo queda `PLAZO_HORAS_POR_DEFECTO`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts src/components/charts/comercial/commercial-kpi-table.tsx
git commit -m "feat(kpis): el plazo de tickets en plazo pasa a ser un parametro"
```

---

## Task 4: Lógica pura del borrador de metas con plazo

**Files:**
- Modify: `src/lib/kpi-metas.ts`
- Test: `src/lib/__tests__/kpi-metas.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Sustituir el contenido completo de `src/lib/__tests__/kpi-metas.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import type { KpiTargetRow } from "@/actions/kpi-actions";
import {
  AVISO_PLAZO_INVALIDO,
  AVISO_PLAZO_SIN_FILA,
  evaluarBorrador,
  filaDeMeta,
  parsePlazo,
  plazoInicial,
  toDraft,
  type Draft,
} from "@/lib/kpi-metas";

const meta = (kpi_key: string, plazo_horas: number | null): KpiTargetRow =>
  ({ kpi_key, target_value: 80, weight_pct: 40, plazo_horas });

describe("filaDeMeta", () => {
  it("convierte a numero los numeric que Drizzle devuelve como texto", () => {
    expect(filaDeMeta({ kpi_key: "tickets_st", target_value: "80.00", weight_pct: "40.00", plazo_horas: "4.50" }))
      .toEqual({ kpi_key: "tickets_st", target_value: 80, weight_pct: 40, plazo_horas: 4.5 });
  });

  // Number(null) es 0: sin este cuidado, un anio sin plazo guardado mediria con plazo 0
  // y todos sus tickets saldrian fuera de plazo.
  it("un plazo nulo sigue siendo nulo, no 0", () => {
    expect(
      filaDeMeta({ kpi_key: "ventas_nuevos", target_value: "1000.00", weight_pct: "60.00", plazo_horas: null }).plazo_horas
    ).toBeNull();
  });
});

describe("toDraft", () => {
  it("rellena como texto los KPIs guardados y deja vacios los demas", () => {
    const d = toDraft([{ kpi_key: "ventas_nuevos", target_value: 1000, weight_pct: 60, plazo_horas: null }]);
    expect(d.ventas_nuevos).toEqual({ target: "1000", weight: "60" });
    expect(d.tickets_st).toEqual({ target: "", weight: "" });
  });

  it("ignora claves que no estan en el catalogo", () => {
    const d = toDraft([{ kpi_key: "inventado", target_value: 1, weight_pct: 1, plazo_horas: null }]);
    expect(d).not.toHaveProperty("inventado");
  });
});

describe("plazoInicial", () => {
  it("sin plazo guardado propone el de por defecto", () => {
    expect(plazoInicial([])).toBe("12");
    expect(plazoInicial([meta("tickets_st", null)])).toBe("12");
  });

  it("con plazo guardado lo propone tal cual", () => {
    expect(plazoInicial([meta("ventas_nuevos", null), meta("tickets_st", 4.5)])).toBe("4.5");
  });
});

describe("parsePlazo", () => {
  it("acepta enteros y hasta dos decimales, con punto o con coma", () => {
    expect(parsePlazo("12")).toBe(12);
    expect(parsePlazo(" 8 ")).toBe(8);
    expect(parsePlazo("4.5")).toBe(4.5);
    expect(parsePlazo("4,5")).toBe(4.5);
    expect(parsePlazo("7,25")).toBe(7.25);
    expect(parsePlazo("999")).toBe(999);
  });

  it("rechaza vacio, texto, cero, negativos, mas de dos decimales y mas de 999", () => {
    for (const texto of ["", "  ", "abc", "0", "0.00", "-4", "4.125", "1000", "1e2", "4."]) {
      expect(parsePlazo(texto)).toBeNull();
    }
  });
});

/** Borrador con los KPIs indicados rellenos y el resto vacío, como lo deja la pantalla. */
function borrador(valores: Record<string, [string, string]>): Draft {
  const d = toDraft([]);
  for (const [clave, [target, weight]] of Object.entries(valores)) d[clave] = { target, weight };
  return d;
}

const CON_TICKETS = borrador({
  ventas_nuevos: ["1000", "50"],
  ventas_existentes: ["2000", "40"],
  tickets_st: ["80", "10"],
});
// Como la semilla de E2E: tickets sin meta ni peso.
const SIN_TICKETS = borrador({ ventas_nuevos: ["1000", "60"], ventas_existentes: ["2000", "40"] });

describe("evaluarBorrador", () => {
  it("en el total, el plazo viaja solo en la fila de tickets", () => {
    const e = evaluarBorrador(CON_TICKETS, null, "8");
    expect(e.items).toEqual([
      { kpi_key: "ventas_nuevos", target_value: 1000, weight_pct: 50, plazo_horas: null },
      { kpi_key: "ventas_existentes", target_value: 2000, weight_pct: 40, plazo_horas: null },
      { kpi_key: "tickets_st", target_value: 80, weight_pct: 10, plazo_horas: 8 },
    ]);
    expect(e.suma).toBe(100);
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
  });

  it("acepta la coma decimal en el plazo", () => {
    const tickets = evaluarBorrador(CON_TICKETS, null, "4,5").items.find((i) => i.kpi_key === "tickets_st");
    expect(tickets?.plazo_horas).toBe(4.5);
  });

  // El KPI de tickets solo se mide a nivel compañía: el servidor rechaza un plazo de vendedor.
  it("en el ambito de un vendedor no envia plazo aunque el campo tenga uno", () => {
    const e = evaluarBorrador(CON_TICKETS, "Vendedor Ficticio", "8");
    expect(e.items.every((i) => i.plazo_horas === null)).toBe(true);
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
  });

  it("un plazo que no es un numero mayor que 0 impide guardar", () => {
    for (const texto of ["", "0", "-1", "abc", "4.125"]) {
      const e = evaluarBorrador(CON_TICKETS, null, texto);
      expect(e.valido).toBe(false);
      expect(e.pesosValidos).toBe(true);
      expect(e.avisoPlazo).toBe(AVISO_PLAZO_INVALIDO);
    }
  });

  it("sin fila de tickets deja guardar con el plazo por defecto", () => {
    const e = evaluarBorrador(SIN_TICKETS, null, "12");
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
    expect(e.items.map((i) => i.kpi_key)).toEqual(["ventas_nuevos", "ventas_existentes"]);
  });

  // saveKpiTargets borra la fila de un KPI sin peso: otro plazo se perdería sin avisar.
  it("sin fila de tickets no deja guardar otro plazo que el de por defecto", () => {
    const e = evaluarBorrador(SIN_TICKETS, null, "8");
    expect(e.valido).toBe(false);
    expect(e.avisoPlazo).toBe(AVISO_PLAZO_SIN_FILA);
  });

  it("unos pesos que no suman 100 impiden guardar sin culpar al plazo", () => {
    const e = evaluarBorrador(borrador({ ventas_nuevos: ["1000", "10"], ventas_existentes: ["2000", "40"] }), null, "12");
    expect(e.suma).toBe(50);
    expect(e.pesosValidos).toBe(false);
    expect(e.valido).toBe(false);
    expect(e.avisoPlazo).toBeNull();
  });

  it("un KPI con peso y sin meta impide guardar", () => {
    const e = evaluarBorrador(borrador({ ventas_nuevos: ["", "60"], ventas_existentes: ["2000", "40"] }), null, "12");
    expect(e.pesosValidos).toBe(false);
    expect(e.valido).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-metas.test.ts`
Expected: FAIL: `toDraft`, `plazoInicial`, `parsePlazo`, `evaluarBorrador` y los avisos no existen en `@/lib/kpi-metas` (los dos tests de `filaDeMeta` siguen pasando).

- [ ] **Step 3: Implementación mínima**

Sustituir el contenido completo de `src/lib/kpi-metas.ts` por:

```ts
/**
 * Lógica pura de las metas de KPIs: la conversión de la fila de la base y la del
 * borrador de la pantalla de Configuración. Vive fuera de la acción y del componente
 * para poder probarla con vitest, que corre en node sin librería de componentes.
 */
import type { KpiScope, KpiTargetRow } from "@/actions/kpi-actions";
import { COMMERCIAL_KPIS, KPI_CON_PLAZO } from "@/lib/commercial-kpis";
import { PLAZO_HORAS_POR_DEFECTO, plazoTicketsDelAnio } from "@/lib/kpi-tickets";

/** Fila de kpi_targets tal como la devuelve Drizzle: numeric llega como string. */
export interface FilaMetaBd {
  kpi_key: string;
  target_value: string;
  weight_pct: string;
  plazo_horas: string | null;
}

export function filaDeMeta(r: FilaMetaBd): KpiTargetRow {
  return {
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
    // Number(null) sería 0, no «sin plazo»: se conserva el nulo para que la lectura
    // aplique el plazo por defecto.
    plazo_horas: r.plazo_horas === null ? null : Number(r.plazo_horas),
  };
}

/** Meta y peso de cada KPI como texto editable, por clave. */
export type Draft = Record<string, { target: string; weight: string }>;

/** Lo guardado, como texto editable. Los KPIs sin fila en ese ámbito van vacíos. */
export function toDraft(rows: KpiTargetRow[]): Draft {
  const d: Draft = Object.fromEntries(
    COMMERCIAL_KPIS.map((k) => [k.key, { target: "", weight: "" }])
  );
  for (const r of rows) {
    if (d[r.kpi_key]) d[r.kpi_key] = { target: String(r.target_value), weight: String(r.weight_pct) };
  }
  return d;
}

/** Texto inicial del campo de plazo: lo guardado o, si no hay nada, el plazo por defecto. */
export function plazoInicial(rows: KpiTargetRow[]): string {
  return String(plazoTicketsDelAnio(rows));
}

/**
 * Plazo tecleado → horas, o null si no vale. Acepta la coma decimal porque es la que
 * teclea quien trabaja en español. Mismas reglas que kpiTargetsSchema (mayor que 0,
 * 999 como mucho, dos decimales como mucho), para que el botón no ofrezca guardar algo
 * que el servidor rechazaría.
 */
export function parsePlazo(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const horas = Number(limpio);
  return horas > 0 && horas <= 999 ? horas : null;
}

export const AVISO_PLAZO_INVALIDO =
  "El plazo debe ser un número de horas mayor que 0 y de 999 como mucho, con dos decimales como mucho.";
export const AVISO_PLAZO_SIN_FILA =
  "El plazo se guarda en la fila de Tickets de Servicio Técnico en plazo: ponle meta y peso para guardarlo.";

export interface EstadoBorrador {
  /** Lo que se envía a saveKpiTargets: solo los KPIs con peso. */
  items: KpiTargetRow[];
  suma: number;
  /** Los pesos suman 100 y todo KPI con peso tiene meta. */
  pesosValidos: boolean;
  /** Se puede guardar: pesos válidos y el plazo no lo impide. */
  valido: boolean;
  /** Por qué el plazo impide guardar, o null si no lo impide. */
  avisoPlazo: string | null;
}

export function evaluarBorrador(draft: Draft, salesperson: KpiScope, plazoTexto: string): EstadoBorrador {
  const esTotal = salesperson === null;
  const plazo = esTotal ? parsePlazo(plazoTexto) : null;
  // Solo cuentan los KPIs con peso: el resto no se mide en ese ámbito.
  const items: KpiTargetRow[] = COMMERCIAL_KPIS.map((k) => ({
    kpi_key: k.key,
    target_value: Number(draft[k.key]?.target ?? ""),
    weight_pct: Number(draft[k.key]?.weight ?? ""),
    // El plazo solo viaja en la fila de tickets del total: el servidor lo rechaza en cualquier otra.
    plazo_horas: esTotal && k.key === KPI_CON_PLAZO ? plazo : null,
  })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0);
  const suma = items.reduce((s, i) => s + i.weight_pct, 0);
  const pesosValidos = Math.round(suma * 100) === 10000 && items.every((i) => i.target_value > 0);

  let avisoPlazo: string | null = null;
  if (esTotal) {
    if (plazo === null) {
      avisoPlazo = AVISO_PLAZO_INVALIDO;
    } else if (plazo !== PLAZO_HORAS_POR_DEFECTO && !items.some((i) => i.kpi_key === KPI_CON_PLAZO)) {
      // saveKpiTargets borra la fila de un KPI sin peso, y con ella su plazo: guardar
      // otro plazo sin esa fila lo perdería sin avisar.
      avisoPlazo = AVISO_PLAZO_SIN_FILA;
    }
  }
  return { items, suma, pesosValidos, valido: pesosValidos && avisoPlazo === null, avisoPlazo };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-metas.test.ts`
Expected: PASS (16 tests).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-metas.ts src/lib/__tests__/kpi-metas.test.ts
git commit -m "feat(configuracion): logica pura del borrador de metas con plazo"
```

---

## Task 5: Campo «Plazo (h)» en la pantalla de metas

**Files:**
- Modify: `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx`
- Test: `e2e/specs/kpi-targets.spec.ts`

- [ ] **Step 1: Escribir los tests E2E que fallan**

En `e2e/specs/kpi-targets.spec.ts`, justo debajo de `test.use({ storageState: APPROVED_STATE });` (línea 4), añadir:

```ts

/** aria-label del campo de plazo. exact en getByLabel: sin él, la búsqueda es por subcadena. */
const PLAZO = "Plazo de Tickets de Servicio Técnico en plazo";
```

Después, justo antes de `test.describe("lector", () => {`, añadir:

```ts
test("el total muestra el plazo de tickets con su valor por defecto y un vendedor no lo tiene", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

  await expect(card.getByText("Plazo (h)", { exact: true })).toBeVisible();
  // La semilla no guarda plazo: se ve el de por defecto.
  await expect(card.getByLabel(PLAZO, { exact: true })).toHaveValue("12");

  // El KPI de tickets solo se mide a nivel compañía: en un vendedor no hay plazo.
  await card.getByLabel("Ámbito").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
  await expect(card.getByText("Suma de pesos: 0%")).toBeVisible();
  await expect(card.getByLabel(PLAZO, { exact: true })).toHaveCount(0);
});

test("no deja guardar un plazo invalido ni un plazo sin meta y peso de tickets", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
  const plazo = card.getByLabel(PLAZO, { exact: true });
  const guardar = card.getByRole("button", { name: "Guardar metas" });
  await expect(guardar).toBeEnabled();

  await plazo.fill("0");
  await expect(card.getByText(/mayor que 0/)).toBeVisible();
  await expect(guardar).toBeDisabled();

  // La semilla no pesa el KPI de tickets: su fila no existe y el plazo no tendría dónde guardarse.
  await plazo.fill("8");
  await expect(card.getByText(/ponle meta y peso/)).toBeVisible();
  await expect(guardar).toBeDisabled();

  // Nada se guarda en este test: volver al de por defecto deja la pantalla como estaba.
  await plazo.fill("12");
  await expect(guardar).toBeEnabled();
});

```

Y dentro de `test.describe("lector", () => { ... })`, después del test `"ve las metas pero no puede editarlas"`, añadir:

```ts

  test("ve el plazo de tickets pero no puede editarlo", async ({ page }) => {
    await page.goto("/settings");
    const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    const plazo = card.getByLabel(PLAZO, { exact: true });
    await expect(plazo).toHaveValue("12");
    await expect(plazo).not.toBeEditable();
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Con Docker arrancado y el puerto 3100 libre:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/kpi-targets.spec.ts
```

Expected: FAIL en los 3 tests nuevos (no hay «Plazo (h)» ni campo con ese `aria-label`); los 5 existentes pasan.

- [ ] **Step 3: Implementación mínima**

Sustituir el contenido completo de `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx` por:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Target } from "lucide-react";
import {
  getKpiTargets,
  getSalespeople,
  saveKpiTargets,
  type KpiScope,
  type KpiTargetRow,
} from "@/actions/kpi-actions";
import {
  COMMERCIAL_KPIS, KPI_CON_PLAZO, KPI_UNIT_LABEL, getKpiYearRange, puedeEditarMetas,
} from "@/lib/commercial-kpis";
import { evaluarBorrador, plazoInicial, toDraft, type Draft } from "@/lib/kpi-metas";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Valor del selector para el total de la compañía: el ámbito real es null, pero
// un Select necesita una cadena.
const TOTAL = "__total__";
const TOTAL_LABEL = "Total compañía";

// Las columnas de cada fila. La cabecera y los campos comparten la rejilla para que
// caigan alineados. El total lleva una cuarta, el plazo de tickets: ese KPI solo se
// mide a nivel compañía, así que en un vendedor no hay plazo que configurar.
const FILA = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px] sm:items-center";
const FILA_CON_PLAZO = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_110px] sm:items-center";

/** "mensual" -> "Mensual". Se capitaliza aquí y no con CSS: `capitalize` tocaría
 *  también la unidad y dejaría "nº" como "Nº". */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Campos de un ámbito ya cargado. El padre lo remonta con `key` al cambiar de año
 * o de ámbito, así que no hace falta un efecto que rehaga el borrador: `edits`
 * guarda solo lo que el usuario teclea y se superpone a lo que hay en la base.
 */
function KpiTargetsFields({
  year,
  salesperson,
  rows,
  editable,
  onSaved,
}: {
  year: number;
  salesperson: KpiScope;
  rows: KpiTargetRow[];
  editable: boolean;
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Draft>({});
  // null = sin tocar: se ve lo guardado o el plazo por defecto, igual que con `edits`.
  const [plazoEditado, setPlazoEditado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const guardados = useMemo(() => toDraft(rows), [rows]);
  const draft = useMemo(() => ({ ...guardados, ...edits }), [guardados, edits]);
  const esTotal = salesperson === null;
  const fila = esTotal ? FILA_CON_PLAZO : FILA;
  const plazoTexto = plazoEditado ?? plazoInicial(rows);

  const editar = (key: string, campo: "target" | "weight", valor: string) => {
    setEdits((prev) => {
      const actual = prev[key] ?? guardados[key] ?? { target: "", weight: "" };
      return { ...prev, [key]: { ...actual, [campo]: valor } };
    });
  };

  // Qué se envía y si se puede guardar sale de una función pura con tests: aquí solo se pinta.
  const { items: enviados, suma, pesosValidos, valido, avisoPlazo } = useMemo(
    () => evaluarBorrador(draft, salesperson, plazoTexto),
    [draft, salesperson, plazoTexto]
  );

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveKpiTargets(year, salesperson, enviados);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Metas guardadas");
      // El campo vuelve a enseñar lo guardado: si la fila de tickets se ha quitado, su
      // plazo se fue con ella y lo honesto es ver el de por defecto.
      setPlazoEditado(null);
      onSaved();
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* En movil la rejilla se apila y la cabecera no ayudaria: ahi orientan los
            marcadores de cada campo. */}
        <div className={`${fila} hidden sm:grid px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground`}>
          <span>KPI</span>
          <span>Meta</span>
          <span>Peso %</span>
          {esTotal && <span>Plazo (h)</span>}
        </div>
        {COMMERCIAL_KPIS.map((k) => (
          <div key={k.key} className={fila}>
            <div>
              <div className="text-sm font-medium">{k.label}</div>
              <div className="text-xs text-muted-foreground">
                {conMayuscula(k.period)} · {KPI_UNIT_LABEL[k.unit]}
              </div>
            </div>
            <Input
              aria-label={`Meta de ${k.label}`}
              placeholder={KPI_UNIT_LABEL[k.unit]}
              inputMode="decimal"
              readOnly={!editable}
              value={draft[k.key]?.target ?? ""}
              onChange={(e) => editar(k.key, "target", e.target.value)}
            />
            <Input
              aria-label={`Peso de ${k.label}`}
              placeholder="%"
              inputMode="decimal"
              readOnly={!editable}
              value={draft[k.key]?.weight ?? ""}
              onChange={(e) => editar(k.key, "weight", e.target.value)}
            />
            {/* Horas laborables: menos de este plazo cuenta como en plazo. */}
            {esTotal && k.key === KPI_CON_PLAZO && (
              <Input
                aria-label={`Plazo de ${k.label}`}
                placeholder="h"
                inputMode="decimal"
                readOnly={!editable}
                value={plazoTexto}
                onChange={(e) => setPlazoEditado(e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      {/* El lector solo consulta: sin botón, y los avisos en rojo no le servirían de nada. */}
      {editable && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          {avisoPlazo && <p className="text-sm text-destructive">{avisoPlazo}</p>}
          <div className="flex items-center justify-between gap-4">
            <span className={pesosValidos ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              Suma de pesos: {Math.round(suma * 100) / 100}%
            </span>
            <Button onClick={guardar} disabled={!valido || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar metas
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function KpiTargetsForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [scope, setScope] = useState<string>(TOTAL);

  // Todo usuario aprobado ve las metas; editarlas depende del rol. El servidor
  // aplica la misma regla, esto solo evita ofrecer lo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);
  const salesperson: KpiScope = scope === TOTAL ? null : scope;

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
    enabled: conPerfil,
  });

  // `data` sin definir es el estado de carga fiable aquí: mientras la consulta
  // está deshabilitada esperando al perfil, isLoading ya vale false.
  const { data } = useQuery({
    queryKey: ["kpi-targets", year, scope],
    queryFn: () => getKpiTargets(year, salesperson),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
            <Target className="size-4 text-primary" /> Metas de KPIs comerciales
          </CardTitle>
          <CardDescription>
            {editable
              ? "Meta y peso de cada KPI para el año y el ámbito elegidos. Solo se guardan los KPIs con peso, y los pesos de cada ámbito deben sumar 100. En el total, el plazo de tickets son horas laborables: menos de ese plazo cuenta como en plazo."
              : "Meta y peso de cada KPI para el año y el ámbito elegidos. Solo lectura."}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
            <SelectTrigger className="w-[110px]" aria-label="Año"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getKpiYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v) => { if (v) setScope(v); }}>
            <SelectTrigger className="w-[200px]" aria-label="Ámbito">
              {/* Sin esto, el trigger mostraría el valor centinela en crudo. */}
              <SelectValue>{(v: string | null) => (v === TOTAL ? TOTAL_LABEL : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL}>{TOTAL_LABEL}</SelectItem>
              {(vendedoresQ.data ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando metas…</p>
        ) : (
          <KpiTargetsFields
            key={`${year}|${scope}`}
            year={year}
            salesperson={salesperson}
            rows={data}
            editable={editable}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ["kpi-targets", year, scope] }); }}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: 10 warnings, 0 errores (los mismos de antes).

Esperar al menos 60 s desde la ejecución anterior de Playwright y con el puerto 3100 libre:

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/kpi-targets.spec.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/settings/_components/kpi-targets-form.tsx" e2e/specs/kpi-targets.spec.ts
git commit -m "feat(configuracion): campo de plazo de tickets en las metas del total"
```

---

## Task 6: La tabla y el detalle usan el plazo del año

**Files:**
- Modify: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`
- Modify: `src/components/charts/comercial/tickets-detalle-dialog.tsx`
- Create: `e2e/specs/plazo-tickets.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/kpi-tickets.test.ts`, añadir `textoPlazo,` al import de `@/lib/kpi-tickets`, justo después de `plazoTicketsDelAnio,`. Después añadir al final del fichero:

```ts

describe("textoPlazo", () => {
  it("pinta el plazo con coma decimal y sin ceros de relleno", () => {
    expect(textoPlazo(12)).toBe("12");
    expect(textoPlazo(4.5)).toBe("4,5");
    expect(textoPlazo(7.25)).toBe("7,25");
  });
});
```

Crear `e2e/specs/plazo-tickets.spec.ts` (y convertirlo a CRLF):

```ts
import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TICKETS = "Tickets de Servicio Técnico en plazo";
/** Celda de febrero: la 0 es la etiqueta del KPI, así que el índice es el número del mes. */
const CELDA_FEBRERO = 2;

function tarjetaMetas(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
}

/**
 * Deja las metas del total como las siembra e2e/db/seed-app.mjs: ventas nuevos 60,
 * ventas existentes 40 y tickets sin meta ni peso, así que sin plazo guardado. Otros
 * specs comparten la base en la misma ejecución y esperan el 60,0 % de febrero.
 */
async function restaurarMetas(page: Page) {
  await page.goto("/settings");
  const card = tarjetaMetas(page);
  await expect(card).toBeVisible();
  await card.getByLabel(`Meta de ${TICKETS}`, { exact: true }).fill("");
  await card.getByLabel(`Peso de ${TICKETS}`, { exact: true }).fill("");
  await card.getByLabel("Peso de Ventas clientes nuevos", { exact: true }).fill("60");
  await card.getByLabel("Peso de Ventas clientes existentes", { exact: true }).fill("40");
  await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("12");
  await card.getByRole("button", { name: "Guardar metas" }).click();
  await expect(page.getByText("Metas guardadas")).toBeVisible();

  await page.reload();
  const tras = tarjetaMetas(page);
  await expect(tras.getByText("Suma de pesos: 100%")).toBeVisible();
  await expect(tras.getByLabel(`Plazo de ${TICKETS}`, { exact: true })).toHaveValue("12");
  await expect(tras.getByLabel(`Peso de ${TICKETS}`, { exact: true })).toHaveValue("");
}

test("cambiar el plazo del anio cambia la cifra de tickets de la tabla y su detalle", async ({ page }) => {
  // Dos pantallas, un guardado y la restauración: más que el minuto por defecto.
  test.setTimeout(120_000);
  try {
    await page.goto("/settings");
    const card = tarjetaMetas(page);
    await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

    // El plazo se guarda en la fila de tickets, así que hay que darle meta y peso.
    // Ventas nuevos baja de 60 a 50 para que la suma siga en 100.
    await card.getByLabel(`Meta de ${TICKETS}`, { exact: true }).fill("80");
    await card.getByLabel(`Peso de ${TICKETS}`, { exact: true }).fill("10");
    await card.getByLabel("Peso de Ventas clientes nuevos", { exact: true }).fill("50");
    await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("8");
    await card.getByRole("button", { name: "Guardar metas" }).click();
    await expect(page.getByText("Metas guardadas")).toBeVisible();

    await page.goto("/analytics");
    await page.getByRole("tab", { name: "Comercial" }).click();
    const tabla = page.locator('[data-slot="card"]', { hasText: "KPIs comerciales" });
    await expect(tabla).toBeVisible();

    // Febrero de la semilla (e2e/db/seed-hub.mjs) con plazo 8: 2 h y 1 h en plazo; 8 h
    // (justo en la frontera: el plazo es «menos de»), 18 h y 18 h fuera. 2 / 5 = 40 %.
    // Con el plazo de 12 era 60 %. Se mira el botón y no la celda: con meta, la celda
    // lleva además el cumplimiento debajo.
    const fila = tabla.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
    const boton = fila.getByRole("cell").nth(CELDA_FEBRERO).getByRole("button");
    await expect(boton).toHaveText("40.0%");

    // El detalle clasifica con el mismo plazo y lo dice.
    await boton.click();
    const dialogo = page.getByRole("dialog", { name: /Tickets en plazo/ });
    await expect(dialogo).toContainText("menos de 8 h laborables");
    await expect(dialogo.getByText("2 en plazo de 5 → 40.0%")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();

    // Con un comercial elegido, sus metas no traen plazo: la tabla usa el del total.
    await tabla.getByLabel("Propietario").click();
    await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
    await expect(boton).toHaveText("40.0%");
  } finally {
    await restaurarMetas(page);
  }
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL: `textoPlazo` no es una función.

Esperar al menos 60 s desde la ejecución anterior de Playwright y con el puerto 3100 libre:

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/plazo-tickets.spec.ts
```

Expected: FAIL: el botón de febrero sigue en «60.0%» porque la tabla aún usa el plazo por defecto. El `finally` restaura las metas.

- [ ] **Step 3: Implementación mínima**

En `src/lib/kpi-tickets.ts`, justo antes de `// Se crea una vez: construir un DateTimeFormat es caro y el diálogo formatea dos`, añadir:

```ts
/** Plazo para leerlo en español: coma decimal y sin ceros de relleno ("12", "4,5"). */
export function textoPlazo(horas: number): string {
  return String(horas).replace(".", ",");
}

```

En `src/components/charts/comercial/commercial-kpi-table.tsx`:

1. Sustituir el import que dejó la Task 3:

```ts
import {
  PLAZO_HORAS_POR_DEFECTO, detalleTicketsMes, episodiosNotificacionComercial, ticketsEnPlazoPorMes,
} from "@/lib/kpi-tickets";
```

por:

```ts
import {
  detalleTicketsMes, episodiosNotificacionComercial, plazoTicketsDelAnio, ticketsEnPlazoPorMes,
} from "@/lib/kpi-tickets";
```

2. Sustituir:

```ts
  const metasQ = useQuery({
    queryKey: ["kpi-targets", year, owner],
    queryFn: () => getKpiTargets(year, salesperson),
    placeholderData: keepPreviousData,
  });
```

por:

```ts
  const metasQ = useQuery({
    queryKey: ["kpi-targets", year, owner],
    queryFn: () => getKpiTargets(year, salesperson),
    placeholderData: keepPreviousData,
  });
  // El plazo de tickets vive en las metas del TOTAL del año: el KPI solo se mide a nivel
  // compañía y las metas de un comercial no lo traen. Con el total elegido la clave es la
  // misma que la de arriba y TanStack Query hace una sola petición; con un comercial, es
  // una consulta aparte. La pantalla de metas invalida esta misma clave al guardar.
  const metasTotalQ = useQuery({
    queryKey: ["kpi-targets", year, TOTAL],
    queryFn: () => getKpiTargets(year, null),
    placeholderData: keepPreviousData,
  });
```

3. Sustituir:

```ts
  const metas = useMemo<KpiTargetRow[]>(() => metasQ.data ?? [], [metasQ.data]);
```

por:

```ts
  const metas = useMemo<KpiTargetRow[]>(() => metasQ.data ?? [], [metasQ.data]);
  const plazoHoras = useMemo(() => plazoTicketsDelAnio(metasTotalQ.data ?? []), [metasTotalQ.data]);
```

4. Sustituir:

```ts
    // detalle de tickets reutiliza el mismo: si calculara el suyo al pulsar, un episodio
    // abierto que cruzara las 12 horas entre medias haría que el pie dijera otra cosa
    // que la celda.
```

por:

```ts
    // detalle de tickets reutiliza el mismo: si calculara el suyo al pulsar, un episodio
    // abierto que cruzara el plazo entre medias haría que el pie dijera otra cosa que
    // la celda.
```

5. Sustituir:

```ts
        return construirFila(
          def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets, PLAZO_HORAS_POR_DEFECTO), meta, null, year, hoy
        );
```

por:

```ts
        return construirFila(
          def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets, plazoHoras), meta, null, year, hoy
        );
```

6. Sustituir:

```ts
  }, [metas, mensuales, tratos, ganados, historico, registros, categorias, ordenesProyectoAnio, episodiosTickets, recordType, year]);
```

por:

```ts
  }, [metas, mensuales, tratos, ganados, historico, registros, categorias, ordenesProyectoAnio, episodiosTickets, plazoHoras, recordType, year]);
```

7. Sustituir:

```ts
  const cargando =
    metasQ.isPending || mensualesQ.isPending || tratosQ.isPending || ganadosQ.isPending ||
    historicoQ.isPending || ventasQ.isPending || categoriasQ.isPending || proyectosQ.isPending ||
    ticketsQ.isPending;
  const refrescando =
    metasQ.isPlaceholderData || mensualesQ.isPlaceholderData || tratosQ.isPlaceholderData ||
    ganadosQ.isPlaceholderData || ticketsQ.isPlaceholderData;
```

por:

```ts
  // metasTotalQ también cuenta: sin él la fila de tickets se pintaría un instante con el
  // plazo por defecto y después saltaría al del año.
  const cargando =
    metasQ.isPending || metasTotalQ.isPending || mensualesQ.isPending || tratosQ.isPending ||
    ganadosQ.isPending || historicoQ.isPending || ventasQ.isPending || categoriasQ.isPending ||
    proyectosQ.isPending || ticketsQ.isPending;
  const refrescando =
    metasQ.isPlaceholderData || metasTotalQ.isPlaceholderData || mensualesQ.isPlaceholderData ||
    tratosQ.isPlaceholderData || ganadosQ.isPlaceholderData || ticketsQ.isPlaceholderData;
```

8. Sustituir:

```ts
  // Mismos episodios, mismo año y mismo `ahora` que la fila: el detalle sale de la misma
  // clasificación que la cifra pulsada.
  const detalleTickets = celdaTickets
    ? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets, PLAZO_HORAS_POR_DEFECTO)
    : null;
```

por:

```ts
  // Mismos episodios, mismo año, mismo `ahora` y mismo plazo que la fila: el detalle sale
  // de la misma clasificación que la cifra pulsada.
  const detalleTickets = celdaTickets
    ? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets, plazoHoras)
    : null;
```

9. Sustituir:

```tsx
        mes={celdaTickets?.mes ?? 1}
        detalle={detalleTickets}
      />
```

por:

```tsx
        mes={celdaTickets?.mes ?? 1}
        detalle={detalleTickets}
        plazoHoras={plazoHoras}
      />
```

En `src/components/charts/comercial/tickets-detalle-dialog.tsx`:

1. Sustituir:

```ts
import {
  HORA_FIN,
  HORA_INICIO,
  formatoInstanteBogota,
  type DetalleTicketsMes,
```

por:

```ts
import {
  HORA_FIN,
  HORA_INICIO,
  formatoInstanteBogota,
  textoPlazo,
  type DetalleTicketsMes,
```

2. Sustituir:

```tsx
  mes,
  detalle,
}: {
  abierto: boolean;
  onCerrar: () => void;
  anio: number;
  /** 1-12. */
  mes: number;
  detalle: DetalleTicketsMes | null;
}) {
```

por:

```tsx
  mes,
  detalle,
  plazoHoras,
}: {
  abierto: boolean;
  onCerrar: () => void;
  anio: number;
  /** 1-12. */
  mes: number;
  detalle: DetalleTicketsMes | null;
  /** Plazo con el que la tabla clasificó los episodios: se enseña para que el detalle se explique solo. */
  plazoHoras: number;
}) {
```

3. Sustituir:

```tsx
              <p className="text-xs text-muted-foreground">
                De compañía · horas laborables de lunes a viernes, de {HORA_INICIO}:00 a {HORA_FIN}:00 en Bogotá, sin festivos.
              </p>
```

por:

```tsx
              <p className="text-xs text-muted-foreground">
                De compañía · en plazo: menos de {textoPlazo(plazoHoras)} h laborables · horas laborables de lunes a viernes, de {HORA_INICIO}:00 a {HORA_FIN}:00 en Bogotá, sin festivos.
              </p>
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: 10 warnings, 0 errores.

Esperar al menos 60 s desde la ejecución anterior de Playwright y con el puerto 3100 libre:

```bash
E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/plazo-tickets.spec.ts e2e/specs/kpis-comerciales.spec.ts
```

Expected: PASS. `plazo-tickets` ve el 40.0 % y el texto «menos de 8 h laborables»; `kpis-comerciales` sigue viendo el 60.0 % de febrero.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts src/components/charts/comercial/commercial-kpi-table.tsx src/components/charts/comercial/tickets-detalle-dialog.tsx e2e/specs/plazo-tickets.spec.ts
git commit -m "feat(kpis): la tabla y el detalle de tickets usan el plazo del anio"
```

---

## Task 7: Verificación final y despliegue

**Files:** ninguno (solo verificación). Si alguna comprobación obliga a cambiar código, el arreglo va en un commit nuevo `fix(...)`, nunca con `--amend`.

- [ ] **Step 1: Tipos**

Run: `npx tsc --noEmit`
Expected: sin salida (0 errores).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**, los mismos que antes de empezar.

- [ ] **Step 3: Tests unitarios**

Run: `npx vitest run`
Expected: todo en verde. Línea base: 331 passed y 1 skipped. Nuevos: 9 de validación (Task 1), 16 de `kpi-metas.test.ts` (Tasks 2 y 4) y 9 de `kpi-tickets.test.ts` (8 en la Task 3 y 1 en la Task 6): **365 passed, 1 skipped**. Si el número es menor, comprobar que no se ha perdido ningún test existente al sustituir el tramo de `kpi-tickets.test.ts`.

- [ ] **Step 4: E2E completo**

Con Docker Desktop arrancado (`"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` si hace falta), el puerto 3100 libre y al menos 60 s desde la última ejecución de Playwright:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run test:e2e
```

Expected: línea base de 60 pasando más los 4 nuevos (3 en `kpi-targets.spec.ts`, 1 en `plazo-tickets.spec.ts`): **64 passed**.

- [ ] **Step 5: Comprobar que no queda el literal ni la constante vieja**

Run: `grep -rn "PLAZO_HORAS\b\|12 horas" src e2e`
Expected: ninguna coincidencia en código de producción. (Los tests de `kpi-tickets.test.ts` pueden nombrar «12 horas» en la descripción de sus casos con el plazo por defecto; es correcto.)

- [ ] **Step 6: Nota de despliegue**

Antes de desplegar, el usuario ejecuta a mano la migración en la base de producción `sales_tracker`:

```bash
psql "$DATABASE_URL" -f drizzle/0012_kpi_plazo_horas.sql
```

Es aditiva y se puede volver a ejecutar sin efectos. Hasta que alguien guarde un plazo, todos los años siguen midiendo con 12 h, así que las cifras no cambian al desplegar.
