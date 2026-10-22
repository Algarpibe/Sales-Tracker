# Histórico de ventas por cliente 2015-2020 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la tabla "Ventas por cliente" (`/clientes`) muestre también 2015-2020, sin que ninguna otra pantalla de la aplicación se entere.

**Architecture:** Tabla nueva `historical_customer_sales` en la BD del app. `getCustomerSales` gana un flag opcional `includeHistory` que solo pasa esa página; las filas históricas se concatenan a las del hub y `buildCustomerMatrix` las agrupa por cliente sin cambios. Un campo opcional `source` permite distinguir la procedencia para no enlazar al drill-down a los clientes que solo tienen histórico.

**Tech Stack:** Drizzle ORM, Postgres, react-query, Next 16, vitest.

**Spec:** [`docs/superpowers/specs/2026-09-10-historico-ventas-cliente-design.md`](../specs/2026-09-10-historico-ventas-cliente-design.md)

---

## Restricciones que NO se pueden ignorar

### R1 — El repositorio es PÚBLICO

Ni un nombre de cliente ni un importe pueden acabar commiteados. La migración (solo esquema) sí va al repo. El `.sql` con los datos, el CSV histórico, el export de clientes y el fichero de alias **no**. La Task 7 añade las rutas correspondientes a `.gitignore` **antes** de que exista ningún fichero con datos.

### R2 — Solo esta vista

Hay **seis** consumidores más de `getCustomerSales`: `client-pareto-card.tsx`, `new-vs-recurring-card.tsx`, `top-customers-pareto.tsx`, `command-palette.tsx`, `customer-evolution-card.tsx` y `customer-kpi-row.tsx`. Ninguno debe cambiar de comportamiento. Por eso `includeHistory` y `source` son **opcionales**: sin pasarlos, todo funciona igual que hoy.

### R3 — Hay diez constantes `FIRST_YEAR = 2021` distintas

Una por fichero. **Solo se toca la de `src/app/(dashboard)/clientes/page.tsx:42`.** Las otras nueve (`cliente-articulo`, `clientes/[customer]`, `new-vs-recurring-card`, `group-evolution-card`, `grouping-analysis-card`, `historical-sales-category`, `command-palette`, `customer-evolution-card`, `customer-kpi-row`) se quedan como están.

### R4 — El operador solo ejecuta SQL

No tiene shell en el contenedor. Todo lo que deba correr en producción tiene que ser SQL pegable en la pestaña Postgres Client. Y el terminal de EasyPanel **junta las líneas al pegar**: el SQL generado va en una sola línea.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `drizzle/0007_historical_customer_sales.sql` | La migración. Solo esquema. |
| `src/db/schema.ts` | Definición Drizzle de la tabla nueva. |
| `src/db/historical-customer-sales.ts` | Única lectura de la tabla. Devuelve `CustomerYearRow[]`. |
| `src/actions/customer-sales-actions.ts` | Fusiona hub + histórico bajo el flag. |
| `src/lib/customer-sales.ts` | `hubCustomerNames`, helper puro para decidir el enlace. |
| `src/app/(dashboard)/clientes/page.tsx` | Rango de años, flag y render condicional del enlace. |
| `scripts/generar-historico.mjs` | Genera el `.sql` de importación. No lee ni escribe nada del repo. |

---

### Task 1: Migración y esquema de la tabla histórica

**Files:**
- Create: `drizzle/0007_historical_customer_sales.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Escribir la migración**

`drizzle/0007_historical_customer_sales.sql`:

```sql
-- Historico de ventas por cliente 2015-2020, anterior a la cobertura del zoho-hub.
-- Solo lo consume la vista /clientes; ninguna otra pantalla lee esta tabla.
CREATE TABLE IF NOT EXISTS historical_customer_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  record_year integer NOT NULL,
  amount_usd numeric(15,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_customer_sales_unique UNIQUE (company_id, customer_name, record_year)
);

