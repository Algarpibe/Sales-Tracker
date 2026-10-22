# Ventas por cliente × categoría — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir la sección «Ventas por cliente × categoría» (`/cliente-categoria`), accesible desde el menú lateral, el menú móvil y la paleta de comandos. Funciona como «Ventas por cliente × artículo», pero cada cliente se desglosa por categoría en lugar de por artículo, con OV/FAC, año, «Comparar años», buscador y exportación (copiar, CSV y Excel).

**Architecture:** Página cliente nueva que reutiliza la lectura `getCustomerItemSales` con la **misma clave de react-query** (`["customer-item", { tipo, anio }]`) y agrega en el navegador por (cliente, categoría) con lógica pura en `src/lib/customer-category.ts`. La comparación de años vive en `src/lib/customer-category-compare.ts` y en un componente de tabla propio. Los totales generales usan `computeGrandTotals` de `src/lib/customer-item.ts`, cuyo parámetro se generaliza sin cambiar su comportamiento. Los selectores de año y el interruptor «Comparar años» se extraen a un componente común que usan las dos páginas. Sin consultas nuevas al hub, sin migración.

**Tech Stack:** Next.js (App Router, server actions), React, TanStack Query, TypeScript, componentes base-ui (no Radix: `render={}` en lugar de `asChild`), lucide-react, vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-cliente-categoria-design.md`

---

## Contexto para quien ejecuta

Convenciones obligatorias en todas las tareas:

- **Idioma.** El plan está en español. Los comentarios del código van en español y explican el porqué, no el qué. Los textos de la interfaz, en español.
- **Commits.** Conventional commits en español **sin tildes ni eñes** y con `x` en lugar de `×` (`cliente x categoria`). **Sin** `Co-Authored-By` ni ninguna atribución a IA. **Un commit por tarea.** Nunca se reescribe historia: nada de `git commit --amend`, `rebase` ni `reset`. Si algo sale mal tras un commit, se arregla con un commit nuevo.
- **Finales de línea.** El repo guarda LF; la copia de trabajo está en CRLF por `core.autocrlf=true`. **Nunca `sed -i`.** Para modificar ficheros existentes se usa la herramienta Edit (conserva el CRLF) o un script de node que lo conserve. Los ficheros **nuevos** creados con Write quedan en LF: conviértelos a CRLF justo después con

  ```bash
  node -e "const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))" RUTA_DEL_FICHERO
  ```

- **Migraciones.** Ninguna. El despliegue es solo código.
- **Permisos.** La lectura es `getCustomerItemSales`, que ya exige `requireApproved()`. No cambia nada: la sección la ven todos los usuarios aprobados.
- **Datos de E2E.** Solo datos inventados: el repositorio es público. Esta funcionalidad no toca la semilla; los tests usan los clientes y categorías inventados que ya siembran `e2e/db/seed-hub.mjs` y `e2e/db/seed-app.mjs`.
- **UI.** Los componentes de `@/components/ui` son base-ui, no Radix.
- **Comandos E2E** (Windows, Git Bash):
  - Si Docker no está arrancado: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar a que `docker info` responda.
  - `E2E_PG_PORT=55433 npm run e2e:db:up`
  - Suite completa: `E2E_PG_PORT=55433 npm run test:e2e` (reinicia la BD y lanza Playwright).
  - Un solo spec: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/NOMBRE.spec.ts`
  - El puerto **3100 tiene que estar libre**: si hay un servidor vivo, Playwright lo reutiliza (`reuseExistingServer`) y probaría un build viejo. Comprobar con `netstat -ano | grep ":3100"`.
  - Deja **al menos 60 s entre dos ejecuciones de Playwright**: el proyecto `setup` hace logins y el login admite 5 intentos por minuto.
  - La máquina local es lenta (unos 5 s por página): un timeout aislado en un spec ajeno a esta funcionalidad es ambiental; se repite ese spec solo antes de darlo por roto.
- **Líneas base.** `npx vitest run`: 399 passed, 1 skipped. `npm run lint`: exactamente 10 warnings y 0 errores. E2E: 68 passing.

## Contexto verificado (2026-09-29, rama `feat/cliente-categoria`)

- `src/app/(dashboard)/cliente-articulo/page.tsx`:
  - `FIRST_YEAR = 2021` local, `allYears` con `useMemo`, controles OV/FAC (`RecordTypeToggle`), año o año A / año B (`Select`) e interruptor «Comparar años» (`Switch` dentro de un `<label>`).
  - Ventas: `useQuery({ queryKey: ["customer-item", { tipo, anio }], queryFn: () => getCustomerItemSales({ tipo, anio }), enabled: !compareMode })`.
  - Clasificación: `useQuery({ queryKey: MACRO_CATEGORIAS_KEY, queryFn: () => getMacroCategorias() })`, `mapa = mapaMacroCategorias(macro ?? [])`, `sinClasificacion = macro === undefined`. Esqueleto con `isLoading || sinClasificacion`; `ExportMenu` desactivado con `groups.length === 0 || sinClasificacion`.
  - Fila de cabecera por cliente con `<Link href={customerHref(g.customer)}>` y los 4 totales; fila TOTAL `TOTAL ({groups.length} clientes)`.
- `src/lib/customer-item.ts`: `BUCKETS`, `BUCKET_LABELS`, `MACRO_CATEGORIAS_KEY`, `mapaMacroCategorias`, `bucketForCategory` (sin entrada → `"equipos"`), `filterRows`, `groupByCustomer` (clientes con `localeCompare`, artículos por importe desc), `computeGrandTotals(groups: CustomerGroup[])`, `customerItemToCsv(groups, grand, mapa)` (separador `;`, importes con `toFixed(2)`), `customerItemToExcel(groups, grand, mapa)` (hoja `"Cliente×Artículo"`). `emptyTotals` y `csvCell` son **privadas**.
- `src/lib/customer-item-compare.ts`: `buildCustomerItemCompare(rowsA, rowsB)` ordena los artículos por `importeA` desc, luego `importeB` desc, luego nombre; los clientes con `localeCompare`; `deltaPct` con `computeDelta` de `src/lib/compare.ts` (`(a - b) / b`, `null` si `b === 0`).
- `src/components/cliente-articulo/customer-item-compare-table.tsx`: dos consultas con la misma clave `["customer-item", { tipo, anio }]`, su propio `SearchInput`, esqueleto mientras cargan, `DeltaCell`.
- `CustomerItemRow` (`src/types/database.ts:281`): `customer`, `sku`, `marca`, `nombre`, `categoria: string | null`, `cantidad`, `importe`. `Bucket` está en `src/types/database.ts:55`.
- `ExportMenu` (`src/components/common/export-menu.tsx`): props `onCopy`, `onCsv`, `onXlsx`, `disabled`. Excel con `downloadXlsx` y `copySheetToClipboard` de `src/lib/excel-client.ts`; tipos `ExcelSheet`/`ExcelRow` en `src/lib/excel-types.ts`.
- Listas de rutas con `/cliente-articulo`:
  - `src/components/layout/sidebar.tsx:27` (`"Cliente × Artículo"`, icono `ClipboardList`).
  - `src/components/layout/mobile-nav.tsx:22` (`"Cliente × Art."`).
  - `src/components/common/command-palette.tsx:23` (`PAGES`), **no citada en la spec**.
  - `src/actions/category-actions.ts:212` (`revalidatePath("/cliente-articulo")` al guardar las macro-categorías), **no citada en la spec**.
  - `e2e/specs/navigation.spec.ts` (`ROUTES`, con el `<h1>` exacto de cada página).
