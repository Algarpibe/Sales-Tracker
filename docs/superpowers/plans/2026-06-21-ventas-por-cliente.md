# Ventas por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva página `/clientes` con una matriz cliente × año (OV/FAC, rango de años) leída en vivo del zoho-hub, con búsqueda, columna Total + %, fila TOTAL y export CSV.

**Architecture:** Página cliente Next → server action `getCustomerSales` (`requireApproved`) → `getHubCustomerSales` agrega (cliente × año) en el pool del hub. La página pivota a matriz y calcula totales/% con helpers puros testeables. react-query + error boundary existentes.

**Tech Stack:** Next 16 (App Router), React 19, @tanstack/react-query, pg (pool hub), Tailwind + UI propios, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | `CustomerSalesFilters`, `CustomerYearRow`. |
| `src/lib/customer-sales.ts` (crear) | Helpers puros + `CustomerMatrixRow`. |
| `src/lib/__tests__/customer-sales.test.ts` (crear) | Tests. |
| `src/db/hub-customer-sales.ts` (crear) | `getHubCustomerSales`. |
| `src/actions/customer-sales-actions.ts` (crear) | `getCustomerSales`. |
| `src/app/(dashboard)/clientes/page.tsx` (crear) | Página (matriz). |
| `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` (mod) | Entrada "Clientes". |

---

### Task 1: Tipos

**Files:** Modify `src/types/database.ts` (añadir al final)

- [ ] **Step 1: Añadir tipos**

```ts
// ===== Ventas por cliente =====

export interface CustomerSalesFilters {
  tipo: RecordType;      // "SALES_ORDER" (OV) | "INVOICE" (FAC)
  desdeAnio: number;
  hastaAnio: number;
}

export interface CustomerYearRow {
  customer: string;
  year: number;
  ventas: number;        // neto del descuento de cabecera (igual al informe Zoho)
}
```

- [ ] **Step 2:** Run `npx tsc --noEmit` → Expected rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/types/database.ts
git commit -m "feat(clientes): tipos CustomerSalesFilters/CustomerYearRow"
```

---

### Task 2: Helpers puros + tests (TDD)

**Files:** Create `src/lib/customer-sales.ts`; Test `src/lib/__tests__/customer-sales.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Crea `src/lib/__tests__/customer-sales.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCustomerMatrix,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
} from "@/lib/customer-sales";
import type { CustomerYearRow } from "@/types/database";

const rows: CustomerYearRow[] = [
  { customer: "Alpha", year: 2024, ventas: 100 },
  { customer: "Alpha", year: 2025, ventas: 300 },
  { customer: "Beta", year: 2025, ventas: 50 },
  { customer: "Beta", year: 2024, ventas: -10 },
];
const years = [2024, 2025];

describe("buildCustomerMatrix", () => {
  it("pivota por cliente/año y ordena por total desc", () => {
    const m = buildCustomerMatrix(rows, years);
    expect(m.map((r) => r.customer)).toEqual(["Alpha", "Beta"]);
    expect(m[0]).toEqual({ customer: "Alpha", byYear: { 2024: 100, 2025: 300 }, total: 400 });
    expect(m[1].total).toBe(40);
  });
});

describe("computeColumnTotals", () => {
  it("totales por año y general (incluye negativos)", () => {
    const m = buildCustomerMatrix(rows, years);
    expect(computeColumnTotals(m, years)).toEqual({ byYear: { 2024: 90, 2025: 350 }, grand: 440 });
  });
});

describe("filterCustomers", () => {
  it("filtra por nombre (case-insensitive)", () => {
    const m = buildCustomerMatrix(rows, years);
    expect(filterCustomers(m, "bet").map((r) => r.customer)).toEqual(["Beta"]);
    expect(filterCustomers(m, "").length).toBe(2);
  });
});

describe("customerMatrixToCsv", () => {
  it("cabecera + filas + TOTAL con ';' y %", () => {
    const m = buildCustomerMatrix(rows, years);
    const csv = customerMatrixToCsv(m, years, 440);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Cliente;2024;2025;Total;%");
    expect(lines[1]).toBe("Alpha;100.00;300.00;400.00;90.9%");
    expect(lines[lines.length - 1]).toBe("TOTAL;90.00;350.00;440.00;100%");
    expect(lines).toHaveLength(rows.length / 2 + 2); // 2 clientes + cabecera + total
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/__tests__/customer-sales.test.ts` → Expected FAIL ("Cannot find module").

