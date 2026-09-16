# KPIs comerciales · PR 1: metas y Configuración — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La empresa puede definir, por año y por ámbito (total de la compañía o un vendedor concreto), la meta y el peso de cada KPI comercial desde Configuración.

**Architecture:** El catálogo de los 8 KPIs vive en código (`src/lib/commercial-kpis.ts`); la base de datos solo guarda meta y peso en `kpi_targets` (migración 0008), con `salesperson` nulo para el total de la compañía. Una acción de servidor valida con zod y hace upsert por ámbito; la pantalla es una tarjeta de `/settings` visible solo para administradores, con selector de año y de ámbito.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, zod, @tanstack/react-query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-kpis-comerciales-design.md` (secciones 2 y 3)

**Primer PR de dos.** El segundo (cálculo y tabla en Comercial) se planifica cuando este esté fusionado.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpis-comerciales`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna meta real ni nombre de vendedor real en código, tests, comentarios ni documentación. Los vendedores de la semilla E2E son inventados.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; 2 logins por ejecución con límite de 5 por minuto, así que hay que esperar 60 s entre ejecuciones.
- **Usuario E2E:** el aprobado es **admin**, así que ve la pantalla de metas.
- **El reseteo de la base de test recrea las bases** (`e2e/db/reset.mjs`), así que editar una migración ya escrita se aplica limpio: no hace falta encadenar otra.
- **Postgres:** producción 17, base de test 16. `UNIQUE NULLS NOT DISTINCT` existe desde la 15.
- **Drizzle y nulos:** `eq(col, null)` genera `= NULL` y no casa nunca. Para comparar el ámbito hay que usar `sql` con `IS NOT DISTINCT FROM`.
- **Drizzle y numeric:** se escribe como string y se lee como string; convertir con `Number()` al devolver.

## Estado

- **Task 1 ya está hecha** (commit `a79cce9`): creó `drizzle/0008_kpi_targets.sql` y `kpiTargets` en el esquema, y renumeró el spec del reset de contraseña a `0009`. La Task 2 amplía esa misma migración, que todavía no se ha ejecutado en producción.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `drizzle/0008_kpi_targets.sql` | Modificar | Añadir el ámbito `salesperson` a la tabla. |
| `src/db/schema.ts` | Modificar | Misma forma en Drizzle. |
| `src/lib/commercial-kpis.ts` | Crear | Catálogo de los 8 KPIs. |
| `src/lib/__tests__/commercial-kpis.test.ts` | Crear | Tests del catálogo. |
| `src/db/hub-kpi.ts` | Crear | Vendedores que existen en el hub. |
| `e2e/db/seed-hub.mjs` | Modificar | Vendedor ficticio en las cabeceras. |
| `e2e/constants.ts` | Modificar | Nombres de los vendedores de prueba. |
| `src/lib/validation.ts` | Modificar | `kpiTargetsSchema` con ámbito. |
| `src/lib/__tests__/validation-kpi.test.ts` | Crear | Tests del esquema. |
| `src/actions/kpi-actions.ts` | Crear | Leer y guardar metas, y listar vendedores. |
| `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx` | Crear | Pantalla de metas. |
| `src/app/(dashboard)/settings/page.tsx` | Modificar | Renderizar la tarjeta. |
| `e2e/db/seed-app.mjs` | Modificar | Metas sintéticas del total de compañía. |
| `e2e/specs/kpi-targets.spec.ts` | Crear | Tres tests de la pantalla. |

---

### Task 2: El ámbito entra en la tabla