- `src/middleware.ts` no tiene lista de rutas (el `matcher` cubre todo salvo estáticos y `api/auth`): **no hay que tocarlo**.
- vitest corre en entorno `node`: no hay tests de componentes. La página se cubre con E2E.
- Semilla E2E: `CUSTOMERS[(month - 1) % 5]`, así que «Alfa Industrial» tiene la factura de junio del año en curso (las facturas solo existen en meses pares) con los cinco artículos: Aguas (2), Aire (1) y Suelos (2). `seed-app.mjs` deja Aguas en Mano de obra, Aire en Consumibles y repuestos y Suelos sin marcar (Equipos) (`MACRO_SEED` de `e2e/constants.ts`). Operaciones queda a `$0`.
- `period-provider` arranca en `INVOICE` y el año en curso. `formatUSD` da `$0` para cero.
- Hoy ningún E2E comprueba los datos de `/cliente-articulo`; solo `navigation.spec.ts` carga la ruta.
- Playwright: viewport 1440×900 (la barra lateral `md:flex` es visible), `workers: 1`.

## Decisiones del plan que la spec no fijaba

1. **Selectores de año compartidos.** Se extrae `YearCompareControls` (`src/components/common/year-compare-controls.tsx`) con el selector de año, los de año A / año B y el interruptor «Comparar años». La página de artículos pasa a usarlo sin cambiar su DOM ni su comportamiento. Es el único cambio en esa página.
2. **`computeGrandTotals`** acepta `readonly { totals: Record<Bucket, number> }[]`. `CustomerGroup[]` sigue cumpliéndolo: los tests existentes no cambian.
3. **`emptyTotals` y `csvCell`** pasan a exportarse desde `customer-item.ts` para no copiarlas.
4. **Las exportaciones por categoría no reciben el mapa**: cada `CustomerCategoryRow` ya lleva su `bucket`, calculado una sola vez al agrupar.
5. **«Sin categoría»** es la constante `SIN_CATEGORIA` de `customer-category.ts`, compartida por la página, la tabla de comparación y las exportaciones.
6. **Rutas extra.** Además de lo que pide la spec, `/cliente-categoria` se añade a la paleta de comandos y al `revalidatePath` de `saveMacroCategorias`, igual que `/cliente-articulo`.
7. **Menú móvil.** La spec pide la etiqueta «Cliente × Categoría» en los dos menús; se usa tal cual también en el móvil, aunque la de artículos está abreviada («Cliente × Art.»).
8. **Icono.** `ListTree` de lucide-react (un cliente que se abre en categorías).

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/customer-item.ts` | Modificar | Exportar `emptyTotals` y `csvCell`; generalizar el tipo de `computeGrandTotals`. |
| `src/lib/customer-category.ts` | Crear | `CustomerCategoryRow`, `CustomerCategoryGroup`, `SIN_CATEGORIA`, `groupByCustomerCategory`, `filterCategoryRows`, `customerCategoryToCsv`, `customerCategoryToExcel`. |
| `src/lib/__tests__/customer-category.test.ts` | Crear | Tests de agrupación, coherencia con `groupByCustomer`, filtro y exportación. |
| `src/lib/customer-category-compare.ts` | Crear | `buildCustomerCategoryCompare` y sus tipos. |
| `src/lib/__tests__/customer-category-compare.test.ts` | Crear | Tests de la comparación. |
| `src/components/common/year-compare-controls.tsx` | Crear | Selectores de año y «Comparar años» comunes. |
| `src/app/(dashboard)/cliente-articulo/page.tsx` | Modificar | Usar `YearCompareControls`. |
| `src/components/cliente-categoria/customer-category-compare-table.tsx` | Crear | Tabla del modo «Comparar años». |
| `src/app/(dashboard)/cliente-categoria/page.tsx` | Crear | La página nueva. |
| `e2e/specs/cliente-categoria.spec.ts` | Crear | E2E de la sección. |
| `e2e/specs/navigation.spec.ts` | Modificar | Ruta nueva en `ROUTES`. |
| `src/components/layout/sidebar.tsx` | Modificar | Entrada «Cliente × Categoría». |
| `src/components/layout/mobile-nav.tsx` | Modificar | Entrada «Cliente × Categoría». |
| `src/components/common/command-palette.tsx` | Modificar | Entrada «Cliente × Categoría». |
| `src/actions/category-actions.ts` | Modificar | `revalidatePath("/cliente-categoria")`. |

---

## Task 1: Agrupar las ventas por cliente y categoría

**Files:**
- Modify: `src/lib/customer-item.ts`
- Create: `src/lib/customer-category.ts`
- Create: `src/lib/__tests__/customer-category.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/customer-category.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { filterCategoryRows, groupByCustomerCategory } from "@/lib/customer-category";
import { computeGrandTotals, groupByCustomer, mapaMacroCategorias } from "@/lib/customer-item";
import type { Bucket, CustomerItemRow, MacroCategoria } from "@/types/database";

const cat = (name: string, macro_categoria: Bucket | null): MacroCategoria =>
  ({ id: name, name, is_active: true, macro_categoria });

// Clasificación de prueba: EDM180 Series no está marcada y cuenta como Equipos.
const mapa = mapaMacroCategorias([
  cat("CAL PM", "mano_obra"),
  cat("C&R AP Series", "cr"),
  cat("Operación de Redes", "operacion"),
]);