- [ ] **Step 3: Implementar**

Crea `src/lib/customer-sales.ts`:

```ts
import type { CustomerYearRow } from "@/types/database";

export interface CustomerMatrixRow {
  customer: string;
  byYear: Record<number, number>;
  total: number;
}

export function buildCustomerMatrix(rows: CustomerYearRow[], _years: number[]): CustomerMatrixRow[] {
  const map = new Map<string, CustomerMatrixRow>();
  for (const r of rows) {
    let m = map.get(r.customer);
    if (!m) {
      m = { customer: r.customer, byYear: {}, total: 0 };
      map.set(r.customer, m);
    }
    m.byYear[r.year] = (m.byYear[r.year] ?? 0) + r.ventas;
    m.total += r.ventas;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function computeColumnTotals(
  matrix: CustomerMatrixRow[],
  years: number[]
): { byYear: Record<number, number>; grand: number } {
  const byYear: Record<number, number> = {};
  for (const y of years) byYear[y] = 0;
  let grand = 0;
  for (const row of matrix) {
    for (const y of years) byYear[y] += row.byYear[y] ?? 0;
    grand += row.total;
  }
  return { byYear, grand };
}

export function filterCustomers(matrix: CustomerMatrixRow[], search: string): CustomerMatrixRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return matrix;
  return matrix.filter((r) => r.customer.toLowerCase().includes(q));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customerMatrixToCsv(
  matrix: CustomerMatrixRow[],
  years: number[],
  grand: number
): string {
  const pct = (n: number) => (grand > 0 ? `${((n / grand) * 100).toFixed(1)}%` : "0%");
  const header = ["Cliente", ...years.map(String), "Total", "%"];
  const body = matrix.map((r) => [
    r.customer,
    ...years.map((y) => (r.byYear[y] ?? 0).toFixed(2)),
    r.total.toFixed(2),
    pct(r.total),
  ]);
  const totals = computeColumnTotals(matrix, years);
  const totalRow = [
    "TOTAL",
    ...years.map((y) => totals.byYear[y].toFixed(2)),
    totals.grand.toFixed(2),
    "100%",
  ];
  return [header, ...body, totalRow].map((row) => row.map(csvCell).join(";")).join("\n");
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/__tests__/customer-sales.test.ts` → Expected PASS.
- [ ] **Step 5:** Commit:

```bash
git add src/lib/customer-sales.ts src/lib/__tests__/customer-sales.test.ts
git commit -m "feat(clientes): helpers puros de matriz cliente×año + tests"
```

---

### Task 3: Capa de datos del hub

**Files:** Create `src/db/hub-customer-sales.ts`

- [ ] **Step 1: Implementar**

```ts
import { getHubPool } from "@/db/hub";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerSales(f: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer,
           extract(year from h.date)::int AS year,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS ventas
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) BETWEEN $1 AND $2
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
    GROUP BY h.customer_name, extract(year from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.desdeAnio, f.hastaAnio]);
  return rows.map((r) => ({
    customer: String(r.customer),
    year: Number(r.year),
    ventas: Number(r.ventas),
  }));
}
```

- [ ] **Step 2:** Run `npx tsc --noEmit` → Expected rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/db/hub-customer-sales.ts
git commit -m "feat(clientes): consulta cliente×año en el hub"
```

---

### Task 4: Server action

**Files:** Create `src/actions/customer-sales-actions.ts`

- [ ] **Step 1: Implementar**

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import type { CustomerSalesFilters, CustomerYearRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerSales(filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  await requireApproved();
  return getHubCustomerSales(filters);
}
```

- [ ] **Step 2:** Run `npx tsc --noEmit` → Expected rc 0.
- [ ] **Step 3:** Commit:

```bash
git add src/actions/customer-sales-actions.ts
git commit -m "feat(clientes): server action getCustomerSales (requireApproved)"
```

---

### Task 5: Página `/clientes`

**Files:** Create `src/app/(dashboard)/clientes/page.tsx`

- [ ] **Step 1: Implementar la página**

