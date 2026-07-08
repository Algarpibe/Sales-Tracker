# Análisis Comercial — Lote 2 (A2 · M3 · A3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 gráficos más en la pestaña Comercial: Pareto de SKUs (A2), Macro-categoría × cliente (M3) y Mix por marca (A3), reutilizando actions existentes.

**Architecture:** 3 cards lazy-load autocontenidas que reutilizan `getItemSales`/`getCustomerItemSales`; matemática en helpers puros (añadidos a `analytics-comercial.ts`) con tests. Respetan `recordType`/`yearA`.

**Tech Stack:** Next 16, React 19, @tanstack/react-query, recharts, Tailwind, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/analytics-comercial.ts` (mod) | + `buildItemPareto`, `buildBrandMix`, `buildBucketByClient` + tipos. |
| `src/lib/__tests__/analytics-comercial.test.ts` (mod) | + 3 describes. |
| `src/components/charts/comercial/sku-pareto-card.tsx` (crear) | A2. |
| `src/components/charts/comercial/bucket-by-client-card.tsx` (crear) | M3. |
| `src/components/charts/comercial/brand-mix-card.tsx` (crear) | A3. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | 3 dynamic imports + 3 cards en la tab Comercial. |

---

### Task 1: Helpers + tests (TDD)

**Files:** Modify `src/lib/analytics-comercial.ts`, `src/lib/__tests__/analytics-comercial.test.ts`

- [ ] **Step 1: Añadir tests (fallan)**

En `src/lib/__tests__/analytics-comercial.test.ts`, añade a los imports desde `@/lib/analytics-comercial`:
`buildItemPareto, buildBrandMix, buildBucketByClient`; añade a los imports de tipos
`CustomerItemRow` desde `@/types/database`; y añade al final:

```ts
describe("buildItemPareto", () => {
  it("ordena desc + cumPct (último 100%)", () => {
    const rows = [
      { item_id: "1", sku: "A", nombre: "uno", categoria: null, cantidad: 1, importe: 60 },
      { item_id: "2", sku: "B", nombre: "dos", categoria: null, cantidad: 1, importe: 30 },
      { item_id: "3", sku: "C", nombre: "tres", categoria: null, cantidad: 1, importe: 10 },
    ];
    const p = buildItemPareto(rows);
    expect(p.map((x) => x.sku)).toEqual(["A", "B", "C"]);
    expect(p[0].cumPct).toBeCloseTo(60);
    expect(p[2].cumPct).toBeCloseTo(100);
  });
});

describe("buildBrandMix", () => {
  it("agrega por marca, null→Sin marca, orden desc", () => {
    const rows: CustomerItemRow[] = [
      { customer: "X", sku: "a", marca: "Horiba", nombre: "n", categoria: null, cantidad: 1, importe: 100 },
      { customer: "Y", sku: "b", marca: "Horiba", nombre: "n", categoria: null, cantidad: 1, importe: 50 },
      { customer: "Z", sku: "c", marca: null, nombre: "n", categoria: null, cantidad: 1, importe: 200 },
    ];
    expect(buildBrandMix(rows)).toEqual([
      { marca: "Sin marca", importe: 200 },
      { marca: "Horiba", importe: 150 },
    ]);
  });
});

