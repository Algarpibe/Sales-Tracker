# Ventas por artículo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva página `/articulos` que muestra ventas agregadas por artículo (SKU, nombre, categoría, cantidad, importe, precio promedio) leídas en vivo del zoho-hub, con filtros OV/FAC + rango de fechas (servidor) y búsqueda/categoría/orden/CSV (cliente).

**Architecture:** Página cliente Next (App Router) → server action `getItemSales` (`requireApproved`) → `getHubItemSales` agrega en el pool del hub (`src/db/hub.ts`). Lógica de filtro/orden/total/CSV en helpers puros testeables. react-query para caché; error boundary existente para errores.

**Tech Stack:** Next 16 (App Router), React 19, @tanstack/react-query, pg (pool hub), Tailwind + UI propios, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (modificar) | Tipos `ItemSalesRow`, `ItemSalesFilters`. |
| `src/lib/item-sales.ts` (crear) | Helpers puros: `precioPromedio`, `categoriaLabel`, `filterAndSortItems`, `computeItemTotals`, `itemsToCsv` + tipos `ItemSortKey`/`SortDir`. |
| `src/lib/__tests__/item-sales.test.ts` (crear) | Tests de los helpers. |
| `src/db/hub-item-sales.ts` (crear) | `getHubItemSales(filters)`: consulta agregada al hub. |
| `src/actions/item-sales-actions.ts` (crear) | Action `getItemSales(filters)` (`requireApproved`). |
| `src/app/(dashboard)/articulos/page.tsx` (crear) | Página/UI. |
| `src/components/layout/sidebar.tsx` (modificar) | Entrada "Artículos". |
| `src/components/layout/mobile-nav.tsx` (modificar) | Entrada "Artículos". |

---

### Task 1: Tipos de dominio

**Files:**
- Modify: `src/types/database.ts` (añadir al final, antes de la última línea)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types/database.ts`:

```ts
// ===== Ventas por artículo =====

export interface ItemSalesFilters {
  tipo: RecordType;        // "SALES_ORDER" (OV) | "INVOICE" (FAC)
  desde: string;           // YYYY-MM-DD (inclusive)
  hasta: string;           // YYYY-MM-DD (inclusive)
}

