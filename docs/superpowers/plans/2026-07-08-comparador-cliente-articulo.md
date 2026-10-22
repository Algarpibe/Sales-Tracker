# Comparador de periodos — Sub-lote 3: Cliente×Artículo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modo comparación por año A/B en `/cliente-articulo` (tabla agrupada por cliente con Importe A / B / Δ%), reusando el motor `compare.ts` y `DeltaCell`.

**Architecture:** Helper puro `buildCustomerItemCompare` (une 2 años por cliente+sku, agrupa); componente `CustomerItemCompareTable` autocontenido; toggle en la página.

**Tech Stack:** Next 16, @tanstack/react-query, vitest.

---

### Task 1: Helper buildCustomerItemCompare + test (TDD)

**Files:** Create `src/lib/customer-item-compare.ts`, `src/lib/__tests__/customer-item-compare.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/customer-item-compare.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCustomerItemCompare } from "@/lib/customer-item-compare";
import type { CustomerItemRow } from "@/types/database";

const A: CustomerItemRow[] = [
  { customer: "Acme", sku: "1", marca: "M", nombre: "uno", categoria: "C", cantidad: 1, importe: 120 },
  { customer: "Acme", sku: "2", marca: null, nombre: "dos", categoria: null, cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "9", marca: null, nombre: "n", categoria: null, cantidad: 1, importe: 300 },
];
const B: CustomerItemRow[] = [
  { customer: "Acme", sku: "1", marca: "M", nombre: "uno", categoria: "C", cantidad: 1, importe: 100 },
  { customer: "Acme", sku: "3", marca: null, nombre: "tres", categoria: null, cantidad: 1, importe: 50 },
];

describe("buildCustomerItemCompare", () => {
  it("une por (cliente, sku), agrupa, totales y orden", () => {
    const groups = buildCustomerItemCompare(A, B);
    expect(groups.map((g) => g.customer)).toEqual(["Acme", "Beta"]);
    const acme = groups[0];
    expect(acme.totalA).toBe(220);
    expect(acme.totalB).toBe(150);
    const byKey = Object.fromEntries(acme.items.map((it) => [it.sku ?? it.nombre, it]));
    expect(byKey["1"]).toMatchObject({ importeA: 120, importeB: 100, deltaPct: 0.2 });
    expect(byKey["2"]).toMatchObject({ importeA: 100, importeB: 0, deltaPct: null });
    expect(byKey["3"]).toMatchObject({ importeA: 0, importeB: 50, nombre: "tres", deltaPct: -1 });
    const beta = groups[1];
    expect(beta.totalA).toBe(300);
    expect(beta.totalB).toBe(0);
    expect(beta.deltaPct).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-item-compare.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/customer-item-compare.ts`:
```ts
import type { CustomerItemRow } from "@/types/database";
import { computeDelta } from "@/lib/compare";

export interface CustomerItemComparePoint {
  sku: string | null;
  marca: string | null;
  nombre: string;
  categoria: string | null;
  importeA: number;
  importeB: number;
  deltaPct: number | null;
}

export interface CustomerCompareGroup {
  customer: string;
  items: CustomerItemComparePoint[];
  totalA: number;
  totalB: number;
  deltaPct: number | null;
}

export function buildCustomerItemCompare(rowsA: CustomerItemRow[], rowsB: CustomerItemRow[]): CustomerCompareGroup[] {
  const byCustomer = new Map<string, Map<string, CustomerItemComparePoint>>();
  const ensure = (r: CustomerItemRow): CustomerItemComparePoint => {
    let items = byCustomer.get(r.customer);
    if (!items) { items = new Map(); byCustomer.set(r.customer, items); }
    const key = r.sku ?? r.nombre;
    let p = items.get(key);
    if (!p) {
      p = { sku: r.sku, marca: r.marca, nombre: r.nombre, categoria: r.categoria, importeA: 0, importeB: 0, deltaPct: null };
      items.set(key, p);
    }
    return p;
  };
  for (const r of rowsA) ensure(r).importeA += r.importe;
  for (const r of rowsB) ensure(r).importeB += r.importe;

  const groups: CustomerCompareGroup[] = [];
  for (const [customer, itemsMap] of byCustomer) {
    const items = [...itemsMap.values()];
    for (const it of items) it.deltaPct = computeDelta(it.importeA, it.importeB).deltaPct;
    items.sort((a, b) => b.importeA - a.importeA || b.importeB - a.importeB || a.nombre.localeCompare(b.nombre));
    const totalA = items.reduce((s, it) => s + it.importeA, 0);
    const totalB = items.reduce((s, it) => s + it.importeB, 0);
    groups.push({ customer, items, totalA, totalB, deltaPct: computeDelta(totalA, totalB).deltaPct });
  }
  groups.sort((a, b) => a.customer.localeCompare(b.customer));
  return groups;
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/customer-item-compare.ts src/lib/__tests__/customer-item-compare.test.ts
git commit -m "feat(comparar): buildCustomerItemCompare (une 2 años por cliente+sku) + test"
```

---

### Task 2: Componente CustomerItemCompareTable

**Files:** Create `src/components/cliente-articulo/customer-item-compare-table.tsx`