**Files:**
- Modify: `drizzle/0008_kpi_targets.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Ampliar la migración**

Sustituir el contenido completo de `drizzle/0008_kpi_targets.sql` por:

```sql
-- Metas y pesos de los KPIs comerciales, por empresa, anio y ambito. El catalogo
-- de KPIs (clave, etiqueta, periodicidad) vive en src/lib/commercial-kpis.ts.
-- salesperson nulo = meta del total de la compania; con nombre, la de ese
-- comercial. NULLS NOT DISTINCT (Postgres 15+) impide dos filas del total.
CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_year integer NOT NULL,
  kpi_key text NOT NULL,
  salesperson text,
  target_value numeric(15,2) NOT NULL,
  weight_pct numeric(5,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_targets_unique UNIQUE NULLS NOT DISTINCT (company_id, record_year, kpi_key, salesperson),
  CONSTRAINT kpi_targets_target_check CHECK (target_value > 0),
  CONSTRAINT kpi_targets_weight_check CHECK (weight_pct >= 0 AND weight_pct <= 100)
);
```

Se elimina el índice `idx_kpi_targets_company_year`: `(company_id, record_year)` es prefijo del índice único, así que no aportaba nada.

- [ ] **Step 2: Misma forma en el esquema de Drizzle**

En `src/db/schema.ts`, sustituir el bloque `kpiTargets` por:

```ts
export const kpiTargets = pgTable("kpi_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  record_year: integer("record_year").notNull(),
  kpi_key: text("kpi_key").notNull(),
  // Nulo = meta del total de la compañía; con nombre, la de ese comercial.
  salesperson: text("salesperson"),
  target_value: numeric("target_value", { precision: 15, scale: 2 }).notNull(),
  weight_pct: numeric("weight_pct", { precision: 5, scale: 2 }).notNull(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("kpi_targets_unique").on(t.company_id, t.record_year, t.kpi_key, t.salesperson).nullsNotDistinct(),
  check("kpi_targets_target_check", sql`${t.target_value} > 0`),
  check("kpi_targets_weight_check", sql`${t.weight_pct} >= 0 AND ${t.weight_pct} <= 100`),
]);
```

Mantener el comentario de cabecera del bloque, añadiendo que el ámbito nulo es el total de la compañía. Si `.nullsNotDistinct()` no existiera en esta versión de Drizzle, PARAR y reportarlo en lugar de inventar una alternativa.

- [ ] **Step 3: Aplicar y comprobar contra la base real**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error, con la línea `migracion aplicada: 0008_kpi_targets.sql`.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -c "\d kpi_targets"`
Expected: aparece la columna `salesperson` y el índice único sobre las cuatro columnas. Pegar esa salida en el informe.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -c "SELECT indexdef FROM pg_indexes WHERE tablename = 'kpi_targets'"`
Expected: el índice único incluye `NULLS NOT DISTINCT` y ya no existe `idx_kpi_targets_company_year`.

Run: `npm run typecheck`
Expected: sin salida, código 0.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0008_kpi_targets.sql src/db/schema.ts
git commit -m "feat(kpis): las metas se guardan por vendedor y por total de compania"
```

---

### Task 3: Catálogo de KPIs (TDD con vitest)

**Files:**
- Create: `src/lib/__tests__/commercial-kpis.test.ts`
- Create: `src/lib/commercial-kpis.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/__tests__/commercial-kpis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { COMMERCIAL_KPIS, KPI_KEYS, kpiDef } from "@/lib/commercial-kpis";

describe("catalogo de KPIs comerciales", () => {
  it("tiene los 8 KPIs del modelo", () => {
    expect(COMMERCIAL_KPIS).toHaveLength(8);
  });
  it("las claves no se repiten", () => {
    expect(new Set(KPI_KEYS).size).toBe(KPI_KEYS.length);
  });
  it("kpiDef encuentra por clave y devuelve undefined si no existe", () => {
    expect(kpiDef("ventas_nuevos")?.label).toBe("Ventas clientes nuevos");
    expect(kpiDef("no_existe")).toBeUndefined();
  });
  it("los KPIs pendientes explican su motivo y los automaticos no", () => {
    for (const k of COMMERCIAL_KPIS) {
      if (k.source === "pendiente") expect(k.pendingReason).toBeTruthy();
      else expect(k.pendingReason).toBeUndefined();
    }
  });
  it("hay exactamente 3 KPIs automaticos", () => {
    expect(COMMERCIAL_KPIS.filter((k) => k.source === "auto")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/commercial-kpis.test.ts`
