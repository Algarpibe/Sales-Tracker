# Comparador de periodos — Sub-lote 2: Artículos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modo comparación por año A/B en `/articulos` (Importe A / B / Δ%), reusando el motor `compare.ts`.

**Architecture:** Helper puro `buildItemCompare` (une 2 años por item_id); `DeltaCell` compartido; componente `ItemCompareTable` autocontenido; toggle en la página.

**Tech Stack:** Next 16, @tanstack/react-query, vitest.

---

### Task 1: Helper buildItemCompare + test (TDD)

**Files:** Create `src/lib/item-compare.ts`, `src/lib/__tests__/item-compare.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/item-compare.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildItemCompare } from "@/lib/item-compare";
import type { ItemSalesRow } from "@/types/database";

const A: ItemSalesRow[] = [
  { item_id: "1", sku: "A1", nombre: "uno", categoria: "C", cantidad: 1, importe: 120 },
  { item_id: "2", sku: "A2", nombre: "dos", categoria: null, cantidad: 1, importe: 100 },
];
const B: ItemSalesRow[] = [
  { item_id: "1", sku: "A1", nombre: "uno", categoria: "C", cantidad: 1, importe: 100 },
  { item_id: "3", sku: "A3", nombre: "tres", categoria: null, cantidad: 1, importe: 50 },
];

describe("buildItemCompare", () => {
  it("une por item_id; solo-A y solo-B con 0; deltaPct", () => {
    const rows = buildItemCompare(A, B);
    const byId = Object.fromEntries(rows.map((r) => [r.item_id, r]));
    expect(byId["1"]).toMatchObject({ importeA: 120, importeB: 100, deltaPct: 0.2 });
    expect(byId["2"]).toMatchObject({ importeA: 100, importeB: 0, deltaPct: null }); // B=0 → null
    expect(byId["3"]).toMatchObject({ importeA: 0, importeB: 50, nombre: "tres", deltaPct: -1 });
    expect(rows).toHaveLength(3);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/item-compare.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/item-compare.ts`:
```ts
import type { ItemSalesRow } from "@/types/database";
import { computeDelta } from "@/lib/compare";

export interface ItemCompareRow {
  item_id: string;
  sku: string | null;
  nombre: string;
  categoria: string | null;
  importeA: number;
  importeB: number;
  deltaPct: number | null;
}

export function buildItemCompare(rowsA: ItemSalesRow[], rowsB: ItemSalesRow[]): ItemCompareRow[] {
  const map = new Map<string, ItemCompareRow>();
  const ensure = (r: ItemSalesRow): ItemCompareRow => {
    let row = map.get(r.item_id);
    if (!row) {
      row = { item_id: r.item_id, sku: r.sku, nombre: r.nombre, categoria: r.categoria, importeA: 0, importeB: 0, deltaPct: null };
      map.set(r.item_id, row);
    }
    return row;
  };
  for (const r of rowsA) ensure(r).importeA += r.importe;
  for (const r of rowsB) ensure(r).importeB += r.importe;
  for (const row of map.values()) row.deltaPct = computeDelta(row.importeA, row.importeB).deltaPct;
  return [...map.values()];
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/item-compare.ts src/lib/__tests__/item-compare.test.ts
git commit -m "feat(comparar): buildItemCompare (une 2 años por item) + test"
```

---

### Task 2: DeltaCell compartido (extraer de Clientes)

**Files:** Create `src/components/common/delta-cell.tsx`; Modify `src/app/(dashboard)/clientes/page.tsx`

- [ ] **Step 1: Crear** `src/components/common/delta-cell.tsx`:
```tsx
"use client";

import { computeDelta, formatDeltaPct } from "@/lib/compare";

// Celda de variación coloreada (verde ↑ / rojo ↓ / neutro).
export function DeltaCell({ a, b }: { a: number; b: number }) {
  const p = computeDelta(a, b).deltaPct;
  const cls = p === null || p === 0 ? "text-muted-foreground" : p > 0 ? "text-emerald-500" : "text-rose-500";
  return <span className={cls}>{formatDeltaPct(p)}</span>;
}
```