CREATE INDEX IF NOT EXISTS idx_hist_customer_company_year
  ON historical_customer_sales (company_id, record_year);
```

El `UNIQUE` es lo que permite que la importación sea idempotente.

- [ ] **Step 2: Añadir la tabla a `src/db/schema.ts`**

Al final del fichero, después de `savedViews`:

```ts
// Historico de ventas por cliente 2015-2020 (anterior al zoho-hub). Solo lo lee
// la vista /clientes a traves de getCustomerSales({ includeHistory: true }).
export const historicalCustomerSales = pgTable("historical_customer_sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customer_name: text("customer_name").notNull(),
  record_year: integer("record_year").notNull(),
  amount_usd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("historical_customer_sales_unique").on(t.company_id, t.customer_name, t.record_year),
  index("idx_hist_customer_company_year").on(t.company_id, t.record_year),
]);
```

Comprueba que `numeric`, `integer`, `unique` e `index` ya estén importados al principio de `schema.ts`; `salesRecords` usa los cuatro, así que deberían estar.

- [ ] **Step 3: Verificar que la migración aplica desde cero**

La infraestructura de E2E aplica `/drizzle/*.sql` en orden sobre una base vacía, así que sirve como validador:

```bash
E2E_PG_PORT=55433 npm run e2e:db:up
E2E_PG_PORT=55433 npm run e2e:db:reset
```

Esperado: en la salida aparece `migracion aplicada: 0007_historical_customer_sales.sql` y el reset termina con `Listo.`

Nota: `55433` porque el `55432` puede estar ocupado por el Postgres de otro proyecto de la máquina.

- [ ] **Step 4: Verificar el typecheck**

```bash
npm run typecheck
```
Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0007_historical_customer_sales.sql src/db/schema.ts
git commit -m "feat(historico): tabla historical_customer_sales (migracion 0007)"
```

---

### Task 2: Helper puro `hubCustomerNames` (TDD)

Este helper decide qué filas llevan enlace al drill-down. Es la pieza que evita que los 17 clientes solo-históricos lleven a una página vacía.

**Files:**
- Modify: `src/types/database.ts:221-225`
- Modify: `src/lib/customer-sales.ts`
- Test: `src/lib/__tests__/customer-sales.test.ts`

- [ ] **Step 1: Añadir el campo opcional `source` al tipo**

En `src/types/database.ts`, la interfaz `CustomerYearRow` queda:

```ts
export interface CustomerYearRow {
  customer: string;
  year: number;
  ventas: number;        // neto del descuento de cabecera (igual al informe Zoho)
  /**
   * Procedencia de la fila. Opcional a proposito: los seis consumidores que no
   * piden historico no lo reciben ni lo necesitan, y su tipo no cambia.
   */
  source?: "hub" | "historical";
}
```

- [ ] **Step 2: Escribir el test que falla**

Añadir al final de `src/lib/__tests__/customer-sales.test.ts`:

```ts
describe("hubCustomerNames", () => {
  it("incluye solo a los clientes con alguna fila del hub", () => {
    const rows: CustomerYearRow[] = [
      { customer: "Cliente A", year: 2021, ventas: 100, source: "hub" },
      { customer: "Cliente D", year: 2018, ventas: 50, source: "historical" },
    ];
    const set = hubCustomerNames(rows);
    expect(set.has("Cliente A")).toBe(true);
    expect(set.has("Cliente D")).toBe(false);
  });

  it("incluye al cliente que tiene filas de las DOS fuentes", () => {
    // Cliente B: historico 2015-2017 y facturacion en 2025. Debe conservar su enlace.
    const rows: CustomerYearRow[] = [
      { customer: "Cliente B", year: 2015, ventas: 100, source: "historical" },
      { customer: "Cliente B", year: 2025, ventas: 200, source: "hub" },
    ];
    expect(hubCustomerNames(rows).has("Cliente B")).toBe(true);
  });

  it("trata las filas sin source como del hub (compatibilidad)", () => {
    // Los seis consumidores que no piden historico no rellenan source.
    const rows: CustomerYearRow[] = [{ customer: "Cliente A", year: 2021, ventas: 100 }];
    expect(hubCustomerNames(rows).has("Cliente A")).toBe(true);
  });
});