Expected: falla porque `@/lib/commercial-kpis` no existe.

- [ ] **Step 3: Crear el catálogo**

Crear `src/lib/commercial-kpis.ts`:

```ts
/** Periodo en el que se mide el cumplimiento de cada KPI. */
export type KpiPeriod = "mensual" | "trimestral" | "semestral";
/** Unidad del valor medido: importe, conteo de documentos o porcentaje. */
export type KpiUnit = "usd" | "conteo" | "pct";
/** "auto" se calcula desde el zoho-hub; "pendiente" todavía no tiene origen de datos. */
export type KpiSource = "auto" | "pendiente";

export interface KpiDef {
  key: string;
  label: string;
  period: KpiPeriod;
  unit: KpiUnit;
  source: KpiSource;
  /** Motivo que muestra la tabla cuando el KPI está pendiente. */
  pendingReason?: string;
}

// Catálogo fijo: la base de datos solo guarda meta y peso de cada clave, así que
// estas claves no pueden cambiar sin migrar los datos existentes.
export const COMMERCIAL_KPIS: KpiDef[] = [
  { key: "ventas_nuevos", label: "Ventas clientes nuevos", period: "trimestral", unit: "usd", source: "auto" },
  { key: "ventas_existentes", label: "Ventas clientes existentes", period: "trimestral", unit: "usd", source: "auto" },
  { key: "tratos_nuevos", label: "Generación de tratos · clientes nuevos", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tratos_existentes", label: "Generación de tratos · clientes existentes", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tratos_ganados", label: "Tratos cerrados ganados", period: "mensual", unit: "conteo", source: "pendiente", pendingReason: "Pendiente de Zoho CRM" },
  { key: "tickets_st", label: "Tickets de Servicio Técnico en plazo", period: "mensual", unit: "pct", source: "pendiente", pendingReason: "Pendiente de Zoho Desk" },
  { key: "incremento_st", label: "Incremento de ventas de Servicio Técnico", period: "trimestral", unit: "pct", source: "auto" },
  { key: "ingresos_proyectos", label: "Ingresos por proyectos", period: "semestral", unit: "usd", source: "pendiente", pendingReason: "Pendiente de carga manual" },
];

export const KPI_KEYS: string[] = COMMERCIAL_KPIS.map((k) => k.key);

const BY_KEY = new Map(COMMERCIAL_KPIS.map((k) => [k.key, k]));

export function kpiDef(key: string): KpiDef | undefined {
  return BY_KEY.get(key);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/commercial-kpis.test.ts`
Expected: los 5 tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commercial-kpis.ts src/lib/__tests__/commercial-kpis.test.ts
git commit -m "feat(kpis): catalogo de los 8 kpis comerciales"
```

---

### Task 4: Vendedores del hub y semilla

**Files:**
- Create: `src/db/hub-kpi.ts`
- Modify: `e2e/db/seed-hub.mjs`
- Modify: `e2e/constants.ts`

- [ ] **Step 1: Consulta de vendedores**

Crear `src/db/hub-kpi.ts`:

```ts
import { getHubPool } from "@/db/hub";

