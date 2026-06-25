# Ventas por cliente × artículo (4 macro-categorías) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva página `/cliente-articulo`: por cliente, sus artículos del año con el importe en una de 4 macro-columnas (Mano de Obra/Cal · C&R · Equipos · Operación) según la categoría, con subtotales por cliente y TOTAL general. Lee el zoho-hub en vivo.

**Architecture:** Página cliente → action `getCustomerItemSales` (`requireApproved`) → `getHubCustomerItemSales` agrega por (cliente, artículo) en el hub. Clasificación en buckets, agrupado y totales en helpers puros testeables. react-query + error boundary.

**Tech Stack:** Next 16 (App Router), React 19, @tanstack/react-query, pg (pool hub), Tailwind + UI propios, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | `CustomerItemFilters`, `CustomerItemRow`. |
| `src/lib/customer-item.ts` (crear) | `Bucket`, `BUCKET_LABELS`, `bucketForCategory`, `filterRows`, `groupByCustomer`, `computeGrandTotals`, `customerItemToCsv` + `CustomerGroup`. |
| `src/lib/__tests__/customer-item.test.ts` (crear) | Tests. |
| `src/db/hub-customer-item-sales.ts` (crear) | `getHubCustomerItemSales`. |
| `src/actions/customer-item-actions.ts` (crear) | `getCustomerItemSales`. |
| `src/app/(dashboard)/cliente-articulo/page.tsx` (crear) | Página/UI. |
| `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` (mod) | Entrada "Cliente × Artículo". |

---

### Task 1: Tipos

**Files:** Modify `src/types/database.ts` (añadir al final)

- [ ] **Step 1: Añadir tipos**

```ts
// ===== Ventas por cliente × artículo =====

export interface CustomerItemFilters {
  tipo: RecordType;   // "SALES_ORDER" (OV) | "INVOICE" (FAC)
  anio: number;
}

export interface CustomerItemRow {
  customer: string;
  sku: string | null;
  marca: string | null;
  nombre: string;
  categoria: string | null;
  cantidad: number;
  importe: number;    // neto del descuento de cabecera
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/types/database.ts
git commit -m "feat(cliente-articulo): tipos CustomerItemFilters/CustomerItemRow"
```

---

### Task 2: Helpers puros + tests (TDD)

**Files:** Create `src/lib/customer-item.ts`; Test `src/lib/__tests__/customer-item.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Crea `src/lib/__tests__/customer-item.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
} from "@/lib/customer-item";
import type { CustomerItemRow } from "@/types/database";

const rows: CustomerItemRow[] = [
  { customer: "Beta", sku: "A", marca: "Horiba Ltd.", nombre: "Scrubber", categoria: "C&R AP Series", cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "B", marca: "Ambientalia", nombre: "Calibración Enviro", categoria: "CAL PM", cantidad: 2, importe: 300 },
  { customer: "Alpha", sku: "C", marca: "Grimm", nombre: "EDM 180C", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
  { customer: "Alpha", sku: "D", marca: "Ambientalia", nombre: "Mantenimiento", categoria: "Operación de Redes", cantidad: 1, importe: 50 },
];

describe("bucketForCategory", () => {
  it("clasifica por reglas de nombre", () => {
    expect(bucketForCategory("C&R AP Series")).toBe("cr");
    expect(bucketForCategory("CAL PM")).toBe("mano_obra");
    expect(bucketForCategory("ST EDM 180")).toBe("mano_obra");
    expect(bucketForCategory("ST")).toBe("mano_obra");
    expect(bucketForCategory("Alquileres")).toBe("mano_obra");
    expect(bucketForCategory("Operación de Redes")).toBe("operacion");
    expect(bucketForCategory("Consultoría")).toBe("operacion");
    expect(bucketForCategory("EDM180 Series")).toBe("equipos");
    expect(bucketForCategory("Accesorios")).toBe("equipos");
    expect(bucketForCategory(null)).toBe("equipos");
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
    const g = groupByCustomer(rows);
    expect(g.map((x) => x.customer)).toEqual(["Alpha", "Beta"]);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 500, operacion: 50 });
    expect(g[0].items.map((i) => i.sku)).toEqual(["C", "D"]);
    expect(g[1].totals).toEqual({ mano_obra: 300, cr: 100, equipos: 0, operacion: 0 });
    expect(g[1].items.map((i) => i.sku)).toEqual(["B", "A"]);
  });
});