describe("buildCustomerMatrix con dos fuentes", () => {
  it("colapsa hub e historico del mismo cliente en UNA sola fila", () => {
    const rows: CustomerYearRow[] = [
      { customer: "Cliente B", year: 2015, ventas: 100, source: "historical" },
      { customer: "Cliente B", year: 2025, ventas: 200, source: "hub" },
    ];
    const matrix = buildCustomerMatrix(rows);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].byYear[2015]).toBe(100);
    expect(matrix[0].byYear[2025]).toBe(200);
    expect(matrix[0].total).toBe(300);
  });
});
```

Asegúrate de que `hubCustomerNames` y `CustomerYearRow` están en los `import` del principio del fichero de test.

- [ ] **Step 3: Ejecutar el test y verificar que falla**

```bash
npx vitest run src/lib/__tests__/customer-sales.test.ts
```
Esperado: **FALLA** con `hubCustomerNames is not a function` o un error de importación.

(El bloque `buildCustomerMatrix con dos fuentes` pasará ya: caracteriza el comportamiento actual y queda como guardia contra regresiones. El que debe fallar es el de `hubCustomerNames`.)

- [ ] **Step 4: Implementar el helper**

Añadir a `src/lib/customer-sales.ts`, después de `buildCustomerMatrix`:

```ts
/**
 * Clientes con al menos una fila procedente del hub. Solo estos enlazan al
 * drill-down: /clientes/[customer] consulta unicamente el hub, asi que para un
 * cliente que solo tiene historico la pagina saldria vacia.
 *
 * Se decide por PROCEDENCIA, no por importes a cero: un cliente del hub con
 * todos los anios a cero (existen) conserva su enlace igual que hoy.
 * Las filas sin `source` se consideran del hub, para no romper a los
 * consumidores que no piden historico.
 */
export function hubCustomerNames(rows: CustomerYearRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.source !== "historical") set.add(r.customer);
  }
  return set;
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

```bash
npx vitest run src/lib/__tests__/customer-sales.test.ts
```
Esperado: PASA, los cuatro casos nuevos incluidos.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/customer-sales.ts src/lib/__tests__/customer-sales.test.ts
git commit -m "feat(historico): helper hubCustomerNames y campo opcional source"
```

---

### Task 3: Lectura de la tabla histórica

**Files:**
- Create: `src/db/historical-customer-sales.ts`

- [ ] **Step 1: Escribir el módulo de lectura**

`src/db/historical-customer-sales.ts`:

```ts
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { historicalCustomerSales } from "@/db/schema";
import type { CustomerYearRow } from "@/types/database";

/** Ultimo anio cubierto por el historico. A partir de 2021 manda el zoho-hub. */
export const HISTORICAL_LAST_YEAR = 2020;

/**
 * Ventas por cliente y anio anteriores al zoho-hub (2015-2020).
 * Devuelve el mismo shape que el hub para poder concatenarlas sin transformar.
 */