describe("buildBucketByClient", () => {
  it("buckets por cliente + orden por total desc", () => {
    const rows: CustomerItemRow[] = [
      { customer: "A", sku: "1", marca: null, nombre: "n", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
      { customer: "A", sku: "2", marca: null, nombre: "n", categoria: "CAL PM", cantidad: 1, importe: 50 },
      { customer: "B", sku: "3", marca: null, nombre: "n", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
    ];
    const b = buildBucketByClient(rows);
    expect(b.map((x) => x.customer)).toEqual(["B", "A"]);
    expect(b[1]).toEqual({ customer: "A", mano_obra: 50, cr: 100, equipos: 0, operacion: 0, total: 150 });
    expect(b[0].equipos).toBe(500);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → FAIL (funciones no existen).

- [ ] **Step 3: Implementar los helpers**

En `src/lib/analytics-comercial.ts`, añade `CustomerItemRow` al import de tipos
(`import type { CustomerYearRow, ItemSalesRow, CustomerItemRow } from "@/types/database";`) y
añade al final del archivo:

```ts
export interface ItemParetoRow {
  label: string;
  sku: string | null;
  importe: number;
  cumPct: number;
}

export function buildItemPareto(rows: ItemSalesRow[]): ItemParetoRow[] {
  const sorted = [...rows].sort((a, b) => b.importe - a.importe || a.nombre.localeCompare(b.nombre));
  const grand = sorted.reduce((s, r) => s + r.importe, 0);
  let acc = 0;
  return sorted.map((r) => {
    acc += r.importe;
    return { label: r.nombre, sku: r.sku, importe: r.importe, cumPct: grand > 0 ? (acc / grand) * 100 : 0 };
  });
}

export interface BrandMixRow {
  marca: string;
  importe: number;
}

export function buildBrandMix(rows: CustomerItemRow[]): BrandMixRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const marca = r.marca ?? "Sin marca";
    map.set(marca, (map.get(marca) ?? 0) + r.importe);
  }
  return [...map.entries()]
    .map(([marca, importe]) => ({ marca, importe }))
    .sort((a, b) => b.importe - a.importe || a.marca.localeCompare(b.marca));
}

export interface BucketClientRow {
  customer: string;
  mano_obra: number;
  cr: number;
  equipos: number;
  operacion: number;
  total: number;
}

export function buildBucketByClient(rows: CustomerItemRow[]): BucketClientRow[] {
  const map = new Map<string, BucketClientRow>();
  for (const r of rows) {
    let row = map.get(r.customer);
    if (!row) {
      row = { customer: r.customer, mano_obra: 0, cr: 0, equipos: 0, operacion: 0, total: 0 };
      map.set(r.customer, row);
    }
    row[bucketForCategory(r.categoria)] += r.importe;
    row.total += r.importe;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.customer.localeCompare(b.customer));
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → PASS.
- [ ] **Step 5:** Commit:

```bash
git add src/lib/analytics-comercial.ts src/lib/__tests__/analytics-comercial.test.ts
git commit -m "feat(comercial): helpers pareto SKUs / mix marca / bucket×cliente + tests"
```

---

### Task 2: SkuParetoCard (A2)

**Files:** Create `src/components/charts/comercial/sku-pareto-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { buildItemPareto } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ParetoPoint = { label: string; sku: string | null; importe: number; cumPct: number };

function ParetoTooltip({ active, payload }: ChartTooltipProps<ParetoPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{p?.label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.importe ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{(p?.cumPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function SkuParetoCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["top-items", { recordType, year }],
    queryFn: () => getItemSales({ tipo: recordType, desde: `${year}-01-01`, hasta: `${year}-12-31` }),
  });
  const top = useMemo(() => buildItemPareto(data ?? []).slice(0, 30), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Pareto de SKUs {year} (top 30)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={top} margin={{ top: 10, right: 10, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="label" className="text-[9px] fill-muted-foreground" interval={0} angle={-45} textAnchor="end" height={90} tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="importe" name="Importe" fill="oklch(0.65 0.2 255)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → 0/0.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/sku-pareto-card.tsx
git commit -m "feat(comercial): SkuParetoCard (Pareto de SKUs)"
```

---

### Task 3: BucketByClientCard (M3)

**Files:** Create `src/components/charts/comercial/bucket-by-client-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { buildBucketByClient } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

type BClientPoint = { customer: string; mano_obra: number; cr: number; equipos: number; operacion: number; total: number };

function BClientTooltip({ active, payload, label }: ChartTooltipProps<BClientPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketByClientCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => buildBucketByClient(data ?? []).slice(0, 15), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Macro-categoría × cliente {year} (top 15)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<BClientTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → 0/0.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/bucket-by-client-card.tsx
git commit -m "feat(comercial): BucketByClientCard (macro-categoría × cliente)"
```

---

### Task 4: BrandMixCard (A3)

**Files:** Create `src/components/charts/comercial/brand-mix-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { buildBrandMix } from "@/lib/analytics-comercial";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];
const OTROS_COLOR = "#94a3b8";

type BrandPoint = { marca: string; importe: number };

function BrandTooltip({ active, payload, total }: ChartTooltipProps<BrandPoint> & { total: number }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  const v = p?.importe ?? 0;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{p?.marca}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(v)}</span></div>
      <div className="flex justify-between gap-4"><span>% del total</span><span className="font-mono">{total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</span></div>
    </div>
  );
}

export function BrandMixCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const { slices, total } = useMemo(() => {
    const all = buildBrandMix(data ?? []);
    const top = all.slice(0, 8);
    const restSum = all.slice(8).reduce((s, r) => s + r.importe, 0);
    return {
      slices: restSum > 0 ? [...top, { marca: "Otros", importe: restSum }] : top,
      total: all.reduce((s, r) => s + r.importe, 0),
    };
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Mix por marca {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : slices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <PieChart>
              <Pie data={slices} dataKey="importe" nameKey="marca" cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={2}>
                {slices.map((s, i) => (
                  <Cell key={s.marca} fill={s.marca === "Otros" ? OTROS_COLOR : PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<BrandTooltip total={total} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → 0/0.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/brand-mix-card.tsx
git commit -m "feat(comercial): BrandMixCard (mix por marca)"
```

---

### Task 5: Integrar en `analytics/page.tsx`

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

LEE el archivo. Ya tiene `chartSkeleton`, los `dynamic(...)` de `BucketMixCard`/`ClientParetoCard`/`TopItemsCard`, y el `<TabsContent value="comercial">` con esas 3 cards.

- [ ] **Step 1: 3 dynamic imports** (junto a los de comercial existentes):

```tsx
const SkuParetoCard = dynamic(
  () => import("@/components/charts/comercial/sku-pareto-card").then((m) => m.SkuParetoCard),
  { ssr: false, loading: chartSkeleton }
);
const BucketByClientCard = dynamic(
  () => import("@/components/charts/comercial/bucket-by-client-card").then((m) => m.BucketByClientCard),
  { ssr: false, loading: chartSkeleton }
);
const BrandMixCard = dynamic(
  () => import("@/components/charts/comercial/brand-mix-card").then((m) => m.BrandMixCard),
  { ssr: false, loading: chartSkeleton }
);
```

- [ ] **Step 2: Añadir las 3 cards** dentro de `<TabsContent value="comercial">`, tras el bloque
  de `<ClientParetoCard/>` + `<TopItemsCard/>` (dentro del mismo `<div className="space-y-6">`):

```tsx
    <SkuParetoCard recordType={recordType} year={yearA} />
    <div className="grid gap-6 lg:grid-cols-2">
      <BucketByClientCard recordType={recordType} year={yearA} />
      <BrandMixCard recordType={recordType} year={yearA} />
    </div>
```

- [ ] **Step 3:** `npx tsc --noEmit && npm run lint` → 0/0.
- [ ] **Step 4:** Commit:

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(comercial): añadir A2/M3/A3 a la pestaña Comercial"
```

---

### Task 6: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `react-query throwOnError` global → errores al error boundary.
- Dedup: A2 comparte key `["top-items", {recordType, year}]` con `TopItemsCard`; M3/A3 comparten `["customer-item", {tipo, anio}]` con `cliente-articulo` → sin consultas extra.
- Colores consistentes con el resto de Comercial (buckets) + paleta categórica para marca.
- Deploy en EasyPanel al terminar; validar en Análisis → Comercial (FAC 2025).