```tsx
"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import type { CustomerYearRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  buildCustomerMatrix,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
} from "@/lib/customer-sales";
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

const FIRST_YEAR = 2015;

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

export default function ClientesPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => range(FIRST_YEAR, thisYear), [thisYear]);

  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desdeAnio, setDesdeAnio] = useState(FIRST_YEAR);
  const [hastaAnio, setHastaAnio] = useState(thisYear);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo, desdeAnio, hastaAnio }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio, hastaAnio }),
  });

  const rows = useMemo<CustomerYearRow[]>(() => data ?? [], [data]);
  const years = useMemo(
    () => (desdeAnio <= hastaAnio ? range(desdeAnio, hastaAnio) : []),
    [desdeAnio, hastaAnio]
  );
  const matrix = useMemo(() => buildCustomerMatrix(rows, years), [rows, years]);
  const visible = useMemo(() => filterCustomers(matrix, search), [matrix, search]);
  const totals = useMemo(() => computeColumnTotals(visible, years), [visible, years]);

  const exportCsv = () => {
    const blob = new Blob([customerMatrixToCsv(visible, years, totals.grand)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_cliente_${tipo}_${desdeAnio}_${hastaAnio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const pct = (n: number) => (totals.grand > 0 ? `${((n / totals.grand) * 100).toFixed(1)}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente</h1>
        <p className="text-sm text-muted-foreground">
          Matriz cliente × año leída en vivo de Zoho. Importe neto, igual al informe de Zoho.
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
          <label className="text-xs text-muted-foreground">Desde año</label>
          <Select value={String(desdeAnio)} onValueChange={(v) => { if (v) setDesdeAnio(Number(v)); }}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta año</label>
          <Select value={String(hastaAnio)} onValueChange={(v) => { if (v) setHastaAnio(Number(v)); }}>
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
          <Input placeholder="Buscar cliente…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
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
                <TableHead className="sticky left-0 z-10 bg-background min-w-[240px]">Cliente</TableHead>
                {years.map((y) => <TableHead key={y} className="text-right">{y}</TableHead>)}
                <TableHead className="text-right font-bold">Total</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={years.length + 3} className="text-center text-muted-foreground py-10">
                    Sin ventas en el rango seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visible.map((r) => (
                    <TableRow key={r.customer}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">{r.customer}</TableCell>
                      {years.map((y) => (
                        <TableCell key={y} className="text-right tabular-nums">
                          {r.byYear[y] ? formatUSD(r.byYear[y]) : <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-bold">{formatUSD(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell className="sticky left-0 z-10 bg-muted/40">TOTAL ({visible.length})</TableCell>
                    {years.map((y) => (
                      <TableCell key={y} className="text-right tabular-nums">{formatUSD(totals.byYear[y])}</TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatUSD(totals.grand)}</TableCell>
                    <TableCell className="text-right tabular-nums">100%</TableCell>
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

- [ ] **Step 2:** Run `npx tsc --noEmit && npm run lint` → Expected tsc rc 0; lint 0 errores.
- [ ] **Step 3:** Commit:

```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(clientes): página matriz Ventas por cliente"
```

---

### Task 6: Entradas de menú

**Files:** Modify `src/components/layout/sidebar.tsx` y `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: sidebar**

`sidebar.tsx` ya importa `Users` de `lucide-react`. Añade el ítem al array `navItems` justo después del de `/articulos`:

```tsx
  { href: "/clientes", label: "Clientes", icon: Users },
```

- [ ] **Step 2: mobile-nav**

En `mobile-nav.tsx` añade `Users` al import de `lucide-react` y el ítem tras el de `/articulos`:

```tsx
  { href: "/clientes", label: "Clientes", icon: Users },
```

- [ ] **Step 3:** Run `npx tsc --noEmit && npm run lint` → Expected tsc rc 0; lint 0 errores.
- [ ] **Step 4:** Commit:

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(clientes): entrada de menú Clientes"
```

---

### Task 7: Build + validación

- [ ] **Step 1:** Run `npm run typecheck && npm run lint && npm test && npm run build` → Expected todo verde; ruta `/clientes` en la salida.
- [ ] **Step 2: Validación de datos (manual, vía hub).** Tras desplegar, abrir `/clientes`, tipo FAC, rango 2015→2025, comprobar que p.ej. **Consultora Endémica 2025 ≈ $209.945** y **Chemilab 2025 ≈ $185.326** (cuadra con el CSV).
- [ ] **Step 3:** `git push origin main`

---

## Notas
- **Sin fallback sin hub:** requiere `HUB_DB_URL` (sin equivalente por cliente en `sales_records`). Sin él → error boundary.
- `react-query throwOnError` global → errores suben al error boundary del dashboard.
- Deploy en EasyPanel al terminar.