export async function getHistoricalCustomerSales(
  companyId: string,
  desdeAnio: number,
  hastaAnio: number
): Promise<CustomerYearRow[]> {
  const rows = await db
    .select({
      customer: historicalCustomerSales.customer_name,
      year: historicalCustomerSales.record_year,
      ventas: historicalCustomerSales.amount_usd,
    })
    .from(historicalCustomerSales)
    .where(
      and(
        eq(historicalCustomerSales.company_id, companyId),
        gte(historicalCustomerSales.record_year, desdeAnio),
        lte(historicalCustomerSales.record_year, Math.min(hastaAnio, HISTORICAL_LAST_YEAR))
      )
    );

  return rows.map((r) => ({
    customer: String(r.customer),
    year: Number(r.year),
    // amount_usd es numeric: Drizzle lo entrega como string.
    ventas: Number(r.ventas),
    source: "historical" as const,
  }));
}
```

- [ ] **Step 2: Verificar el typecheck**

```bash
npm run typecheck
```
Esperado: sin errores. Si `numeric` no devuelve `string` en esta versión de Drizzle, el `Number(r.ventas)` sigue siendo correcto; no lo cambies por un cast.

- [ ] **Step 3: Commit**

```bash
git add src/db/historical-customer-sales.ts
git commit -m "feat(historico): lectura de historical_customer_sales"
```

---

### Task 4: `getCustomerSales` con el flag `includeHistory`

**Files:**
- Modify: `src/types/database.ts:215-219`
- Modify: `src/actions/customer-sales-actions.ts`

- [ ] **Step 1: Añadir el flag al tipo de filtros**

En `src/types/database.ts`:

```ts
export interface CustomerSalesFilters {
  tipo: RecordType;      // "SALES_ORDER" (OV) | "INVOICE" (FAC)
  desdeAnio: number;
  hastaAnio: number;
  /**
   * Incluir el historico 2015-2020. Opcional y por defecto false: SOLO lo pide
   * la vista /clientes. Los otros seis consumidores no lo pasan y siguen
   * viendo unicamente lo que devuelve el zoho-hub.
   */
  includeHistory?: boolean;
}
```

- [ ] **Step 2: Fusionar en la acción**

`src/actions/customer-sales-actions.ts` queda así completo:

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import { getHistoricalCustomerSales, HISTORICAL_LAST_YEAR } from "@/db/historical-customer-sales";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerSales(filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  const { profile } = await requireApproved();

  const hubRows = (await getHubCustomerSales(filters)).map((r) => ({
    ...r,
    source: "hub" as const,
  }));

  // El historico solo se sirve a quien lo pide explicitamente (hoy: /clientes).
  // Ademas es facturacion consolidada, asi que no aplica a Ordenes de Venta,
  // y no existe por encima de 2020: fuera de ese rango ni se consulta.
  const aplica =
    filters.includeHistory === true &&
    filters.tipo === "INVOICE" &&
    filters.desdeAnio <= HISTORICAL_LAST_YEAR;

  if (!aplica) return hubRows;

  const histRows = await getHistoricalCustomerSales(
    profile.company_id,
    filters.desdeAnio,
    filters.hastaAnio
  );

  return [...hubRows, ...histRows];
}
```

- [ ] **Step 3: Verificar que los otros consumidores no rompen**

```bash
npm run typecheck
npm run lint
```
Esperado: typecheck limpio; lint en **exactamente 10 warnings, 0 errores**.

Comprueba a mano que estos seis ficheros **no** han cambiado y siguen llamando sin el flag:

```bash
grep -rn "getCustomerSales({" src/components src/app | grep -v "clientes/page.tsx"
```
Esperado: seis llamadas, ninguna con `includeHistory`.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/actions/customer-sales-actions.ts
git commit -m "feat(historico): flag includeHistory opcional en getCustomerSales"
```

---

### Task 5: La página `/clientes` pide el histórico

**Files:**
- Modify: `src/app/(dashboard)/clientes/page.tsx:42`
- Modify: `src/app/(dashboard)/clientes/page.tsx:134-137`

- [ ] **Step 1: Ampliar el rango de años**

Línea 42:

```ts
// 2015 porque esta vista (y SOLO esta) incorpora el historico previo al hub.
// Las otras nueve constantes FIRST_YEAR de la app siguen en 2021.
const FIRST_YEAR = 2015;
```

- [ ] **Step 2: Pedir el histórico en la consulta**

Líneas 134-137:

```ts
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo, desdeAnio, hastaAnio, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio, hastaAnio, includeHistory: true }),
  });