// Vendedores que aparecen en el hub. Zoho los guarda dentro del JSON de la
// cabecera, no en columna propia, y los mismos nombres salen en ordenes y en
// facturas: se unen las dos fuentes para no depender de una sola.
export async function getHubSalespeople(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT nombre FROM (
      SELECT s.raw->>'salesperson_name' AS nombre
      FROM books.sales_orders s
      WHERE s.status NOT IN ('void','draft')
      UNION
      SELECT i.raw->>'salesperson_name'
      FROM books.invoices i
      WHERE i.status NOT IN ('void','draft')
    ) t
    WHERE nombre IS NOT NULL AND nombre <> ''
    ORDER BY nombre`;
  const { rows } = await getHubPool().query(sql);
  return rows.map((r) => String(r.nombre));
}
```

- [ ] **Step 2: Sembrar el vendedor en el hub falso**

En `e2e/db/seed-hub.mjs`, junto a las demás constantes del principio:

```js
// Vendedores ficticios: el hub real guarda el nombre en raw.salesperson_name.
// Rotan cada dos meses, no cada mes: las facturas solo existen en meses pares,
// asi que alternar por mes dejaria un unico vendedor en books.invoices.
const VENDEDORES = ["Vendedora Ficticia", "Vendedor Ficticio"];
```

Dentro del bucle que inserta cada orden, antes del `INSERT` de `books.sales_orders`:

```js
        const vendedor = VENDEDORES[Math.floor((month - 1) / 2) % VENDEDORES.length];
```

El `raw` de la orden pasa a incluirlo:

```js
           JSON.stringify({
             invoiced_status: hasInvoice ? "invoiced" : "not_invoiced",
             bcy_discount_total: "0",
             salesperson_name: vendedor,
           })],
```

y el de la factura:

```js
          [invId, soId, date, customer, subTotal, JSON.stringify({ bcy_discount_total: "0", salesperson_name: vendedor })],
```

- [ ] **Step 3: Exponer los nombres a los tests**

Al final de `e2e/constants.ts`:

```ts

/** Vendedores ficticios que siembra e2e/db/seed-hub.mjs en raw.salesperson_name, en el orden alfabético que devuelve la consulta. */
export const SALESPEOPLE = ["Vendedor Ficticio", "Vendedora Ficticia"] as const;
```

- [ ] **Step 4: Comprobar contra la base de test**

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT DISTINCT raw->>'salesperson_name' AS vendedor FROM books.sales_orders ORDER BY 1"`
Expected: los dos nombres ficticios, ninguno nulo. Pegar la salida en el informe.

Run: `npm run typecheck`
Expected: sin salida, código 0.

- [ ] **Step 5: Commit**

```bash
git add src/db/hub-kpi.ts e2e/db/seed-hub.mjs e2e/constants.ts
git commit -m "feat(kpis): vendedores del hub y semilla con vendedor"
```

---

### Task 5: Validación y acciones (TDD con vitest)

**Files:**
- Create: `src/lib/__tests__/validation-kpi.test.ts`
- Modify: `src/lib/validation.ts`
- Create: `src/actions/kpi-actions.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/__tests__/validation-kpi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kpiTargetsSchema } from "@/lib/validation";

const year = new Date().getFullYear();
const dos = [
  { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 60 },
  { kpi_key: "ventas_existentes", target_value: 200, weight_pct: 40 },
];

describe("kpiTargetsSchema", () => {
  it("acepta el ambito del total de compania", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items: dos }).success).toBe(true);
  });
  it("acepta el ambito de un vendedor", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: "Vendedor Ficticio", items: dos }).success).toBe(true);
  });
  it("rechaza un vendedor vacio", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: "   ", items: dos }).success).toBe(false);
  });
  it("acepta decimales que suman 100", () => {
    const items = [
      { kpi_key: "ventas_nuevos", target_value: 1, weight_pct: 33.33 },
      { kpi_key: "ventas_existentes", target_value: 1, weight_pct: 33.33 },
      { kpi_key: "incremento_st", target_value: 1, weight_pct: 33.34 },
    ];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(true);
  });
  it("rechaza pesos que no suman 100", () => {
    const items = [{ kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 99 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza pesos con mas de dos decimales", () => {
    // numeric(5,2) redondea al guardar: 33.334 + 33.333 + 33.333 suma 100 aqui,
    // pero se almacena como 99.99 y la pantalla ya no dejaria volver a guardar.
    const items = [
      { kpi_key: "ventas_nuevos", target_value: 1, weight_pct: 33.334 },
      { kpi_key: "ventas_existentes", target_value: 1, weight_pct: 33.333 },
      { kpi_key: "incremento_st", target_value: 1, weight_pct: 33.333 },
    ];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza una clave que no esta en el catalogo", () => {
    const items = [{ kpi_key: "inventado", target_value: 100, weight_pct: 100 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza metas que no son positivas", () => {
    const items = [{ kpi_key: "ventas_nuevos", target_value: 0, weight_pct: 100 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza una lista vacia", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/validation-kpi.test.ts`
Expected: falla porque `kpiTargetsSchema` no existe.

- [ ] **Step 3: Añadir el esquema**

En `src/lib/validation.ts`, importar el catálogo junto a los imports existentes y añadir el esquema al final:

```ts
import { KPI_KEYS } from "@/lib/commercial-kpis";

// Metas y pesos de un ámbito: el total de la compañía (salesperson nulo) o un
// vendedor. Solo se envían los KPIs que se miden ese año en ese ámbito, y sus
// pesos suman 100. Los dos decimales son los que admite la columna numeric:
// aceptar más haría que lo guardado no cuadrase con lo validado.
export const kpiTargetsSchema = z
  .object({
    year: z.number().int().min(2021).max(currentYear + 1),
    salesperson: z.string().trim().min(1, "El vendedor no puede ir vacío").max(120).nullable(),
    items: z
      .array(
        z.object({
          kpi_key: z.string().refine((k) => KPI_KEYS.includes(k), "KPI desconocido"),
          target_value: z.number().positive("La meta debe ser mayor que cero").multipleOf(0.01, "La meta admite dos decimales como mucho"),
          weight_pct: z.number().min(0).max(100).multipleOf(0.01, "El peso admite dos decimales como mucho"),
        })
      )
      .min(1, "Hay que enviar al menos un KPI"),
  })
  .refine(
    (v) => Math.round(v.items.reduce((s, i) => s + i.weight_pct, 0) * 100) === 10000,
    { message: "Los pesos deben sumar 100", path: ["items"] }
  );
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/validation-kpi.test.ts`
Expected: los 9 tests pasan.

- [ ] **Step 5: Crear las acciones**

Crear `src/actions/kpi-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import { getHubSalespeople } from "@/db/hub-kpi";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { kpiTargetsSchema } from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";

export interface KpiTargetRow {
  kpi_key: string;
  target_value: number;
  weight_pct: number;
}

/** Ámbito de las metas: null es el total de la compañía. */
export type KpiScope = string | null;

export async function getSalespeople(): Promise<string[]> {
  await requireApproved();
  return getHubSalespeople();
}

export async function getKpiTargets(year: number, salesperson: KpiScope): Promise<KpiTargetRow[]> {
  const { profile } = await requireApproved();
  const rows = await db
    .select({
      kpi_key: kpiTargets.kpi_key,
      target_value: kpiTargets.target_value,
      weight_pct: kpiTargets.weight_pct,
    })
    .from(kpiTargets)
    .where(
      and(
        eq(kpiTargets.company_id, profile.company_id),
        eq(kpiTargets.record_year, year),
        // eq(col, null) genera "= NULL" y no casa nunca: hace falta IS NOT DISTINCT FROM.
        sql`${kpiTargets.salesperson} IS NOT DISTINCT FROM ${salesperson}`
      )
    );

  // numeric llega como string desde Drizzle.
  return rows.map((r) => ({
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
  }));
}

export async function saveKpiTargets(
  year: number,
  salesperson: KpiScope,
  items: KpiTargetRow[]
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const data = kpiTargetsSchema.parse({ year, salesperson, items });
    const keys = data.items.map((i) => i.kpi_key);

    await db.transaction(async (tx) => {
      for (const it of data.items) {
        await tx
          .insert(kpiTargets)
          .values({
            company_id: profile.company_id,
            record_year: data.year,
            kpi_key: it.kpi_key,
            salesperson: data.salesperson,
            target_value: String(it.target_value),
            weight_pct: String(it.weight_pct),
          })
          .onConflictDoUpdate({
            target: [kpiTargets.company_id, kpiTargets.record_year, kpiTargets.kpi_key, kpiTargets.salesperson],
            set: {
              target_value: String(it.target_value),
              weight_pct: String(it.weight_pct),
              updated_at: new Date().toISOString(),
            },
          });
      }

      // Un KPI que ya no se envía deja de medirse en ESE ámbito.
      await tx.delete(kpiTargets).where(
        and(
          eq(kpiTargets.company_id, profile.company_id),
          eq(kpiTargets.record_year, data.year),
          sql`${kpiTargets.salesperson} IS NOT DISTINCT FROM ${data.salesperson}`,
          notInArray(kpiTargets.kpi_key, keys)
        )
      );
    });

    revalidatePath("/settings");
  });
}
```

- [ ] **Step 6: Typecheck y lint**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation.ts src/lib/__tests__/validation-kpi.test.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): validacion y acciones de metas por ambito"
```

---

### Task 6: Pantalla de metas (TDD con Playwright)

**Files:**
- Modify: `e2e/db/seed-app.mjs`
- Create: `e2e/specs/kpi-targets.spec.ts`
- Create: `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Sembrar metas del total de compañía**