const rows: CustomerItemRow[] = [
  { customer: "Beta", sku: "A", marca: "Horiba Ltd.", nombre: "Scrubber", categoria: "C&R AP Series", cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "B", marca: "Ambientalia", nombre: "Calibración Enviro", categoria: "CAL PM", cantidad: 2, importe: 300 },
  { customer: "Beta", sku: "E", marca: "Ambientalia", nombre: "Calibración NOx", categoria: "CAL PM", cantidad: 3, importe: 150 },
  { customer: "Alpha", sku: "C", marca: "Grimm", nombre: "EDM 180C", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
  { customer: "Alpha", sku: "D", marca: "Ambientalia", nombre: "Mantenimiento", categoria: "Operación de Redes", cantidad: 1, importe: 50 },
  { customer: "Alpha", sku: "F", marca: null, nombre: "Flete", categoria: null, cantidad: 2, importe: 20 },
  { customer: "Alpha", sku: "G", marca: null, nombre: "Embalaje", categoria: null, cantidad: 1, importe: 5 },
];

describe("groupByCustomerCategory", () => {
  it("suma cantidad e importe de los articulos de la misma categoria en una fila", () => {
    const beta = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Beta")!;
    expect(beta.categorias.filter((c) => c.categoria === "CAL PM")).toEqual([
      { categoria: "CAL PM", bucket: "mano_obra", cantidad: 5, importe: 450 },
    ]);
  });

  it("las ventas sin categoria forman una sola fila", () => {
    const alpha = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Alpha")!;
    expect(alpha.categorias.filter((c) => c.categoria === null)).toEqual([
      { categoria: null, bucket: "equipos", cantidad: 3, importe: 25 },
    ]);
  });

  it("la macro-categoria sale del mapa y sin entrada cuenta como Equipos", () => {
    const alpha = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Alpha")!;
    const bucketDe = (nombre: string | null) => alpha.categorias.find((c) => c.categoria === nombre)!.bucket;
    expect(bucketDe("Operación de Redes")).toBe("operacion");
    expect(bucketDe("EDM180 Series")).toBe("equipos");

    // Con el mapa vacío todo cae en Equipos.
    for (const g of groupByCustomerCategory(rows, new Map())) {
      expect(g.categorias.every((c) => c.bucket === "equipos")).toBe(true);
    }
  });

  // Las dos secciones leen las mismas filas: si un cliente sumara distinto aquí que en
  // «Cliente × Artículo», una de las dos pantallas estaría mintiendo.
  it("los totales de cada cliente coinciden con los de groupByCustomer", () => {
    for (const m of [mapa, new Map<string, Bucket>()]) {
      const porCategoria = groupByCustomerCategory(rows, m);
      const porArticulo = groupByCustomer(rows, m);
      expect(porCategoria.map((g) => g.customer)).toEqual(porArticulo.map((g) => g.customer));
      expect(porCategoria.map((g) => g.totals)).toEqual(porArticulo.map((g) => g.totals));
      expect(computeGrandTotals(porCategoria)).toEqual(computeGrandTotals(porArticulo));
    }
  });

  it("ordena los clientes alfabeticamente y las categorias por importe desc, con sus totales", () => {
    const g = groupByCustomerCategory(rows, mapa);
    expect(g.map((x) => x.customer)).toEqual(["Alpha", "Beta"]);
    expect(g[0].categorias.map((c) => c.categoria)).toEqual(["EDM180 Series", "Operación de Redes", null]);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 525, operacion: 50 });
    expect(g[1].categorias.map((c) => c.categoria)).toEqual(["CAL PM", "C&R AP Series"]);
    expect(g[1].totals).toEqual({ mano_obra: 450, cr: 100, equipos: 0, operacion: 0 });
  });
});

describe("computeGrandTotals con grupos por categoria", () => {
  it("suma los 4 buckets", () => {
    expect(computeGrandTotals(groupByCustomerCategory(rows, mapa))).toEqual({
      mano_obra: 450, cr: 100, equipos: 525, operacion: 50,
    });
  });
});