- [ ] **Step 2: Actualizar clientes** — en `src/app/(dashboard)/clientes/page.tsx`:
  - Quita el `import { computeDelta, formatDeltaPct } from "@/lib/compare";` (quedará sin uso).
  - Añade `import { DeltaCell } from "@/components/common/delta-cell";`.
  - Elimina el componente local `function DeltaCell(...) {...}` (las ~4 líneas). El JSX `<DeltaCell a=.. b=.. />` no cambia.

- [ ] **Step 3:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings; verifica que no quedó `computeDelta`/`formatDeltaPct` sin usar en clientes).
- [ ] **Step 4:** Commit:
```bash
git add src/components/common/delta-cell.tsx "src/app/(dashboard)/clientes/page.tsx"
git commit -m "refactor(comparar): DeltaCell compartido en components/common"
```

---

### Task 3: Componente ItemCompareTable

**Files:** Create `src/components/articulos/item-compare-table.tsx`

- [ ] **Step 1: Implementar** (READ `src/app/(dashboard)/articulos/page.tsx` para el `SortableTh`/estilo de tabla; el orden y filtro se replican aquí para las filas de comparación):
```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { buildItemCompare, type ItemCompareRow } from "@/lib/item-compare";
import { formatUSD } from "@/lib/constants";
import { DeltaCell } from "@/components/common/delta-cell";
import { SearchInput } from "@/components/common/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CompareSortKey = "sku" | "nombre" | "categoria" | "importeA" | "importeB" | "delta";
type Dir = "asc" | "desc";

const SIN_CAT = "Sin categoría";
const catLabel = (r: ItemCompareRow) => r.categoria ?? SIN_CAT;

function Th({ k, label, right, sortKey, sortDir, onSort }: {
  k: CompareSortKey; label: string; right?: boolean;
  sortKey: CompareSortKey; sortDir: Dir; onSort: (k: CompareSortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-primary", right && "flex-row-reverse")}>
        {label}
        {active ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

export function ItemCompareTable({ tipo, yearA, yearB }: { tipo: "SALES_ORDER" | "INVOICE"; yearA: number; yearB: number }) {
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<CompareSortKey>("importeA");
  const [sortDir, setSortDir] = useState<Dir>("desc");

  const qA = useQuery({
    queryKey: ["item-sales", { tipo, desde: `${yearA}-01-01`, hasta: `${yearA}-12-31` }],
    queryFn: () => getItemSales({ tipo, desde: `${yearA}-01-01`, hasta: `${yearA}-12-31` }),
  });
  const qB = useQuery({
    queryKey: ["item-sales", { tipo, desde: `${yearB}-01-01`, hasta: `${yearB}-12-31` }],
    queryFn: () => getItemSales({ tipo, desde: `${yearB}-01-01`, hasta: `${yearB}-12-31` }),
  });
  const isLoading = qA.isLoading || qB.isLoading;

  const rows = useMemo(() => buildItemCompare(qA.data ?? [], qB.data ?? []), [qA.data, qB.data]);
  const categorias = useMemo(() => Array.from(new Set(rows.map(catLabel))).sort(), [rows]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const matchS = !q || (r.sku ?? "").toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q);
      const matchC = !categoria || catLabel(r) === categoria;
      return matchS && matchC;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: ItemCompareRow): string | number => {
      switch (sortKey) {
        case "sku": return r.sku ?? "";
        case "nombre": return r.nombre;
        case "categoria": return catLabel(r);
        case "importeA": return r.importeA;
        case "importeB": return r.importeB;
        case "delta": return r.deltaPct ?? -Infinity;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, categoria, sortKey, sortDir]);

  const onSort = (k: CompareSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por SKU o nombre…" />
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(!v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : view.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Th k="sku" label="SKU" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="nombre" label="Nombre" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="categoria" label="Categoría" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="importeA" label={`Importe ${yearA}`} right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="importeB" label={`Importe ${yearB}`} right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="delta" label="Δ%" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.map((r) => (
                <TableRow key={r.item_id}>
                  <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{catLabel(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUSD(r.importeA)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUSD(r.importeB)}</TableCell>
                  <TableCell className="text-right tabular-nums"><DeltaCell a={r.importeA} b={r.importeB} /></TableCell>
                </TableRow>
              ))}
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
git add src/components/articulos/item-compare-table.tsx
git commit -m "feat(comparar): ItemCompareTable (tabla comparación por año)"
```