export interface ItemSalesRow {
  item_id: string;
  sku: string | null;
  nombre: string;
  categoria: string | null;
  cantidad: number;
  importe: number;         // bruto (bcy_rate*quantity), igual al informe Zoho
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: rc 0 (los tipos no se usan aún, pero deben compilar).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(articulos): tipos ItemSalesRow/ItemSalesFilters"
```

---

### Task 2: Helpers puros + tests (TDD)

**Files:**
- Create: `src/lib/item-sales.ts`
- Test: `src/lib/__tests__/item-sales.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Crea `src/lib/__tests__/item-sales.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  precioPromedio,
  categoriaLabel,
  filterAndSortItems,
  computeItemTotals,
  itemsToCsv,
} from "@/lib/item-sales";
import type { ItemSalesRow } from "@/types/database";

const rows: ItemSalesRow[] = [
  { item_id: "1", sku: "AAA", nombre: "Sensor", categoria: "AP Series", cantidad: 2, importe: 200 },
  { item_id: "2", sku: "BBB", nombre: "Filtro APNA", categoria: "AP Series", cantidad: 4, importe: 100 },
  { item_id: "3", sku: null, nombre: "Servicio", categoria: null, cantidad: 0, importe: 50 },
  { item_id: "4", sku: "CCC", nombre: "Nota credito", categoria: "AP Series", cantidad: -1, importe: -30 },
];

describe("precioPromedio", () => {
  it("importe/cantidad; 0 si cantidad es 0", () => {
    expect(precioPromedio(rows[0])).toBe(100);
    expect(precioPromedio(rows[2])).toBe(0);
  });
});

describe("categoriaLabel", () => {
  it("usa 'Sin categoría' cuando es null", () => {
    expect(categoriaLabel(rows[0])).toBe("AP Series");
    expect(categoriaLabel(rows[2])).toBe("Sin categoría");
  });
});

describe("filterAndSortItems", () => {
  it("busca por sku o nombre (case-insensitive)", () => {
    const r = filterAndSortItems(rows, { search: "apna", categoria: "", sortKey: "importe", sortDir: "desc" });
    expect(r.map((x) => x.item_id)).toEqual(["2"]);
  });
  it("filtra por categoría (incl. 'Sin categoría')", () => {
    const r = filterAndSortItems(rows, { search: "", categoria: "Sin categoría", sortKey: "importe", sortDir: "desc" });
    expect(r.map((x) => x.item_id)).toEqual(["3"]);
  });
  it("ordena por importe desc y asc", () => {
    const desc = filterAndSortItems(rows, { search: "", categoria: "", sortKey: "importe", sortDir: "desc" });
    expect(desc.map((x) => x.item_id)).toEqual(["1", "2", "3", "4"]);
    const asc = filterAndSortItems(rows, { search: "", categoria: "", sortKey: "importe", sortDir: "asc" });
    expect(asc.map((x) => x.item_id)).toEqual(["4", "3", "2", "1"]);
  });
  it("ordena por nombre asc", () => {
    const r = filterAndSortItems(rows, { search: "", categoria: "", sortKey: "nombre", sortDir: "asc" });
    expect(r.map((x) => x.nombre)).toEqual(["Filtro APNA", "Nota credito", "Sensor", "Servicio"]);
  });
});

describe("computeItemTotals", () => {
  it("suma cantidad e importe (incluye negativos)", () => {
    expect(computeItemTotals(rows)).toEqual({ cantidad: 5, importe: 320 });
  });
});

describe("itemsToCsv", () => {
  it("incluye cabecera, filas y TOTAL con separador ';'", () => {
    const csv = itemsToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("SKU;Nombre;Categoría;Cantidad;Importe;Precio promedio");
    expect(lines[lines.length - 1]).toBe("TOTAL;;;5;320.00;");
    expect(lines).toHaveLength(rows.length + 2);
  });
});
```

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run: `npx vitest run src/lib/__tests__/item-sales.test.ts`
Expected: FAIL ("Cannot find module '@/lib/item-sales'").

- [ ] **Step 3: Implementar los helpers**

Crea `src/lib/item-sales.ts`:

```ts
import type { ItemSalesRow } from "@/types/database";

export type ItemSortKey = "sku" | "nombre" | "categoria" | "cantidad" | "importe" | "precio";
export type SortDir = "asc" | "desc";

export const SIN_CATEGORIA = "Sin categoría";

export function categoriaLabel(row: ItemSalesRow): string {
  return row.categoria ?? SIN_CATEGORIA;
}

export function precioPromedio(row: ItemSalesRow): number {
  return row.cantidad !== 0 ? row.importe / row.cantidad : 0;
}

export function filterAndSortItems(
  rows: ItemSalesRow[],
  opts: { search: string; categoria: string; sortKey: ItemSortKey; sortDir: SortDir }
): ItemSalesRow[] {
  const q = opts.search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const matchesSearch =
      !q || (r.sku ?? "").toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q);
    const matchesCat = !opts.categoria || categoriaLabel(r) === opts.categoria;
    return matchesSearch && matchesCat;
  });
  const dir = opts.sortDir === "asc" ? 1 : -1;
  const val = (r: ItemSalesRow): string | number => {
    switch (opts.sortKey) {
      case "sku": return r.sku ?? "";
      case "nombre": return r.nombre;
      case "categoria": return categoriaLabel(r);
      case "cantidad": return r.cantidad;
      case "importe": return r.importe;
      case "precio": return precioPromedio(r);
    }
  };
  return [...filtered].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function computeItemTotals(rows: ItemSalesRow[]): { cantidad: number; importe: number } {
  return rows.reduce(
    (acc, r) => ({ cantidad: acc.cantidad + r.cantidad, importe: acc.importe + r.importe }),
    { cantidad: 0, importe: 0 }
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function itemsToCsv(rows: ItemSalesRow[]): string {
  const header = ["SKU", "Nombre", "Categoría", "Cantidad", "Importe", "Precio promedio"];
  const body = rows.map((r) => [
    r.sku ?? "",
    r.nombre,
    categoriaLabel(r),
    r.cantidad,
    r.importe.toFixed(2),
    precioPromedio(r).toFixed(2),
  ]);
  const t = computeItemTotals(rows);
  const total = ["TOTAL", "", "", t.cantidad, t.importe.toFixed(2), ""];
  return [header, ...body, total].map((row) => row.map(csvCell).join(";")).join("\n");
}
```

- [ ] **Step 4: Ejecutar test (debe pasar)**

Run: `npx vitest run src/lib/__tests__/item-sales.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-sales.ts src/lib/__tests__/item-sales.test.ts
git commit -m "feat(articulos): helpers puros de ventas por artículo + tests"
```

---

### Task 3: Capa de datos del hub

**Files:**
- Create: `src/db/hub-item-sales.ts`

- [ ] **Step 1: Implementar la consulta**

Crea `src/db/hub-item-sales.ts`:

```ts
import { getHubPool } from "@/db/hub";
import type { ItemSalesFilters, ItemSalesRow } from "@/types/database";

// Tablas elegidas en servidor por tipo (NO input de usuario → sin inyección).
// BACKLOG no aplica a esta vista; cualquier valor distinto de SALES_ORDER usa FAC.
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubItemSales(f: ItemSalesFilters): Promise<ItemSalesRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT it.item_id, it.sku, it.name AS nombre, it.category_name AS categoria,
           sum(l.quantity) AS cantidad,
           round(sum(l.bcy_rate * l.quantity)::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE h.date BETWEEN $1 AND $2
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
    GROUP BY it.item_id, it.sku, it.name, it.category_name
    ORDER BY importe DESC`;
  const { rows } = await getHubPool().query(sql, [f.desde, f.hasta]);
  return rows.map((r) => ({
    item_id: String(r.item_id),
    sku: r.sku ?? null,
    nombre: String(r.nombre ?? ""),
    categoria: r.categoria ?? null,
    cantidad: Number(r.cantidad),
    importe: Number(r.importe),
  }));
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: rc 0.

- [ ] **Step 3: Commit**

```bash
git add src/db/hub-item-sales.ts
git commit -m "feat(articulos): consulta agregada por artículo en el hub"
```

---

### Task 4: Server action

**Files:**
- Create: `src/actions/item-sales-actions.ts`

- [ ] **Step 1: Implementar la action**

Crea `src/actions/item-sales-actions.ts`:

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubItemSales } from "@/db/hub-item-sales";
import type { ItemSalesFilters, ItemSalesRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getItemSales(filters: ItemSalesFilters): Promise<ItemSalesRow[]> {
  await requireApproved();
  return getHubItemSales(filters);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: rc 0.

- [ ] **Step 3: Commit**

```bash
git add src/actions/item-sales-actions.ts
git commit -m "feat(articulos): server action getItemSales (requireApproved)"
```

---

### Task 5: Página `/articulos`

**Files:**
- Create: `src/app/(dashboard)/articulos/page.tsx`

- [ ] **Step 1: Implementar la página**

Crea `src/app/(dashboard)/articulos/page.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import type { ItemSalesRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  filterAndSortItems,
  computeItemTotals,
  itemsToCsv,
  precioPromedio,
  categoriaLabel,
  type ItemSortKey,
  type SortDir,
} from "@/lib/item-sales";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

const todayISO = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => `${new Date().getFullYear()}-01-01`;

export default function ArticulosPage() {
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desde, setDesde] = useState(yearStartISO());
  const [hasta, setHasta] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<ItemSortKey>("importe");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["item-sales", { tipo, desde, hasta }],
    queryFn: () => getItemSales({ tipo, desde, hasta }),
  });
  const rows: ItemSalesRow[] = data ?? [];

  const categorias = useMemo(
    () => Array.from(new Set(rows.map(categoriaLabel))).sort(),
    [rows]
  );
  const view = useMemo(
    () => filterAndSortItems(rows, { search, categoria, sortKey, sortDir }),
    [rows, search, categoria, sortKey, sortDir]
  );
  const totals = useMemo(() => computeItemTotals(view), [view]);

  const onSort = (k: ItemSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const blob = new Blob([itemsToCsv(view)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_articulo_${tipo}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const Th = ({ k, label, right }: { k: ItemSortKey; label: string; right?: boolean }) => (
    <TableHead className={right ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-primary group"
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "opacity-40"}`} />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por artículo</h1>
        <p className="text-sm text-muted-foreground">
          Detalle por artículo leído en vivo de Zoho. Importe bruto, igual al informe de Zoho.
        </p>
      </div>

      {/* Controles servidor: tipo + rango de fechas */}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={tipo} onValueChange={(v) => setTipo(v as RecordType)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{tipo === "SALES_ORDER" ? "Órdenes de Venta (OV)" : "Facturas (FAC)"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INVOICE">Facturas (FAC)</SelectItem>
            <SelectItem value="SALES_ORDER">Órdenes de Venta (OV)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      {/* Controles cliente: búsqueda + categoría + CSV */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU o nombre…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={view.length === 0}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <Th k="sku" label="SKU" />
                <Th k="nombre" label="Nombre" />
                <Th k="categoria" label="Categoría" />
                <Th k="cantidad" label="Cantidad" right />
                <Th k="importe" label="Importe" right />
                <Th k="precio" label="Precio promedio" right />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Sin resultados para el rango/criterios seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {view.map((r) => (
                    <TableRow key={r.item_id}>
                      <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">{categoriaLabel(r)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(r.importe)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(precioPromedio(r))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={3}>TOTAL ({view.length} artículos)</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.cantidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(totals.importe)}</TableCell>
                    <TableCell />
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

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc rc 0; lint 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/articulos/page.tsx"
git commit -m "feat(articulos): página Ventas por artículo (filtros, orden, total, CSV)"
```

---

### Task 6: Entradas de menú

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: sidebar — añadir icono e ítem**

En `src/components/layout/sidebar.tsx`, añade `Package` al import de `lucide-react` (junto a los demás iconos) y añade el ítem al array `navItems` justo después del de `/tablas`:

```tsx
  { href: "/articulos", label: "Artículos", icon: Package },
```

- [ ] **Step 2: mobile-nav — añadir icono e ítem**

En `src/components/layout/mobile-nav.tsx`, añade `Package` al import de `lucide-react` y el ítem al array `navItems` tras el de `/tablas`:

```tsx
  { href: "/articulos", label: "Artículos", icon: Package },
```

- [ ] **Step 3: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc rc 0; lint 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(articulos): entrada de menú Artículos"
```

---

### Task 7: Build + validación contra el CSV de Zoho

**Files:** (ninguno; verificación)

- [ ] **Step 1: Build + tests completos**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tsc rc 0; lint 0 errores; tests `passed`; build OK.

- [ ] **Step 2: Validación de datos (manual, vía hub)**

Comparar contra el CSV adjunto (FAC 2025): el total y un par de artículos deben coincidir al céntimo (ya verificado en diseño: EDM 180C = 418.719,89; APNA 370-NOx = 55.338,30). Tras desplegar, abrir `/articulos`, tipo FAC, rango `2025-01-01`→`2025-12-31`, y comprobar que esos artículos cuadran.

- [ ] **Step 3: Commit (si quedara algo) + push**

```bash
git push origin main
```

---

## Notas
- **Sin fallback sin hub:** esta vista requiere `HUB_DB_URL` (no hay equivalente por artículo en `sales_records`). Si faltara, la página mostrará el error boundary. En prod `HUB_DB_URL` está configurado.
- **react-query `throwOnError`** ya está activo globalmente → los errores de `getItemSales` suben al error boundary del dashboard.
- **Deploy:** al terminar, desplegar en EasyPanel (cambios de runtime).