- [ ] **Step 1: Implementar**
```tsx
"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { filterRows } from "@/lib/customer-item";
import { buildCustomerItemCompare } from "@/lib/customer-item-compare";
import { customerHref } from "@/lib/customer-detail";
import { computeDelta } from "@/lib/compare";
import { formatUSD } from "@/lib/constants";
import { DeltaCell } from "@/components/common/delta-cell";
import { SearchInput } from "@/components/common/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";

export function CustomerItemCompareTable({ tipo, yearA, yearB }: { tipo: "SALES_ORDER" | "INVOICE"; yearA: number; yearB: number }) {
  const [search, setSearch] = useState("");

  const qA = useQuery({ queryKey: ["customer-item", { tipo, anio: yearA }], queryFn: () => getCustomerItemSales({ tipo, anio: yearA }) });
  const qB = useQuery({ queryKey: ["customer-item", { tipo, anio: yearB }], queryFn: () => getCustomerItemSales({ tipo, anio: yearB }) });
  const isLoading = qA.isLoading || qB.isLoading;

  const groups = useMemo(
    () => buildCustomerItemCompare(filterRows(qA.data ?? [], search), filterRows(qB.data ?? [], search)),
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
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente, artículo o SKU…" />
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
                <TableHead className="text-right">Importe {yearA}</TableHead>
                <TableHead className="text-right">Importe {yearB}</TableHead>
                <TableHead className="text-right">Δ%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}><EmptyState message="Sin ventas en los años seleccionados." /></TableCell>
                </TableRow>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.customer}>
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={4}>
                          <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalA)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalB)}</TableCell>
                        <TableCell className="text-right tabular-nums"><DeltaCell a={g.totalA} b={g.totalB} /></TableCell>
                      </TableRow>
                      {g.items.map((it, i) => (
                        <TableRow key={`${g.customer}-${it.sku ?? it.nombre}-${i}`}>
                          <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{it.marca ?? "—"}</TableCell>
                          <TableCell>{it.nombre}</TableCell>
                          <TableCell className="text-muted-foreground">{it.categoria ?? "Sin categoría"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(it.importeA)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(it.importeB)}</TableCell>
                          <TableCell className="text-right tabular-nums"><DeltaCell a={it.importeA} b={it.importeB} /></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={4}>TOTAL ({groups.length} clientes)</TableCell>
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

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/cliente-articulo/customer-item-compare-table.tsx
git commit -m "feat(comparar): CustomerItemCompareTable (tabla agrupada por año)"
```

---

### Task 3: Integrar toggle en `cliente-articulo/page.tsx`

**Files:** Modify `src/app/(dashboard)/cliente-articulo/page.tsx`

READ el archivo. Estructura: `const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();`, `search`, la query `["customer-item", { tipo, anio }]`, "Controles servidor" (RecordTypeSelect + Select de Año), "Controles cliente" (SearchInput + ExportMenu), y la tabla agrupada.

- [ ] **Step 1: Imports** — añade:
```tsx
import { Switch } from "@/components/ui/switch";
import { CustomerItemCompareTable } from "@/components/cliente-articulo/customer-item-compare-table";
```

- [ ] **Step 2: Estado** — tras `const [search, setSearch] = useState("");` añade:
```tsx
  const [compareMode, setCompareMode] = useState(false);
  const [yearA, setYearA] = useState(anio);
  const [yearB, setYearB] = useState(anio - 1);
```

- [ ] **Step 3: Gate de la query normal** — a la `useQuery` de `["customer-item", { tipo, anio }]`, añade `enabled: !compareMode,`.

- [ ] **Step 4: Controles servidor** — reemplaza el `div` de "Controles servidor" por:
```tsx
      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <RecordTypeSelect value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
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
      </div>
```

- [ ] **Step 5: Render condicional** — envolver el bloque "Controles cliente" + el bloque `{isLoading ? Skeleton : tabla}` en:
```tsx
      {compareMode ? (
        <CustomerItemCompareTable tipo={tipo as "SALES_ORDER" | "INVOICE"} yearA={yearA} yearB={yearB} />
      ) : (
        <>
          {/* Controles cliente (bloque actual) */}
          {/* isLoading ? Skeleton : tabla (bloque actual) */}
        </>
      )}
```
Mueve el `div` de "Controles cliente" (SearchInput + ExportMenu) y todo el bloque `{isLoading ? (...) : (...)}` DENTRO del `else` (`<>...</>`), sin cambiarlos.

- [ ] **Step 6:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores, sin nuevos warnings). Confirma que en modo normal la vista es idéntica y en modo compare aparece la tabla de comparación.
- [ ] **Step 7:** Commit:
```bash
git add "src/app/(dashboard)/cliente-articulo/page.tsx"
git commit -m "feat(comparar): toggle modo comparación por año en Cliente×Artículo"
```

---

### Task 4: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Reusa `computeDelta`, `DeltaCell`, `filterRows`, `customerHref`.
- Dedup: queries A/B `["customer-item", { tipo, anio }]` (misma key que la vista normal / heatmap / detalle cuando coincide).
- Cierra el comparador (los 3 sub-lotes). Export de la comparación fuera de alcance (v1).
- Deploy en EasyPanel; validar: toggle "Comparar años" → A/B → tabla agrupada con Importe A / B / Δ% y totales por cliente.