```

`includeHistory` entra en la `queryKey` a propósito: si no, la caché de react-query podría servir a esta página un resultado sin histórico cacheado por otro componente con los mismos `tipo`/`desdeAnio`/`hastaAnio`.

- [ ] **Step 3: Verificar en el navegador**

```bash
npm run dev
```

Abre `/clientes`, pon **Desde año 2015**, **Hasta año 2026**, tipo **Facturas (FAC)**.

Esperado: aparecen las columnas 2015 a 2020. Todavía **sin datos**, porque la importación es la Task 7; lo que se comprueba aquí es que el rango se amplía y la página no revienta.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(historico): /clientes arranca en 2015 y pide el historico"
```

---

### Task 6: Los clientes solo-históricos no enlazan

**Files:**
- Modify: `src/app/(dashboard)/clientes/page.tsx` (imports, `useMemo` nuevo y render de la celda de nombre)

- [ ] **Step 1: Importar el helper**

Añadir `hubCustomerNames` al import que ya trae `buildCustomerMatrix` desde `@/lib/customer-sales` (línea ~14).

- [ ] **Step 2: Derivar el conjunto de clientes del hub**

Justo después de `const matrix = useMemo(...)` (línea ~144):

```ts
  // Clientes con presencia en el hub. Los que solo tienen historico no enlazan
  // al drill-down, porque esa pagina consulta unicamente el hub y saldria vacia.
  const conHub = useMemo(() => hubCustomerNames(rows), [rows]);
```

- [ ] **Step 3: Render condicional del nombre**

Sustituir el contenido del `<span className="inline-flex items-center gap-2">` de la línea ~270:

```tsx
                        <span className="inline-flex items-center gap-2">
                          <FavoriteStar active={favSet.has(r.customer)} onToggle={() => favMut.mutate(r.customer)} />
                          {conHub.has(r.customer) ? (
                            <Link href={`/clientes/${encodeURIComponent(r.customer)}`} className="hover:text-primary hover:underline">{r.customer}</Link>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {r.customer}
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                solo histórico
                              </span>
                            </span>
                          )}
                        </span>
```

- [ ] **Step 4: Verificar los gates**

```bash
npm run typecheck
npm run lint
npm test
```
Esperado: typecheck limpio; lint en **exactamente 10 warnings, 0 errores**; vitest en **117 pasando + 1 saltado**, más los cuatro casos nuevos de la Task 2 (es decir, **121 pasando + 1 saltado**).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(historico): los clientes solo-historicos no enlazan al drill-down"
```

---

### Task 7: Generador del SQL de importación

**Files:**
- Create: `scripts/generar-historico.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Blindar el `.gitignore` ANTES de crear nada**

Este paso va primero a propósito: el repositorio es público y no puede haber ninguna ventana en la que un fichero con datos de clientes sea rastreable.

Añadir al final de `.gitignore`:

```gitignore
# Datos del historico de clientes: nombres reales e importes de Ambientalia.
# Este repositorio es PUBLICO. Ni las entradas ni el SQL generado se versionan.
/scripts/historico/
```

- [ ] **Step 2: Escribir el generador**

`scripts/generar-historico.mjs`:

```js
/**
 * Genera el SQL de importacion del historico de ventas por cliente 2015-2020.
 *
 * Entradas (todas en scripts/historico/, ignorado por git):
 *   historico.csv   - matriz cliente x anio del origen (separador ";")
 *   clientes.csv    - export de /clientes (boton Exportar > CSV), lista canonica
 *   alias.csv       - "nombre en el historico";"nombre canonico del hub"
 *
 * Salida:
 *   scripts/historico/importar-historico.sql
 *
 * El SQL sale en UNA SOLA LINEA: el terminal de EasyPanel junta las lineas al
 * pegar y un bloque multilinea se corrompe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mismo patron que e2e/db/reset.mjs: fileURLToPath en vez de import.meta.dirname,
// que solo existe desde Node 20.11.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(AQUI, "historico");
const EMPRESA = "Ambientalia S.A.S.";

function leerCsv(nombre) {
  const ruta = path.join(DIR, nombre);
  if (!fs.existsSync(ruta)) throw new Error(`Falta ${ruta}`);
  return fs.readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(";"));
}

// "69,809" -> 69809 ; "" -> 0
const num = (v) => (v === undefined || v.trim() === "" ? 0 : Number(v.replace(/,/g, "")));
const sqlStr = (s) => "'" + s.replace(/'/g, "''") + "'";

const histFilas = leerCsv("historico.csv");
const anios = histFilas[0].slice(1).map(Number);

const canonicos = new Set(
  leerCsv("clientes.csv").slice(1).map((p) => p[0]).filter((n) => n && n !== "TOTAL")
);

const alias = new Map(
  leerCsv("alias.csv").map((p) => [p[0].trim(), p[1].trim()])
);

const valores = [];
const sinCasar = [];
let descartadas = 0;

for (const fila of histFilas.slice(1)) {
  const original = fila[0].trim();
  if (!original) continue;
  const importes = fila.slice(1).map(num);
  if (importes.every((v) => v === 0)) { descartadas++; continue; }

  const destino = alias.get(original) ?? original;
  if (!canonicos.has(destino)) sinCasar.push({ nombre: original, total: importes.reduce((a, b) => a + b, 0) });

  importes.forEach((importe, i) => {
    if (importe === 0) return;
    valores.push(`(${sqlStr(destino)},${anios[i]},${importe.toFixed(2)})`);
  });
}

const sql =
  "INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd) " +
  "SELECT c.id, v.customer_name, v.record_year, v.amount_usd FROM companies c " +
  `CROSS JOIN (VALUES ${valores.join(",")}) AS v(customer_name, record_year, amount_usd) ` +
  `WHERE c.name = ${sqlStr(EMPRESA)} ` +
  "ON CONFLICT (company_id, customer_name, record_year) DO UPDATE SET amount_usd = EXCLUDED.amount_usd;";

fs.writeFileSync(path.join(DIR, "importar-historico.sql"), sql + "\n", "utf8");

const total = valores.reduce((a, v) => a + Number(v.split(",").pop().replace(")", "")), 0);
console.log(`Filas de origen descartadas por estar vacias: ${descartadas}`);
console.log(`Pares (cliente, anio) a insertar: ${valores.length}`);
console.log(`Importe total: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`\nSQL escrito en scripts/historico/importar-historico.sql`);