---

### Task 4: Integrar toggle en `articulos/page.tsx`

**Files:** Modify `src/app/(dashboard)/articulos/page.tsx`

READ el archivo. Recuerda su estructura: `ArticulosContent` con `const { tipo, setTipo } = usePeriod()`, estado desde/hasta/search/categoria/sortKey/sortDir, la query `["item-sales",{tipo,desde,hasta}]`, y el JSX: "Controles servidor" (RecordTypeSelect + Desde/Hasta), "Controles cliente" (SearchInput + categoría + ExportMenu), y la tabla.

- [ ] **Step 1: Imports** — añade:
```tsx
import { Switch } from "@/components/ui/switch";
import { ItemCompareTable } from "@/components/articulos/item-compare-table";
```

- [ ] **Step 2: Estado** — cambia `const { tipo, setTipo } = usePeriod();` por `const { tipo, setTipo, year } = usePeriod();`. Tras el estado de sortDir (dentro de `ArticulosContent`), añade:
```tsx
  const [compareMode, setCompareMode] = useState(false);
  const [yearA, setYearA] = useState(year);
  const [yearB, setYearB] = useState(year - 1);
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = 2021; y <= new Date().getFullYear(); y++) a.push(y);
    return a;
  }, []);
```

- [ ] **Step 3: Gate de la query normal** — a la `useQuery` de `["item-sales", { tipo, desde, hasta }]`, añade `enabled: !compareMode,` (no pedir en modo comparación).

- [ ] **Step 4: Controles servidor** — reemplaza el `div` de "Controles servidor: tipo + rango de fechas" por:
```tsx
      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <RecordTypeSelect value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
        {!compareMode ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={desde} min="2021-01-01" max={hasta} onChange={(e) => setDesde(e.target.value)} className="w-[160px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={hasta} min={desde < "2021-01-01" ? "2021-01-01" : desde} onChange={(e) => setHasta(e.target.value)} className="w-[160px]" />
            </div>
          </>
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

- [ ] **Step 5: Render condicional** — envolver el bloque "Controles cliente" + el bloque `isLoading ? Skeleton : tabla` en un condicional. Es decir, tras el `div` de Controles servidor, el resto del contenido queda:
```tsx
      {compareMode ? (
        <ItemCompareTable tipo={tipo as "SALES_ORDER" | "INVOICE"} yearA={yearA} yearB={yearB} />
      ) : (
        <>
          {/* Controles cliente: búsqueda + categoría + export (el bloque actual) */}
          {/* isLoading ? Skeleton : tabla (el bloque actual) */}
        </>
      )}
```
Mueve el `div` de "Controles cliente" (SearchInput + categoría + ExportMenu) y todo el bloque `{isLoading ? (...) : (...)}` de la tabla DENTRO del `else` (`<>...</>`), sin cambiarlos.

- [ ] **Step 6:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores, sin nuevos warnings). Confirma que en modo normal la vista es idéntica y en modo compare aparece `ItemCompareTable`.
- [ ] **Step 7:** Commit:
```bash
git add "src/app/(dashboard)/articulos/page.tsx"
git commit -m "feat(comparar): toggle modo comparación por año en Artículos"
```

---

### Task 5: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Reusa `computeDelta`/`formatDeltaPct` (motor) y el `DeltaCell` compartido.
- Dedup: las queries A/B usan `["item-sales", {tipo, desde, hasta}]` (misma key que la vista normal cuando el rango coincide).
- Export de la comparación fuera de alcance (v1): el menú Exportar solo aparece en modo normal.
- Deploy en EasyPanel; validar: toggle "Comparar años" → elegir A/B → Importe A / B / Δ% coloreado, con búsqueda/categoría/orden.