describe("computeGrandTotals", () => {
  it("suma los 4 buckets", () => {
    expect(computeGrandTotals(groupByCustomer(rows))).toEqual({ mano_obra: 300, cr: 100, equipos: 500, operacion: 50 });
  });
});

describe("customerItemToCsv", () => {
  it("cabecera + fila por cliente + artículos + TOTAL", () => {
    const groups = groupByCustomer(rows);
    const csv = customerItemToCsv(groups, computeGrandTotals(groups));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("SKU;Marca;Nombre;Categoría;Cantidad;Mano de Obra/Cal;C&R;Equipos;Operación");
    expect(lines[1]).toBe("Alpha;;;;;0.00;0.00;500.00;50.00");
    expect(lines[2]).toBe("C;Grimm;EDM 180C;EDM180 Series;1;;;500.00;");
    expect(lines[lines.length - 1]).toBe("TOTAL;;;;;300.00;100.00;500.00;50.00");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-item.test.ts` → FAIL ("Cannot find module").

- [ ] **Step 3: Implementar**

Crea `src/lib/customer-item.ts`:

```ts
import type { CustomerItemRow } from "@/types/database";

export type Bucket = "mano_obra" | "cr" | "equipos" | "operacion";

export const BUCKET_LABELS: Record<Bucket, string> = {
  mano_obra: "Mano de Obra / Cal",
  cr: "C&R",
  equipos: "Equipos",
  operacion: "Operación",
};

export interface CustomerGroup {
  customer: string;
  items: CustomerItemRow[];
  totals: Record<Bucket, number>;
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
  const header = ["SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de Obra/Cal", "C&R", "Equipos", "Operación"];
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
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/customer-item.test.ts` → PASS.
- [ ] **Step 5:** Commit:

```bash
git add src/lib/customer-item.ts src/lib/__tests__/customer-item.test.ts
git commit -m "feat(cliente-articulo): helpers de buckets + agrupado por cliente + tests"
```

---

### Task 3: Capa de datos del hub

**Files:** Create `src/db/hub-customer-item-sales.ts`

- [ ] **Step 1: Implementar**

```ts
import { getHubPool } from "@/db/hub";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerItemSales(f: CustomerItemFilters): Promise<CustomerItemRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer, it.sku, it.raw->>'manufacturer' AS marca,
           it.name AS nombre, it.category_name AS categoria,
           sum(l.quantity) AS cantidad,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric,0) / NULLIF(h.bcy_sub_total,0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
    GROUP BY h.customer_name, it.sku, it.raw->>'manufacturer', it.name, it.category_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    customer: String(r.customer),
    sku: r.sku ?? null,
    marca: r.marca ?? null,
    nombre: String(r.nombre ?? ""),
    categoria: r.categoria ?? null,
    cantidad: Number(r.cantidad),
    importe: Number(r.importe),
  }));
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/db/hub-customer-item-sales.ts
git commit -m "feat(cliente-articulo): consulta cliente×artículo en el hub"
```

---

### Task 4: Server action

**Files:** Create `src/actions/customer-item-actions.ts`

- [ ] **Step 1: Implementar**

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerItemSales } from "@/db/hub-customer-item-sales";
import type { CustomerItemFilters, CustomerItemRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerItemSales(filters: CustomerItemFilters): Promise<CustomerItemRow[]> {
  await requireApproved();
  return getHubCustomerItemSales(filters);
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/actions/customer-item-actions.ts
git commit -m "feat(cliente-articulo): server action getCustomerItemSales"
```

---

### Task 5: Página `/cliente-articulo`

**Files:** Create `src/app/(dashboard)/cliente-articulo/page.tsx`

- [ ] **Step 1: Implementar la página**

```tsx
"use client";

import { Fragment, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import type { CustomerItemRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
} from "@/lib/customer-item";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";

const FIRST_YEAR = 2021;

export default function ClienteArticuloPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [anio, setAnio] = useState(thisYear);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo, anio }],
    queryFn: () => getCustomerItemSales({ tipo, anio }),
  });

  const rows = useMemo<CustomerItemRow[]>(() => data ?? [], [data]);
  const groups = useMemo(() => groupByCustomer(filterRows(rows, search)), [rows, search]);
  const grand = useMemo(() => computeGrandTotals(groups), [groups]);

  const exportCsv = () => {
    const blob = new Blob([customerItemToCsv(groups, grand)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_cliente_articulo_${tipo}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const amount = (show: boolean, n: number) =>
    show ? <span className="tabular-nums">{formatUSD(n)}</span> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente × artículo</h1>
        <p className="text-sm text-muted-foreground">
          Por cliente, importe neto por artículo clasificado en 4 macro-categorías. En vivo de Zoho.
        </p>
      </div>

      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={tipo} onValueChange={(v) => { if (v) setTipo(v as RecordType); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{tipo === "SALES_ORDER" ? "Órdenes de Venta (OV)" : "Facturas (FAC)"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INVOICE">Facturas (FAC)</SelectItem>
            <SelectItem value="SALES_ORDER">Órdenes de Venta (OV)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Año</label>
          <Select value={String(anio)} onValueChange={(v) => { if (v) setAnio(Number(v)); }}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controles cliente */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente, artículo o SKU…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={groups.length === 0}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">SKU</TableHead>
                <TableHead className="min-w-[140px]">Marca</TableHead>
                <TableHead className="min-w-[220px]">Nombre</TableHead>
                <TableHead className="min-w-[140px]">Categoría</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Mano de Obra / Cal</TableHead>
                <TableHead className="text-right">C&amp;R</TableHead>
                <TableHead className="text-right">Equipos</TableHead>
                <TableHead className="text-right">Operación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Sin ventas en el año seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.customer}>
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5}>{g.customer}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.mano_obra)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.cr)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.equipos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.operacion)}</TableCell>
                      </TableRow>
                      {g.items.map((it, i) => {
                        const b = bucketForCategory(it.categoria);
                        return (
                          <TableRow key={`${g.customer}-${i}`}>
                            <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{it.marca ?? "—"}</TableCell>
                            <TableCell>{it.nombre}</TableCell>
                            <TableCell className="text-muted-foreground">{it.categoria ?? "Sin categoría"}</TableCell>
                            <TableCell className="text-right tabular-nums">{it.cantidad}</TableCell>
                            <TableCell className="text-right">{amount(b === "mano_obra", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "cr", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "equipos", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "operacion", it.importe)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={5}>TOTAL ({groups.length} clientes)</TableCell>
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
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 3:** Commit:

```bash
git add "src/app/(dashboard)/cliente-articulo/page.tsx"
git commit -m "feat(cliente-articulo): página por cliente con 4 macro-columnas"
```

---

### Task 6: Entradas de menú

**Files:** Modify `src/components/layout/sidebar.tsx` y `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: sidebar**

Lee `src/components/layout/sidebar.tsx`. Añade `ClipboardList` al import de `lucide-react` (si no está) y el ítem al array `navItems` tras el de `/clientes`:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
```

- [ ] **Step 2: mobile-nav**

Lee `src/components/layout/mobile-nav.tsx`. Añade `ClipboardList` al import de `lucide-react` y el ítem tras el de `/clientes`:

```tsx
  { href: "/cliente-articulo", label: "Cliente × Art.", icon: ClipboardList },
```

- [ ] **Step 3:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 4:** Commit:

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(cliente-articulo): entrada de menú"
```

---

### Task 7: Build + validación

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde; ruta `/cliente-articulo` en la salida.
- [ ] **Step 2: Validación (manual, vía hub).** Tras desplegar, abrir `/cliente-articulo`, FAC, año 2025, y comparar con el PDF: p.ej. **Consultora Endémica** → Equipos ≈ $209.945; **Chemical Laboratory** → Equipos ≈ $168.027 + C&R ≈ $8.918 + Mano de Obra ≈ $8.380; **Corola** → Equipos ≈ $50.589.
- [ ] **Step 3:** `git push origin main`

---

## Notas
- **Sin fallback sin hub:** requiere `HUB_DB_URL`. Sin él → error boundary.
- `react-query throwOnError` global → errores al error boundary del dashboard.
- Casos de categoría dudosos (Comisiones, Intereses, Obra Civil, Accesorios, Opcional*) → `equipos` por la regla "resto"; ajustar `bucketForCategory` si se desea.
- Deploy en EasyPanel al terminar.