if (sinCasar.length) {
  console.log(`\nSIN correspondencia en el hub (${sinCasar.length}). Entraran como clientes solo-historicos.`);
  console.log(`Si alguno deberia mapearse a un cliente existente, anadelo a alias.csv y vuelve a ejecutar:`);
  sinCasar.sort((a, b) => b.total - a.total).forEach((r) => console.log(`  $${Math.round(r.total).toLocaleString("en-US").padStart(9)}  ${r.nombre}`));
}
```

- [ ] **Step 3: Preparar las entradas y ejecutar**

Crea `scripts/historico/` y coloca ahí los tres ficheros. `alias.csv` con estas dos líneas exactas:

```
Cliente B;Cliente B S.A. - Grupo B
Cliente C S.A.S. - C;Cliente C S.A.S.
```

```bash
node scripts/generar-historico.mjs
```

Esperado en la salida:
- `Filas de origen descartadas por estar vacias: 50`
- `Importe total: $2,745,037.00`
- La lista de sin-correspondencia con **17 nombres**, encabezada por Cliente D ($X)

Si los números no coinciden, **para y repórtalo**: significa que la entrada no es la que se analizó al diseñar.

- [ ] **Step 4: Verificar que nada con datos es rastreable**

```bash
git status --short
git check-ignore -v scripts/historico/importar-historico.sql
```
Esperado: `git status` **no** menciona `scripts/historico/`, y `check-ignore` confirma la regla. Si el fichero apareciera como no rastreado, **no commitees nada** y arregla el `.gitignore` primero.

- [ ] **Step 5: Commit (solo el script, nunca los datos)**

```bash
git add scripts/generar-historico.mjs .gitignore
git commit -m "feat(historico): generador del SQL de importacion"
```

---

### Task 8: Verificación completa

**Files:** ninguno. Esta tarea solo comprueba.

- [ ] **Step 1: Importar en local y comprobar los totales**

Con la BD de E2E levantada (`E2E_PG_PORT=55433`), aplica el SQL generado contra `salestracker_e2e` y comprueba:

```bash
docker exec -i salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -c "SELECT record_year, sum(amount_usd) FROM historical_customer_sales GROUP BY 1 ORDER BY 1;"
```

Esperado, por año: 2015 $154.136 · 2016 $219.463 · 2017 $283.197 · 2018 $715.095 · 2019 $726.832 · 2020 $646.314.

- [ ] **Step 2: Comprobar la idempotencia**

Ejecuta el mismo SQL **una segunda vez** y repite la consulta anterior.

Esperado: los totales **no cambian** y no aparecen filas duplicadas.

- [ ] **Step 3: Comprobar el aislamiento, que es el requisito central**

En el navegador, con datos importados:

1. `/clientes` con rango 2015-2026 y Facturas → columnas 2015-2020 con datos; Cliente A y Cliente B en **una sola fila** cada uno; Cliente D presente con el distintivo `solo histórico` y **sin enlace**.
2. `/clientes` con el tipo en **Órdenes de Venta** → las columnas 2015-2020 quedan vacías.
3. `/clientes/Cliente%20A%20S.A.S.` → el drill-down sigue mostrando **solo 2021+**.
4. `/analytics`, pestaña Comercial → Pareto de clientes y "Nuevos vs recurrentes" **sin rastro** de años anteriores a 2021.
5. `/home` → el widget Top Clientes igual que antes.
6. Cmd-K, buscar "Cliente D" → **no aparece** (el command palette no pide histórico).

- [ ] **Step 4: Gates**

```bash
npm run typecheck
npm run lint
npm test
E2E_PG_PORT=55433 npm run test:e2e
```

Esperado: typecheck limpio; lint en **10 warnings, 0 errores**; vitest en **121 pasando + 1 saltado**; E2E en **29/29**.

- [ ] **Step 5: Entregar el SQL al operador**

El fichero `scripts/historico/importar-historico.sql` **no se commitea**. Se entrega al operador por un canal privado para que lo ejecute en la pestaña Postgres Client, después de la migración `0007`.

---

## Orden de despliegue

1. Merge del código.
2. El operador ejecuta **`drizzle/0007_historical_customer_sales.sql`**.
3. El operador ejecuta **`importar-historico.sql`** (entregado aparte).

Si se despliega el código sin el paso 2, la vista `/clientes` fallará al consultar una tabla inexistente. **La migración va antes que el deploy.**

---

## Autorrevisión del plan

- **Cobertura del spec:** §1 → Task 1; §2 → Task 7; §3.1 → Tasks 3 y 4; §3.2 → Task 5; §3.3 → Tasks 2 y 6; §4 → Task 2; §5 y §7 → Task 8. Los nueve criterios de aceptación tienen comprobación: 1-4 y 6 en Task 8 Step 3; 5 en Task 8 Step 3 puntos 3-6 y en Task 4 Step 3; 7 en Task 8 Step 1; 8 en Task 8 Step 2; 9 en Task 8 Step 4.
- **Recuento de tests:** vitest pasa de 117 a **121** por los cuatro casos de la Task 2. Ese número se usa como esperado en las Tasks 6 y 8.
- **Consistencia de nombres:** `hubCustomerNames`, `getHistoricalCustomerSales`, `HISTORICAL_LAST_YEAR`, `historicalCustomerSales`, `includeHistory` y `source` se definen en las Tasks 1-4 y se usan con esos mismos nombres en las Tasks 5, 6 y 8.
- **Riesgo asumido:** el `.gitignore` se blinda en el primer paso de la Task 7, antes de que exista ningún fichero con datos. Es deliberado: en un repositorio público, un commit accidental de esos datos no se puede deshacer.