En `e2e/db/seed-app.mjs`, dentro de `seedApp`, justo antes de las llamadas a `seedUser`:

```js
    // Metas sinteticas del total de compania para el anio en curso: dos KPIs con
    // pesos que suman 100. Los ambitos por vendedor se dejan vacios a proposito.
    const anio = new Date().getFullYear();
    const METAS = [
      { key: "ventas_nuevos", target: 1000, weight: 60 },
      { key: "ventas_existentes", target: 2000, weight: 40 },
    ];
    for (const m of METAS) {
      await client.query(
        `INSERT INTO kpi_targets (company_id, record_year, kpi_key, target_value, weight_pct)
         VALUES ($1, $2, $3, $4, $5)`,
        [company.id, anio, m.key, m.target, m.weight],
      );
    }
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `e2e/specs/kpi-targets.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("Configuración muestra las metas del total de compañía", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();
  // La semilla deja dos KPIs con 60 y 40 en el ámbito del total.
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
});

test("no deja guardar si los pesos no suman 100", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();

  const peso = card.getByLabel("Peso de Ventas clientes nuevos");
  await peso.fill("10");
  await expect(card.getByText("Suma de pesos: 50%")).toBeVisible();
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();

  await peso.fill("60");
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeEnabled();
});

test("cada vendedor tiene sus propias metas", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

  // Al cambiar de ámbito, las metas del total no se arrastran: ese vendedor
  // todavía no tiene ninguna.
  await card.getByLabel("Ámbito").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
  await expect(card.getByText("Suma de pesos: 0%")).toBeVisible();
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();
});
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpi-targets.spec.ts`
Expected: los 3 fallan por no encontrar la tarjeta; los 2 de `setup` pasan. Resumen `3 failed`, `2 passed`.

- [ ] **Step 4: Crear el formulario**

Crear `src/app/(dashboard)/settings/_components/kpi-targets-form.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Target } from "lucide-react";
import { getKpiTargets, getSalespeople, saveKpiTargets, type KpiTargetRow } from "@/actions/kpi-actions";
import { COMMERCIAL_KPIS } from "@/lib/commercial-kpis";
import { useAuth } from "@/components/providers/auth-provider";
import { getYearRange } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Valor del selector para el total de la compañía: el ámbito real es null, pero
// un Select necesita una cadena.
const TOTAL = "__total__";