describe("filterCategoryRows", () => {
  it("filtra por cliente o por categoria, sin distinguir mayusculas", () => {
    expect(filterCategoryRows(rows, "alpha").length).toBe(4);
    expect(filterCategoryRows(rows, "  cal pm ").map((r) => r.sku)).toEqual(["B", "E"]);
    expect(filterCategoryRows(rows, "").length).toBe(7);
  });

  it("no busca por nombre de articulo ni por SKU", () => {
    expect(filterCategoryRows(rows, "scrubber")).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/__tests__/customer-category.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/customer-category"`.

- [ ] **Step 3: Implementación mínima**

En `src/lib/customer-item.ts`, con Edit, exportar `emptyTotals`. Sustituir:

```ts
function emptyTotals(): Record<Bucket, number> {
```

por:

```ts
// Exportada para que customer-category.ts parta de los mismos ceros sin copiarla.
export function emptyTotals(): Record<Bucket, number> {
```

Y generalizar `computeGrandTotals`. Sustituir:

```ts
export function computeGrandTotals(groups: CustomerGroup[]): Record<Bucket, number> {
```

por:

```ts
// Solo necesita los totales de cada grupo: así sirve para los grupos por artículo
// (CustomerGroup) y por categoría (CustomerCategoryGroup) sin duplicarla.
export function computeGrandTotals(groups: readonly { totals: Record<Bucket, number> }[]): Record<Bucket, number> {
```

Crear `src/lib/customer-category.ts` (y convertirlo a CRLF):

```ts
import type { Bucket, CustomerItemRow } from "@/types/database";
import { bucketForCategory, emptyTotals } from "@/lib/customer-item";

/** Texto de las ventas sin categoría en la tabla, la comparación y las exportaciones. */
export const SIN_CATEGORIA = "Sin categoría";

/** Ventas de un cliente en una categoría: la suma de todos sus artículos de esa categoría. */
export interface CustomerCategoryRow {
  categoria: string | null;
  bucket: Bucket;
  // Suma de unidades de artículos distintos: se muestra porque la sección de artículos
  // también la tiene, aunque mezcle unidades.
  cantidad: number;
  importe: number;
}

export interface CustomerCategoryGroup {
  customer: string;
  categorias: CustomerCategoryRow[];
  totals: Record<Bucket, number>;
}

/**
 * Filtra por cliente o por categoría. Trabaja sobre las filas por artículo, antes de
 * agrupar, igual que filterRows: así los totales del cliente son los de lo filtrado.
 */
export function filterCategoryRows(rows: CustomerItemRow[], search: string): CustomerItemRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.customer.toLowerCase().includes(q) || (r.categoria ?? "").toLowerCase().includes(q)
  );
}

/**
 * Agrupa las ventas por cliente y, dentro de cada cliente, por categoría.
 * - La categoría se agrupa por su nombre tal cual llega del hub; las ventas sin
 *   categoría (null) forman una sola fila, porque un Map distingue null como clave.
 * - Los totales del cliente suman cada fila en el mismo orden que groupByCustomer, para
 *   que las dos secciones den exactamente las mismas cifras, sin diferencias de redondeo.
 * - Clientes por orden alfabético y categorías por importe descendente, como
 *   groupByCustomer con los artículos.
 */
export function groupByCustomerCategory(
  rows: CustomerItemRow[],
  mapa: Map<string, Bucket>
): CustomerCategoryGroup[] {
  const porCliente = new Map<
    string,
    { totals: Record<Bucket, number>; categorias: Map<string | null, CustomerCategoryRow> }
  >();
  for (const r of rows) {
    let g = porCliente.get(r.customer);
    if (!g) {
      g = { totals: emptyTotals(), categorias: new Map() };
      porCliente.set(r.customer, g);
    }
    let c = g.categorias.get(r.categoria);
    if (!c) {
      c = { categoria: r.categoria, bucket: bucketForCategory(r.categoria, mapa), cantidad: 0, importe: 0 };
      g.categorias.set(r.categoria, c);
    }
    c.cantidad += r.cantidad;
    c.importe += r.importe;
    g.totals[c.bucket] += r.importe;
  }
  const groups: CustomerCategoryGroup[] = [...porCliente].map(([customer, g]) => ({
    customer,
    categorias: [...g.categorias.values()].sort((a, b) => b.importe - a.importe),
    totals: g.totals,
  }));
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/__tests__/customer-category.test.ts src/lib/__tests__/customer-item.test.ts`
Expected: PASS (los 8 tests nuevos y todos los de `customer-item.test.ts`, que no cambian).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customer-item.ts src/lib/customer-category.ts src/lib/__tests__/customer-category.test.ts
git commit -m "feat(cliente-categoria): agrupar ventas por cliente y categoria"
```

---

## Task 2: Exportación y comparación de años por categoría

**Files:**
- Modify: `src/lib/customer-item.ts`
- Modify: `src/lib/customer-category.ts`
- Modify: `src/lib/__tests__/customer-category.test.ts`
- Create: `src/lib/customer-category-compare.ts`
- Create: `src/lib/__tests__/customer-category-compare.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/customer-category.test.ts`, con Edit, sustituir la primera línea de import:

```ts
import { filterCategoryRows, groupByCustomerCategory } from "@/lib/customer-category";
```

por:

```ts
import {
  customerCategoryToCsv,
  customerCategoryToExcel,
  filterCategoryRows,
  groupByCustomerCategory,
} from "@/lib/customer-category";
```

Y añadir al final del fichero:

```ts
describe("customerCategoryToCsv", () => {
  it("cabecera, fila por cliente, filas de categoria y TOTAL", () => {
    const groups = groupByCustomerCategory(rows, mapa);
    const lines = customerCategoryToCsv(groups, computeGrandTotals(groups)).split("\n");
    expect(lines).toEqual([
      "Categoría;Cantidad;Mano de obra;Consumibles y repuestos;Equipos;Operaciones",
      "Alpha;;0.00;0.00;525.00;50.00",
      "EDM180 Series;1;;;500.00;",
      "Operación de Redes;1;;;;50.00",
      "Sin categoría;3;;;25.00;",
      "Beta;;450.00;100.00;0.00;0.00",
      "CAL PM;5;450.00;;;",
      "C&R AP Series;1;;100.00;;",
      "TOTAL;;450.00;100.00;525.00;50.00",
    ]);
  });
});

describe("customerCategoryToExcel", () => {
  it("columnas, cliente en negrita, importe en la columna de su macro-categoria y TOTAL en negrita", () => {
    const groups = groupByCustomerCategory(rows, mapa);
    const sheet = customerCategoryToExcel(groups, computeGrandTotals(groups));
    expect(sheet.name).toBe("Cliente×Categoría");
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Categoría", "Cantidad", "Mano de obra", "Consumibles y repuestos", "Equipos", "Operaciones",
    ]);
    expect(sheet.rows).toHaveLength(8);
    expect(sheet.rows[0]).toEqual({ cells: ["Alpha", "", 0, 0, 525, 50], bold: true });
    expect(sheet.rows[1].cells).toEqual(["EDM180 Series", 1, null, null, 500, null]);
    expect(sheet.rows[3].cells).toEqual(["Sin categoría", 3, null, null, 25, null]);
    expect(sheet.rows[4]).toEqual({ cells: ["Beta", "", 450, 100, 0, 0], bold: true });
    expect(sheet.rows[5].cells).toEqual(["CAL PM", 5, 450, null, null, null]);
    expect(sheet.rows[7]).toEqual({ cells: ["TOTAL", "", 450, 100, 525, 50], bold: true });
  });
});
```

Crear `src/lib/__tests__/customer-category-compare.test.ts` (y convertirlo a CRLF):

```ts
import { describe, it, expect } from "vitest";
import { buildCustomerCategoryCompare } from "@/lib/customer-category-compare";
import type { CustomerItemRow } from "@/types/database";

const fila = (customer: string, sku: string, categoria: string | null, importe: number): CustomerItemRow =>
  ({ customer, sku, marca: null, nombre: `art ${sku}`, categoria, cantidad: 1, importe });

const A: CustomerItemRow[] = [
  fila("Acme", "1", "Aguas", 120),
  fila("Acme", "2", "Aguas", 30),
  fila("Acme", "3", null, 100),
  fila("Beta", "9", "Aire", 300),
];
const B: CustomerItemRow[] = [
  fila("Acme", "1", "Aguas", 100),
  fila("Acme", "4", "Suelos", 50),
  fila("Gamma", "7", "Aire", 40),
];

describe("buildCustomerCategoryCompare", () => {
  it("una categoria que solo aparece en un anio sale con 0 en el otro, en el orden establecido", () => {
    const acme = buildCustomerCategoryCompare(A, B).find((g) => g.customer === "Acme")!;
    // Por importe A desc; con importe A empatado, por importe B desc.
    expect(acme.categorias).toEqual([
      { categoria: "Aguas", importeA: 150, importeB: 100, deltaPct: 0.5 },
      { categoria: null, importeA: 100, importeB: 0, deltaPct: null },
      { categoria: "Suelos", importeA: 0, importeB: 50, deltaPct: -1 },
    ]);
  });

  it("totales por anio de cada cliente, incluidos los que solo tienen ventas en uno", () => {
    const groups = buildCustomerCategoryCompare(A, B);
    expect(groups.map((g) => g.customer)).toEqual(["Acme", "Beta", "Gamma"]);
    const [acme, beta, gamma] = groups;
    expect(acme.totalA).toBe(250);
    expect(acme.totalB).toBe(150);
    expect(acme.deltaPct).toBeCloseTo(2 / 3);
    expect(beta).toMatchObject({ totalA: 300, totalB: 0, deltaPct: null });
    expect(gamma).toMatchObject({ totalA: 0, totalB: 40, deltaPct: -1 });
    expect(gamma.categorias).toEqual([{ categoria: "Aire", importeA: 0, importeB: 40, deltaPct: -1 }]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/__tests__/customer-category.test.ts src/lib/__tests__/customer-category-compare.test.ts`
Expected: FAIL: `customerCategoryToCsv is not a function` (o equivalente de import) y `Failed to resolve import "@/lib/customer-category-compare"`.

- [ ] **Step 3: Implementación mínima**

En `src/lib/customer-item.ts`, con Edit, sustituir:

```ts
function csvCell(v: string | number): string {
```

por:

```ts
// Exportada para que la exportación por categoría escape las celdas igual que esta.
export function csvCell(v: string | number): string {
```

En `src/lib/customer-category.ts`, con Edit, sustituir las dos líneas de import:

```ts
import type { Bucket, CustomerItemRow } from "@/types/database";
import { bucketForCategory, emptyTotals } from "@/lib/customer-item";
```

por:

```ts
import type { Bucket, CustomerItemRow } from "@/types/database";
import type { ExcelRow, ExcelSheet } from "@/lib/excel-types";
import { BUCKETS, BUCKET_LABELS, bucketForCategory, csvCell, emptyTotals } from "@/lib/customer-item";
```

Y añadir al final de `src/lib/customer-category.ts`:

```ts
/**
 * CSV con el mismo formato que customerItemToCsv (separador «;», importes con dos
 * decimales, cabeceras de BUCKET_LABELS), para que quien ya abre esa exportación en
 * Excel reconozca esta. El importe de cada categoría va solo en la columna de su
 * macro-categoría.
 */
export function customerCategoryToCsv(groups: CustomerCategoryGroup[], grand: Record<Bucket, number>): string {
  const header = ["Categoría", "Cantidad", ...BUCKETS.map((b) => BUCKET_LABELS[b])];
  const lines: (string | number)[][] = [header];
  for (const g of groups) {
    lines.push([g.customer, "", ...BUCKETS.map((b) => g.totals[b].toFixed(2))]);
    for (const c of g.categorias) {
      lines.push([
        c.categoria ?? SIN_CATEGORIA,
        c.cantidad,
        ...BUCKETS.map((b) => (b === c.bucket ? c.importe.toFixed(2) : "")),
      ]);
    }
  }
  lines.push(["TOTAL", "", ...BUCKETS.map((b) => grand[b].toFixed(2))]);
  return lines.map((row) => row.map(csvCell).join(";")).join("\n");
}

/** Hoja de Excel (y de «Copiar tabla») con las mismas filas que el CSV. */
export function customerCategoryToExcel(groups: CustomerCategoryGroup[], grand: Record<Bucket, number>): ExcelSheet {
  const rows: ExcelRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.customer, "", ...BUCKETS.map((b) => g.totals[b])], bold: true });
    for (const c of g.categorias) {
      rows.push({
        cells: [c.categoria ?? SIN_CATEGORIA, c.cantidad, ...BUCKETS.map((b) => (b === c.bucket ? c.importe : null))],
      });
    }
  }
  rows.push({ cells: ["TOTAL", "", ...BUCKETS.map((b) => grand[b])], bold: true });
  return {
    name: "Cliente×Categoría",
    columns: [
      { header: "Categoría", width: 30 },
      { header: "Cantidad", width: 12, numFmt: "#,##0" },
      ...BUCKETS.map((b) => ({ header: BUCKET_LABELS[b], width: 16, numFmt: '"$"#,##0.00' })),
    ],
    rows,
  };
}
```

Crear `src/lib/customer-category-compare.ts` (y convertirlo a CRLF):

```ts
import type { CustomerItemRow } from "@/types/database";
import { computeDelta } from "@/lib/compare";

export interface CustomerCategoryComparePoint {
  categoria: string | null;
  importeA: number;
  importeB: number;
  deltaPct: number | null;
}

export interface CustomerCategoryCompareGroup {
  customer: string;
  categorias: CustomerCategoryComparePoint[];
  totalA: number;
  totalB: number;
  deltaPct: number | null;
}

/**
 * Compara dos años por (cliente, categoría). Entran las categorías y los clientes que
 * solo tienen ventas en uno de los dos años, con 0 en el otro: si no, una categoría que
 * se dejó de comprar desaparecería en lugar de mostrar la caída. Mismo orden que
 * buildCustomerItemCompare: importe A desc, luego importe B desc, luego nombre.
 */
export function buildCustomerCategoryCompare(
  rowsA: CustomerItemRow[],
  rowsB: CustomerItemRow[]
): CustomerCategoryCompareGroup[] {
  const byCustomer = new Map<string, Map<string | null, CustomerCategoryComparePoint>>();
  const ensure = (r: CustomerItemRow): CustomerCategoryComparePoint => {
    let categorias = byCustomer.get(r.customer);
    if (!categorias) {
      categorias = new Map();
      byCustomer.set(r.customer, categorias);
    }
    let p = categorias.get(r.categoria);
    if (!p) {
      p = { categoria: r.categoria, importeA: 0, importeB: 0, deltaPct: null };
      categorias.set(r.categoria, p);
    }
    return p;
  };
  for (const r of rowsA) ensure(r).importeA += r.importe;
  for (const r of rowsB) ensure(r).importeB += r.importe;

  const groups: CustomerCategoryCompareGroup[] = [];
  for (const [customer, categoriasMap] of byCustomer) {
    const categorias = [...categoriasMap.values()];
    for (const c of categorias) c.deltaPct = computeDelta(c.importeA, c.importeB).deltaPct;
    categorias.sort(
      (a, b) =>
        b.importeA - a.importeA ||
        b.importeB - a.importeB ||
        (a.categoria ?? "").localeCompare(b.categoria ?? "")
    );
    const totalA = categorias.reduce((s, c) => s + c.importeA, 0);
    const totalB = categorias.reduce((s, c) => s + c.importeB, 0);
    groups.push({ customer, categorias, totalA, totalB, deltaPct: computeDelta(totalA, totalB).deltaPct });
  }
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/__tests__/customer-category.test.ts src/lib/__tests__/customer-category-compare.test.ts src/lib/__tests__/customer-item.test.ts`
Expected: PASS (12 tests nuevos entre los dos ficheros nuevos, más los de `customer-item.test.ts`).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customer-item.ts src/lib/customer-category.ts src/lib/__tests__/customer-category.test.ts src/lib/customer-category-compare.ts src/lib/__tests__/customer-category-compare.test.ts
git commit -m "feat(cliente-categoria): exportacion y comparacion de anios por categoria"
```

---

## Task 3: Página «Ventas por cliente × categoría»

**Files:**
- Create: `e2e/specs/cliente-categoria.spec.ts`
- Modify: `e2e/specs/navigation.spec.ts`
- Create: `src/components/common/year-compare-controls.tsx`
- Modify: `src/app/(dashboard)/cliente-articulo/page.tsx`
- Create: `src/components/cliente-categoria/customer-category-compare-table.tsx`
- Create: `src/app/(dashboard)/cliente-categoria/page.tsx`

- [ ] **Step 1: Escribir el E2E que falla**

Crear `e2e/specs/cliente-categoria.spec.ts` (y convertirlo a CRLF):

```ts
import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, MACRO_SEED } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TITULO = "Ventas por cliente × categoría";

// Cliente inventado de e2e/db/seed-hub.mjs. En el año en curso tiene la factura de
// junio con los cinco artículos, así que sale con las tres categorías sembradas.
const CLIENTE = "Alfa Industrial";

/** Importes de las 4 macro-categorías en la fila de cabecera del cliente. */
async function totalesDelCliente(page: Page): Promise<string[]> {
  // El enlace solo aparece cuando han llegado las ventas y la clasificación: antes, la
  // tabla es un esqueleto.
  const enlace = page.getByRole("link", { name: CLIENTE, exact: true });
  await expect(enlace).toBeVisible();
  const celdas = await page.getByRole("row").filter({ has: enlace }).getByRole("cell").allTextContents();
  // La primera celda es el nombre; su colSpan cambia entre las dos páginas, las 4
  // últimas son siempre las macro-categorías.
  return celdas.slice(-4);
}

test("el total de un cliente coincide con el de la seccion de articulos", async ({ page }) => {
  // Dos páginas completas: más que el minuto por defecto en la máquina local.
  test.setTimeout(120_000);

  await page.goto("/cliente-articulo");
  await expect(page.getByRole("heading", { level: 1, name: "Ventas por cliente × artículo" })).toBeVisible();
  const enArticulos = await totalesDelCliente(page);

  await page.goto("/cliente-categoria");
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
  const enCategorias = await totalesDelCliente(page);

  expect(enCategorias).toEqual(enArticulos);
  // Que no sea una igualdad trivial: con la clasificación sembrada hay importe en Mano
  // de obra (Aguas), Consumibles y repuestos (Aire) y Equipos (Suelos), y nada en
  // Operaciones.
  expect(enCategorias.slice(0, 3).every((t) => t !== "$0")).toBe(true);
  expect(enCategorias[3]).toBe("$0");

  // Una fila por categoría sembrada.
  for (const categoria of [MACRO_SEED.mano_obra, MACRO_SEED.cr, MACRO_SEED.sinMarcar]) {
    await expect(page.getByRole("cell", { name: categoria, exact: true }).first()).toBeVisible();
  }
});

test("comparar anios muestra las columnas de los dos anios", async ({ page }) => {
  await page.goto("/cliente-categoria");
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
  // Espera a los datos antes de pulsar: así la página ya está hidratada y el clic no se
  // pierde.
  await expect(page.getByRole("link", { name: CLIENTE, exact: true })).toBeVisible();

  await page.getByRole("switch").click();

  const anio = new Date().getFullYear();
  await expect(page.getByRole("columnheader", { name: "Categoría", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: `Importe ${anio}`, exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: `Importe ${anio - 1}`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: CLIENTE, exact: true })).toBeVisible();
});
```

En `e2e/specs/navigation.spec.ts`, con Edit, sustituir:

```ts
  { path: "/cliente-articulo", heading: "Ventas por cliente × artículo" },
```

por:

```ts
  { path: "/cliente-articulo", heading: "Ventas por cliente × artículo" },
  { path: "/cliente-categoria", heading: "Ventas por cliente × categoría" },
```

- [ ] **Step 2: Ejecutar y ver que falla**

Comprobar que el puerto 3100 está libre (`netstat -ano | grep ":3100"`) y que Docker responde (`docker info`).

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/cliente-categoria.spec.ts e2e/specs/navigation.spec.ts`
Expected: FAIL en los dos tests de `cliente-categoria.spec.ts` y en `/cliente-categoria carga sin errores`: no aparece el `<h1>` «Ventas por cliente × categoría» (la ruta da 404). El resto de `navigation.spec.ts` pasa.

- [ ] **Step 3: Extraer los selectores de año**

Crear `src/components/common/year-compare-controls.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Primer año que ofrecen los selectores: 2020 está incompleto en el hub.
const FIRST_YEAR = 2021;

/**
 * Selector de año o, en modo comparación, de año A y año B, más el interruptor
 * «Comparar años». Lo comparten las secciones por cliente × artículo y por cliente ×
 * categoría. Devuelve un fragmento para quedar dentro de la fila de controles de cada
 * página, junto a su conmutador OV/FAC.
 */
export function YearCompareControls({
  anio,
  onAnioChange,
  compareMode,
  onCompareModeChange,
  yearA,
  onYearAChange,
  yearB,
  onYearBChange,
}: {
  anio: number;
  onAnioChange: (anio: number) => void;
  compareMode: boolean;
  onCompareModeChange: (compareMode: boolean) => void;
  yearA: number;
  onYearAChange: (anio: number) => void;
  yearB: number;
  onYearBChange: (anio: number) => void;
}) {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  return (
    <>
      {!compareMode ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Año</label>
          <Select value={String(anio)} onValueChange={(v) => { if (v) onAnioChange(Number(v)); }}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Año A</label>
            <Select value={String(yearA)} onValueChange={(v) => { if (v) onYearAChange(Number(v)); }}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <span className="self-end pb-2 text-muted-foreground">vs</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Año B</label>
            <Select value={String(yearB)} onValueChange={(v) => { if (v) onYearBChange(Number(v)); }}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 self-center text-sm pb-1">
        <Switch checked={compareMode} onCheckedChange={onCompareModeChange} /> Comparar años
      </label>
    </>
  );
}
```

En `src/app/(dashboard)/cliente-articulo/page.tsx`, con Edit (tres sustituciones):

1. Sustituir:

```tsx
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
```

por:

```tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
```

2. Sustituir:

```tsx
import { CustomerItemCompareTable } from "@/components/cliente-articulo/customer-item-compare-table";

const FIRST_YEAR = 2021;

export default function ClienteArticuloPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
```

por:

```tsx
import { CustomerItemCompareTable } from "@/components/cliente-articulo/customer-item-compare-table";
import { YearCompareControls } from "@/components/common/year-compare-controls";

export default function ClienteArticuloPage() {
  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
```

3. Sustituir el bloque de selectores, desde `{!compareMode ? (` hasta el `</label>` del interruptor:

```tsx
        {!compareMode ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Año</label>
            <Select value={String(anio)} onValueChange={(v) => { if (v) setAnio(Number(v)); }}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Año A</label>
              <Select value={String(yearA)} onValueChange={(v) => { if (v) setYearA(Number(v)); }}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <span className="self-end pb-2 text-muted-foreground">vs</span>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Año B</label>
              <Select value={String(yearB)} onValueChange={(v) => { if (v) setYearB(Number(v)); }}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>
        )}
        <label className="flex items-center gap-2 self-center text-sm pb-1">
          <Switch checked={compareMode} onCheckedChange={setCompareMode} /> Comparar años
        </label>
```

por:

```tsx
        <YearCompareControls
          anio={anio}
          onAnioChange={setAnio}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          yearA={yearA}
          onYearAChange={setYearA}
          yearB={yearB}
          onYearBChange={setYearB}
        />
```

`useMemo` sigue importado: lo usan `mapa`, `rows`, `groups` y `grand`.

- [ ] **Step 4: Tabla de comparación**

Crear `src/components/cliente-categoria/customer-category-compare-table.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { SIN_CATEGORIA, filterCategoryRows } from "@/lib/customer-category";
import { buildCustomerCategoryCompare } from "@/lib/customer-category-compare";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { DeltaCell } from "@/components/common/delta-cell";
import { SearchInput } from "@/components/common/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";

export function CustomerCategoryCompareTable({ tipo, yearA, yearB }: { tipo: "SALES_ORDER" | "INVOICE"; yearA: number; yearB: number }) {
  const [search, setSearch] = useState("");

  // Misma clave que la sección de artículos: si ya se vieron esos años allí, no se
  // vuelven a pedir al hub.
  const qA = useQuery({ queryKey: ["customer-item", { tipo, anio: yearA }], queryFn: () => getCustomerItemSales({ tipo, anio: yearA }) });
  const qB = useQuery({ queryKey: ["customer-item", { tipo, anio: yearB }], queryFn: () => getCustomerItemSales({ tipo, anio: yearB }) });
  const isLoading = qA.isLoading || qB.isLoading;

  const groups = useMemo(
    () => buildCustomerCategoryCompare(filterCategoryRows(qA.data ?? [], search), filterCategoryRows(qB.data ?? [], search)),
    [qA.data, qB.data, search]
  );
  const grand = useMemo(() => {
    const totalA = groups.reduce((s, g) => s + g.totalA, 0);
    const totalB = groups.reduce((s, g) => s + g.totalB, 0);
    return { totalA, totalB };
  }, [groups]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o categoría…" />
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Categoría</TableHead>
                <TableHead className="text-right">Importe {yearA}</TableHead>
                <TableHead className="text-right">Importe {yearB}</TableHead>
                <TableHead className="text-right">Δ%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}><EmptyState message="Sin ventas en los años seleccionados." /></TableCell>
                </TableRow>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.customer}>
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>
                          <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalA)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalB)}</TableCell>
                        <TableCell className="text-right tabular-nums"><DeltaCell a={g.totalA} b={g.totalB} /></TableCell>
                      </TableRow>
                      {g.categorias.map((c) => (
                        // JSON.stringify distingue null de una categoría llamada "null" o
                        // vacía: la clave es única dentro del cliente.
                        <TableRow key={JSON.stringify(c.categoria)}>
                          <TableCell className="text-muted-foreground">{c.categoria ?? SIN_CATEGORIA}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(c.importeA)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(c.importeB)}</TableCell>
                          <TableCell className="text-right tabular-nums"><DeltaCell a={c.importeA} b={c.importeB} /></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell>TOTAL ({groups.length} clientes)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.totalA)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.totalB)}</TableCell>
                    <TableCell className="text-right tabular-nums"><DeltaCell a={grand.totalA} b={grand.totalB} /></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: La página**

Crear `src/app/(dashboard)/cliente-categoria/page.tsx` (y convertirlo a CRLF):

```tsx
"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { customerHref } from "@/lib/customer-detail";
import type { CustomerItemRow } from "@/types/database";
import { usePeriod } from "@/components/providers/period-provider";
import { formatUSD } from "@/lib/constants";
import {
  BUCKET_LABELS,
  MACRO_CATEGORIAS_KEY,
  computeGrandTotals,
  mapaMacroCategorias,
} from "@/lib/customer-item";
import {
  SIN_CATEGORIA,
  customerCategoryToCsv,
  customerCategoryToExcel,
  filterCategoryRows,
  groupByCustomerCategory,
} from "@/lib/customer-category";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { SearchInput } from "@/components/common/search-input";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/empty-state";
import { YearCompareControls } from "@/components/common/year-compare-controls";
import { downloadXlsx, copySheetToClipboard } from "@/lib/excel-client";
import { CustomerCategoryCompareTable } from "@/components/cliente-categoria/customer-category-compare-table";

export default function ClienteCategoriaPage() {
  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [yearA, setYearA] = useState(anio);
  const [yearB, setYearB] = useState(anio - 1);

  // Misma lectura y misma clave que /cliente-articulo: las dos secciones comparten la
  // caché y agregan las mismas filas, así que sus cifras cuadran por construcción.
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo, anio }],
    queryFn: () => getCustomerItemSales({ tipo, anio }),
    enabled: !compareMode,
  });

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
  const groups = useMemo(
    () => groupByCustomerCategory(filterCategoryRows(rows, search), mapa),
    [rows, search, mapa]
  );
  const grand = useMemo(() => computeGrandTotals(groups), [groups]);

  const exportCsv = () => {
    const blob = new Blob([customerCategoryToCsv(groups, grand)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_cliente_categoria_${tipo}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const exportXlsx = () => {
    downloadXlsx([customerCategoryToExcel(groups, grand)], `ventas_cliente_categoria_${tipo}_${anio}.xlsx`);
    toast.success("Excel descargado");
  };

  const onCopy = async () => {
    try { await copySheetToClipboard(customerCategoryToExcel(groups, grand)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };

  const amount = (show: boolean, n: number) =>
    show ? <span className="tabular-nums">{formatUSD(n)}</span> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente × categoría</h1>
        <p className="text-sm text-muted-foreground">
          Por cliente, importe neto por categoría clasificado en 4 macro-categorías. En vivo de Zoho.
        </p>
      </div>

      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <RecordTypeToggle value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
        <YearCompareControls
          anio={anio}
          onAnioChange={setAnio}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          yearA={yearA}
          onYearAChange={setYearA}
          yearB={yearB}
          onYearBChange={setYearB}
        />
      </div>

      {compareMode ? (
        <CustomerCategoryCompareTable tipo={tipo as "SALES_ORDER" | "INVOICE"} yearA={yearA} yearB={yearB} />
      ) : (
        <>
          {/* Controles cliente */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o categoría…" />
            <ExportMenu onCopy={onCopy} onCsv={exportCsv} onXlsx={exportXlsx} disabled={groups.length === 0 || sinClasificacion} />
          </div>

          {isLoading || sinClasificacion ? (
            <Skeleton className="h-[500px] w-full rounded-xl" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Categoría</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.mano_obra}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.cr}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.equipos}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.operacion}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}><EmptyState message="Sin ventas en el año seleccionado." /></TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {groups.map((g) => (
                        <Fragment key={g.customer}>
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell colSpan={2}>
                              <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.mano_obra)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.cr)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.equipos)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.operacion)}</TableCell>
                          </TableRow>
                          {g.categorias.map((c) => (
                            // JSON.stringify distingue null de una categoría llamada "null" o
                            // vacía: la clave es única dentro del cliente.
                            <TableRow key={JSON.stringify(c.categoria)}>
                              <TableCell className="text-muted-foreground">{c.categoria ?? SIN_CATEGORIA}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.cantidad}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "mano_obra", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "cr", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "equipos", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "operacion", c.importe)}</TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                      <TableRow className="bg-muted/40 font-bold border-t-2">
                        <TableCell colSpan={2}>TOTAL ({groups.length} clientes)</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(grand.mano_obra)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(grand.cr)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(grand.equipos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(grand.operacion)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Comprobaciones estáticas**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: exactamente 10 warnings y 0 errores (ninguno en los ficheros tocados; si `cliente-articulo/page.tsx` avisa de un import sin usar, quitarlo).

- [ ] **Step 7: Ejecutar el E2E y ver que pasa**

Esperar al menos 60 s desde la ejecución del Step 2 y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/cliente-categoria.spec.ts e2e/specs/navigation.spec.ts`
Expected: PASS: los 2 tests de `cliente-categoria.spec.ts` y las 10 rutas de `navigation.spec.ts`, incluidas `/cliente-articulo` (con los selectores extraídos) y `/cliente-categoria`.

- [ ] **Step 8: Commit**

```bash
git add e2e/specs/cliente-categoria.spec.ts e2e/specs/navigation.spec.ts src/components/common/year-compare-controls.tsx "src/app/(dashboard)/cliente-articulo/page.tsx" src/components/cliente-categoria/customer-category-compare-table.tsx "src/app/(dashboard)/cliente-categoria/page.tsx"
git commit -m "feat(cliente-categoria): pagina de ventas por cliente x categoria"
```

---

## Task 4: Entrada en el menú, la paleta de comandos y la revalidación

**Files:**
- Modify: `e2e/specs/cliente-categoria.spec.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`
- Modify: `src/components/common/command-palette.tsx`
- Modify: `src/actions/category-actions.ts`

- [ ] **Step 1: Escribir el E2E que falla**

Añadir al final de `e2e/specs/cliente-categoria.spec.ts`:

```ts
test("la entrada del menu abre la seccion", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  // Con el viewport de escritorio solo está visible la barra lateral: el menú móvil
  // vive en un panel cerrado y la paleta no está abierta.
  await page.getByRole("link", { name: "Cliente × Categoría", exact: true }).click();

  await expect(page).toHaveURL(/\/cliente-categoria$/);
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Esperar al menos 60 s desde la última ejecución de Playwright y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/cliente-categoria.spec.ts`
Expected: FAIL en «la entrada del menu abre la seccion»: timeout esperando el enlace «Cliente × Categoría». Los otros dos tests pasan.

- [ ] **Step 3: Implementación mínima**

En `src/components/layout/sidebar.tsx`, con Edit, sustituir:

```tsx
  ClipboardList,
} from "lucide-react";
```

por:

```tsx
  ClipboardList,
  ListTree,
} from "lucide-react";
```

y sustituir:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
```

por:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
  { href: "/cliente-categoria", label: "Cliente × Categoría", icon: ListTree },
```

En `src/components/layout/mobile-nav.tsx`, con Edit, sustituir:

```tsx
  ClipboardList,
} from "lucide-react";
```

por:

```tsx
  ClipboardList,
  ListTree,
} from "lucide-react";
```

y sustituir:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Art.", icon: ClipboardList },
```

por:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Art.", icon: ClipboardList },
  { href: "/cliente-categoria", label: "Cliente × Categoría", icon: ListTree },
```

En `src/components/common/command-palette.tsx`, con Edit, sustituir:

```tsx
import { Home, BarChart3, Package, Users, ClipboardList, TrendingUp, FolderOpen, Settings } from "lucide-react";
```

por:

```tsx
import { Home, BarChart3, Package, Users, ClipboardList, ListTree, TrendingUp, FolderOpen, Settings } from "lucide-react";
```

y sustituir:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
```

por:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
  { href: "/cliente-categoria", label: "Cliente × Categoría", icon: ListTree },
```

En `src/actions/category-actions.ts`, con Edit, sustituir:

```ts
    revalidatePath("/cliente-articulo");
```

por:

```ts
    revalidatePath("/cliente-articulo");
    revalidatePath("/cliente-categoria");
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx tsc --noEmit`
Expected: sin errores.

Esperar al menos 60 s desde la ejecución del Step 2 y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npx playwright test e2e/specs/cliente-categoria.spec.ts`
Expected: PASS: los 3 tests.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/cliente-categoria.spec.ts src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx src/components/common/command-palette.tsx src/actions/category-actions.ts
git commit -m "feat(cliente-categoria): entrada en el menu y la paleta de comandos"
```

---

## Task 5: Verificación final

Esta tarea no crea commit si todo pasa. Si alguna comprobación obliga a cambiar código, el arreglo va en un commit nuevo (`fix(cliente-categoria): ...`), nunca con `--amend`.

**Files:** ninguno.

- [ ] **Step 1: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exactamente **10 warnings y 0 errores**, los mismos de la línea base. Un warning más significa que algún fichero de este plan lo introdujo: se corrige.

- [ ] **Step 3: Tests unitarios**

Run: `npx vitest run`
Expected: **411 passed, 1 skipped** (399 de la línea base + 12 nuevos: 10 en `customer-category.test.ts` y 2 en `customer-category-compare.test.ts`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: termina sin errores y la lista de rutas incluye `/cliente-categoria`.

- [ ] **Step 5: E2E completo**

Si Docker no responde a `docker info`: `"/c/Program Files/Docker/Docker/Docker Desktop.exe" &` y esperar. Comprobar que el puerto 3100 está libre (`netstat -ano | grep ":3100"`) y que han pasado al menos 60 s desde la última ejecución de Playwright.

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run test:e2e`
Expected: **72 passing** (68 de la línea base + 3 de `cliente-categoria.spec.ts` + 1 ruta nueva en `navigation.spec.ts`). Un timeout aislado en un spec ajeno a esta funcionalidad es ambiental (máquina lenta, unos 5 s por página): repetir solo ese spec, dejando 60 s, antes de darlo por roto.

- [ ] **Step 6: Revisión manual rápida**

Con `npm run dev` y un usuario aprobado:
- La barra lateral muestra «Cliente × Categoría» justo debajo de «Cliente × Artículo»; el menú móvil y la paleta (Ctrl+K), también.
- En `/cliente-categoria`, mientras carga la clasificación, la tabla es un esqueleto y «Exportar» está desactivado.
- El buscador filtra por cliente y por categoría; «Comparar años» muestra Categoría, Importe {año A}, Importe {año B} y Δ%.
- CSV y Excel descargan con las columnas Categoría, Cantidad y las cuatro macro-categorías, una fila por cliente y la fila TOTAL.
- `/cliente-articulo` sigue igual: selectores de año, «Comparar años» y exportación.

- [ ] **Step 7: Despliegue**

Solo código: no hay migración. Se despliega con el flujo habitual tras fusionar la rama.