type Draft = Record<string, { target: string; weight: string }>;

function emptyDraft(): Draft {
  return Object.fromEntries(COMMERCIAL_KPIS.map((k) => [k.key, { target: "", weight: "" }]));
}

function toDraft(rows: KpiTargetRow[]): Draft {
  const d = emptyDraft();
  for (const r of rows) {
    if (d[r.kpi_key]) d[r.kpi_key] = { target: String(r.target_value), weight: String(r.weight_pct) };
  }
  return d;
}

export function KpiTargetsForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [scope, setScope] = useState<string>(TOTAL);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const esAdmin = profile?.role === "admin";
  const salesperson = scope === TOTAL ? null : scope;

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
    enabled: esAdmin,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["kpi-targets", year, scope],
    queryFn: () => getKpiTargets(year, salesperson),
    enabled: esAdmin,
  });

  useEffect(() => {
    // El borrador se rehace al cambiar de año o de ámbito.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setDraft(toDraft(data ?? []));
  }, [data]);

  // Solo cuentan los KPIs con peso: el resto no se mide en ese ámbito.
  const enviados = useMemo(
    () =>
      COMMERCIAL_KPIS.map((k) => ({
        kpi_key: k.key,
        target_value: Number(draft[k.key]?.target ?? ""),
        weight_pct: Number(draft[k.key]?.weight ?? ""),
      })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0),
    [draft]
  );
  const suma = useMemo(() => enviados.reduce((s, i) => s + i.weight_pct, 0), [enviados]);
  const valido = Math.round(suma * 100) === 10000 && enviados.every((i) => i.target_value > 0);

  if (!esAdmin) return null;

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveKpiTargets(year, salesperson, enviados);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Metas guardadas");
      queryClient.invalidateQueries({ queryKey: ["kpi-targets", year, scope] });
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
            <Target className="size-4 text-primary" /> Metas de KPIs comerciales
          </CardTitle>
          <CardDescription>
            Meta y peso de cada KPI para el año y el ámbito elegidos. Solo se guardan los KPIs con peso, y los pesos de cada ámbito deben sumar 100.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
            <SelectTrigger className="w-[110px]" aria-label="Año"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v) => { if (v) setScope(v); }}>
            <SelectTrigger className="w-[200px]" aria-label="Ámbito"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL}>Total compañía</SelectItem>
              {(vendedoresQ.data ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando metas…</p>
        ) : (
          <div className="space-y-3">
            {COMMERCIAL_KPIS.map((k) => (
              <div key={k.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px] sm:items-center">
                <div>
                  <div className="text-sm font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground capitalize">{k.period}</div>
                </div>
                <Input
                  aria-label={`Meta de ${k.label}`}
                  inputMode="decimal"
                  value={draft[k.key]?.target ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k.key]: { ...d[k.key], target: e.target.value } }))}
                />
                <Input
                  aria-label={`Peso de ${k.label}`}
                  inputMode="decimal"
                  value={draft[k.key]?.weight ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k.key]: { ...d[k.key], weight: e.target.value } }))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
          <span className={valido ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
            Suma de pesos: {Math.round(suma * 100) / 100}%
          </span>
          <Button onClick={guardar} disabled={!valido || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar metas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Renderizar la tarjeta**

En `src/app/(dashboard)/settings/page.tsx`, añadir el import junto a los demás:

```tsx
import { KpiTargetsForm } from "./_components/kpi-targets-form";
```

y, después del `</div>` que cierra el `grid gap-8 lg:grid-cols-2 lg:items-start` y antes del `</div>` final del contenedor:

```tsx
      <KpiTargetsForm />
```

- [ ] **Step 6: Typecheck y lint**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 7: Ejecutar y verificar que pasan**

Esperar 60 s desde la ejecución del Step 3 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpi-targets.spec.ts`
Expected: `5 passed` (2 de `setup` y 3 nuevos).

- [ ] **Step 8: Commit**

```bash
git add e2e/db/seed-app.mjs e2e/specs/kpi-targets.spec.ts "src/app/(dashboard)/settings/_components/kpi-targets-form.tsx" "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(kpis): pantalla de metas por ambito en Configuracion"
```

---

### Task 7: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Tests unitarios**

Run: `npm test`
Expected: `Tests  143 passed | 1 skipped (144)`: los 129 anteriores más 5 del catálogo y 9 del esquema.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s desde la última ejecución y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `37 passed` (los 34 actuales y los 3 nuevos).

- [ ] **Step 3: Estado de la rama y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpis-comerciales` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|[0-9]{1,3}(\.[0-9]{3}){2,}|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida. Ningún nombre real de vendedor.

> **El patrón no se escribe en este fichero.** Los apellidos reales de los comerciales son
> justo lo que no puede acabar en un repositorio público: meterlos dentro del propio comando
> de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero
> fuera del repositorio, un nombre por línea, que escribe quien ejecuta el plan. Si no existe,
> la comprobación no está hecha: no se puede dar por buena.

---

### Task 8: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Push, PR y merge son visibles en un repositorio público. Pedir confirmación explícita y recordar que **este PR trae migración**: la `0008` hay que ejecutarla en el cliente Postgres antes de desplegar, o la pantalla de Configuración fallará al leer las metas.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/kpis-comerciales`

- [ ] **Step 3: Abrir el PR**

Si alguna cifra real de la Task 7 difiere, poner la real.

```bash
gh pr create --base main --head feat/kpis-comerciales \
  --title "feat(kpis): metas de kpis comerciales y pantalla de configuracion" \
  --body "$(cat <<'EOF'
## Qué

Primer PR de dos para la tabla de KPIs comerciales. Este trae **dónde se guardan las metas y cómo se configuran**; el siguiente traerá el cálculo y la tabla en la pestaña Comercial.

- Tabla nueva `kpi_targets` (migración `0008`): meta y peso por empresa, año, KPI y ámbito. `salesperson` nulo es el total de la compañía; con nombre, la meta de ese comercial. La unicidad usa `NULLS NOT DISTINCT` para que no quepan dos filas del total.
- Catálogo de los 8 KPIs en código (`src/lib/commercial-kpis.ts`): la base de datos solo guarda valores, nunca la definición.
- Acciones `getKpiTargets`, `saveKpiTargets` y `getSalespeople`. Guardar es solo para administradores y valida con zod: claves del catálogo, metas positivas, dos decimales como mucho y pesos que suman 100 dentro del ámbito.
- Tarjeta "Metas de KPIs comerciales" en Configuración, con selector de año y de ámbito, visible solo para administradores.

Ninguna meta real entra en el repositorio: la migración crea la tabla vacía y la semilla E2E usa valores y vendedores inventados.

## Por qué las metas son por vendedor

La tabla del segundo PR filtra los importes por comercial. Con una meta única de compañía, cada persona aparecería siempre por debajo de su objetivo por construcción. Se decidió antes de que la tabla tenga datos, que es cuando cambiar la clave única es barato.

## Migración

**Antes de desplegar** hay que ejecutar `drizzle/0008_kpi_targets.sql` en el cliente Postgres. El spec pendiente del reset de contraseña se renumera a `0009`.

## Tests

- Vitest: catálogo (5) y esquema de validación (9), incluido el caso de pesos con tres decimales que se guardaban como 99,99 y dejaban la pantalla bloqueada.
- E2E (`e2e/specs/kpi-targets.spec.ts`): la tarjeta muestra las metas del total, el botón se bloquea si los pesos no suman 100, y al cambiar de ámbito las metas no se arrastran.

## Gates

- `npm run typecheck`: limpio
- `npm run lint`: 10 warnings, 0 errores
- `npm test`: 143 pasando + 1 saltado
- `npm run test:e2e`: 37/37

Spec: `docs/superpowers/specs/2026-09-16-kpis-comerciales-design.md`
Plan: `docs/superpowers/plans/2026-09-16-kpis-comerciales-metas.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Esperar al CI**

Run: `gh pr checks feat/kpis-comerciales --watch`
Expected: `build`, `e2e` y GitGuardian en verde. Si el comando devuelve un código distinto de cero pero los tres checks figuran en verde, comprobar el estado real antes de decidir: ya ha pasado antes.

- [ ] **Step 5: Fusionar**

```bash
N=$(gh pr view feat/kpis-comerciales --json number -q .number)
gh pr merge "$N" --merge --subject "feat(kpis): metas de kpis comerciales y pantalla de configuracion (#$N)" --body "feat(kpis): metas de kpis comerciales y pantalla de configuracion"
```

- [ ] **Step 6: Sincronizar `main` local**

Run: `git checkout main && git fetch origin && git merge --ff-only origin/main`

El usuario ejecuta la migración y despliega. Después se planifica el segundo PR.
