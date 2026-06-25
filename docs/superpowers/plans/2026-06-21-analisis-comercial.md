# Análisis — pestaña "Comercial" (3 gráficos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña "Comercial" en `/analytics` con 3 gráficos: Mix por macro-categoría (área apilada anual), Pareto de clientes (barras + % acumulado) y Top 15 artículos ($/uds), reutilizando actions existentes.

**Architecture:** 3 cards cliente autocontenidas (lazy-load) que reutilizan `getSalesData`/`getCustomerSales`/`getItemSales` vía react-query y respetan el `recordType`/`yearA` de la página. Matemática en helpers puros testeables; regla de buckets reutilizada de `@/lib/customer-item`.

**Tech Stack:** Next 16, React 19, @tanstack/react-query, recharts, Tailwind + UI propios, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/analytics-comercial.ts` (crear) | `buildBucketMixByYear`, `buildClientPareto`, `topItems` + `BucketMixYear`, `ParetoRow`. |
| `src/lib/__tests__/analytics-comercial.test.ts` (crear) | Tests. |
| `src/components/charts/comercial/bucket-mix-card.tsx` (crear) | M2 área apilada. |
| `src/components/charts/comercial/client-pareto-card.tsx` (crear) | C2 barras + línea. |
| `src/components/charts/comercial/top-items-card.tsx` (crear) | A1 barras toggle $/uds. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | Tab "comercial" + dynamic imports. |

---

### Task 1: Helpers puros + tests (TDD)

**Files:** Create `src/lib/analytics-comercial.ts`; Test `src/lib/__tests__/analytics-comercial.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Crea `src/lib/__tests__/analytics-comercial.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBucketMixByYear, buildClientPareto, topItems } from "@/lib/analytics-comercial";
import type { CustomerYearRow, ItemSalesRow } from "@/types/database";

describe("buildBucketMixByYear", () => {
  it("filtra por tipo y año>=2021, clasifica buckets y agrega por año", () => {
    const records = [
      { categories: { name: "EDM180 Series" }, record_type: "INVOICE", record_year: 2024, amount_usd: 1000 },
      { categories: { name: "C&R EDM 180" }, record_type: "INVOICE", record_year: 2024, amount_usd: 200 },
      { categories: { name: "CAL PM" }, record_type: "INVOICE", record_year: 2025, amount_usd: 500 },
      { categories: { name: "Operación de Redes" }, record_type: "INVOICE", record_year: 2025, amount_usd: 300 },
      { categories: { name: "EDM180 Series" }, record_type: "SALES_ORDER", record_year: 2025, amount_usd: 999 },
      { categories: { name: "EDM180 Series" }, record_type: "INVOICE", record_year: 2019, amount_usd: 888 },
    ];
    const r = buildBucketMixByYear(records, "INVOICE");
    expect(r).toEqual([
      { year: 2024, mano_obra: 0, cr: 200, equipos: 1000, operacion: 0 },
      { year: 2025, mano_obra: 500, cr: 0, equipos: 0, operacion: 300 },
    ]);
  });
});

describe("buildClientPareto", () => {
  it("suma por cliente, ordena desc, % acumulado (último 100%)", () => {
    const rows: CustomerYearRow[] = [
      { customer: "A", year: 2025, ventas: 60 },
      { customer: "B", year: 2025, ventas: 30 },
      { customer: "C", year: 2025, ventas: 10 },
    ];
    const p = buildClientPareto(rows);
    expect(p.map((x) => x.customer)).toEqual(["A", "B", "C"]);
    expect(p[0].cumPct).toBeCloseTo(60);
    expect(p[1].cumPct).toBeCloseTo(90);
    expect(p[2].cumPct).toBeCloseTo(100);
  });
});

describe("topItems", () => {
  const rows: ItemSalesRow[] = [
    { item_id: "1", sku: "X", nombre: "uno", categoria: null, cantidad: 5, importe: 10 },
    { item_id: "2", sku: "Y", nombre: "dos", categoria: null, cantidad: 1, importe: 30 },
    { item_id: "3", sku: "Z", nombre: "tres", categoria: null, cantidad: 9, importe: 20 },
  ];
  it("ordena por importe y recorta", () => {
    expect(topItems(rows, "importe", 2).map((r) => r.sku)).toEqual(["Y", "Z"]);
  });
  it("ordena por cantidad", () => {
    expect(topItems(rows, "cantidad", 2).map((r) => r.sku)).toEqual(["Z", "X"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → FAIL ("Cannot find module").

- [ ] **Step 3: Implementar**

Crea `src/lib/analytics-comercial.ts`:

```ts
import { bucketForCategory } from "@/lib/customer-item";
import type { CustomerYearRow, ItemSalesRow } from "@/types/database";

export interface BucketMixYear {
  year: number;
  mano_obra: number;
  cr: number;
  equipos: number;
  operacion: number;
}

type MixRecord = {
  categories?: { name: string } | null;
  record_type: string;
  record_year: number;
  amount_usd: number;
};

export function buildBucketMixByYear(records: MixRecord[], tipo: string): BucketMixYear[] {
  const map = new Map<number, BucketMixYear>();
  for (const r of records) {
    if (r.record_type !== tipo) continue;
    if (r.record_year < 2021) continue;
    let row = map.get(r.record_year);
    if (!row) {
      row = { year: r.record_year, mano_obra: 0, cr: 0, equipos: 0, operacion: 0 };
      map.set(r.record_year, row);
    }
    row[bucketForCategory(r.categories?.name ?? null)] += r.amount_usd;
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

export interface ParetoRow {
  customer: string;
  ventas: number;
  cumPct: number;
}

export function buildClientPareto(rows: CustomerYearRow[]): ParetoRow[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.customer, (map.get(r.customer) ?? 0) + r.ventas);
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const grand = sorted.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  return sorted.map(([customer, ventas]) => {
    acc += ventas;
    return { customer, ventas, cumPct: grand > 0 ? (acc / grand) * 100 : 0 };
  });
}

export function topItems(rows: ItemSalesRow[], metric: "importe" | "cantidad", n: number): ItemSalesRow[] {
  return [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, n);
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → PASS.
- [ ] **Step 5:** Commit:

```bash
git add src/lib/analytics-comercial.ts src/lib/__tests__/analytics-comercial.test.ts
git commit -m "feat(comercial): helpers mix/pareto/top-items + tests"
```

---

### Task 2: BucketMixCard (M2)

**Files:** Create `src/components/charts/comercial/bucket-mix-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import type { SalesRecord } from "@/types/database";
import { buildBucketMixByYear } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

type MixPoint = { year: number; mano_obra: number; cr: number; equipos: number; operacion: number };

function MixTooltip({ active, payload, label }: ChartTooltipProps<MixPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketMixCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  const rows = useMemo(
    () => buildBucketMixByYear((data ?? []) as SalesRecord[], recordType),
    [data, recordType]
  );

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Mix por macro-categoría (evolución anual)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[340px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <Tooltip content={<MixTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/bucket-mix-card.tsx
git commit -m "feat(comercial): BucketMixCard (mix por macro-categoría)"
```

---

### Task 3: ClientParetoCard (C2)

**Files:** Create `src/components/charts/comercial/client-pareto-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { buildClientPareto } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ParetoPoint = { customer: string; ventas: number; cumPct: number };

function ParetoTooltip({ active, payload, label }: ChartTooltipProps<ParetoPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{(p?.cumPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function ClientParetoCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-pareto", { recordType, year }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: year, hastaAnio: year }),
  });
  const top = useMemo(() => buildClientPareto(data ?? []).slice(0, 20), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Pareto de clientes {year} (top 20)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[380px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={top} margin={{ top: 10, right: 10, left: 10, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="customer" className="text-[10px] fill-muted-foreground" interval={0} angle={-40} textAnchor="end" height={80} tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="ventas" name="Ventas" fill="oklch(0.65 0.2 255)" radius={[4, 4, 0, 0]} />
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

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/client-pareto-card.tsx
git commit -m "feat(comercial): ClientParetoCard (Pareto de clientes)"
```

---

### Task 4: TopItemsCard (A1)

**Files:** Create `src/components/charts/comercial/top-items-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { topItems } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { ItemSalesRow } from "@/types/database";

function ItemsTooltip({ active, payload, metric }: ChartTooltipProps<ItemSalesRow> & { metric: "importe" | "cantidad" }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{p?.nombre}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4">
        <span>{metric === "importe" ? "Importe" : "Cantidad"}</span>
        <span className="font-mono">{metric === "importe" ? formatUSD(p?.importe ?? 0) : (p?.cantidad ?? 0)}</span>
      </div>
    </div>
  );
}

export function TopItemsCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const [metric, setMetric] = useState<"importe" | "cantidad">("importe");
  const { data, isLoading } = useQuery({
    queryKey: ["top-items", { recordType, year }],
    queryFn: () => getItemSales({ tipo: recordType, desde: `${year}-01-01`, hasta: `${year}-12-31` }),
  });
  const top = useMemo(() => topItems(data ?? [], metric, 15), [data, metric]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Top 15 artículos {year}</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={metric === "importe" ? "default" : "outline"} onClick={() => setMetric("importe")}>$</Button>
          <Button size="sm" variant={metric === "cantidad" ? "default" : "outline"} onClick={() => setMetric("cantidad")}>Uds</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[420px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => (metric === "importe" ? formatCompactUSD(v) : String(v))} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="nombre" width={180} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ItemsTooltip metric={metric} />} />
              <Bar dataKey={metric} fill="oklch(0.7 0.18 190)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/top-items-card.tsx
git commit -m "feat(comercial): TopItemsCard (top artículos $/uds)"
```

---

### Task 5: Integrar la pestaña "Comercial" en `analytics/page.tsx`

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

LEE el archivo primero. Ya tiene: declaraciones `dynamic(...)` (con `chartSkeleton`), un `<TabsList>` con triggers `value="exploration"` y `value="forecast"`, los correspondientes `<TabsContent>`, y estado `recordType` (`"SALES_ORDER" | "INVOICE"`) + `yearA`.

- [ ] **Step 1: Añadir los 3 dynamic imports**

Junto a las otras declaraciones `const X = dynamic(...)` (después de `chartSkeleton`), añade:

```tsx
const BucketMixCard = dynamic(
  () => import("@/components/charts/comercial/bucket-mix-card").then((m) => m.BucketMixCard),
  { ssr: false, loading: chartSkeleton }
);
const ClientParetoCard = dynamic(
  () => import("@/components/charts/comercial/client-pareto-card").then((m) => m.ClientParetoCard),
  { ssr: false, loading: chartSkeleton }
);
const TopItemsCard = dynamic(
  () => import("@/components/charts/comercial/top-items-card").then((m) => m.TopItemsCard),
  { ssr: false, loading: chartSkeleton }
);
```

- [ ] **Step 2: Añadir el TabsTrigger**

En el `<TabsList>`, después del `<TabsTrigger value="forecast" …>…</TabsTrigger>`, añade (copiando las clases del trigger de forecast, ajustando el texto):

```tsx
<TabsTrigger value="comercial" className="rounded-xl px-6 h-9 font-bold data-active:bg-emerald-600 data-active:text-white flex gap-2">
  Comercial
</TabsTrigger>
```

- [ ] **Step 3: Añadir el TabsContent**

Después del `</TabsContent>` de `value="forecast"`, añade:

```tsx
<TabsContent value="comercial" className="outline-none">
  <div className="space-y-6">
    <BucketMixCard recordType={recordType} />
    <div className="grid gap-6 lg:grid-cols-2">
      <ClientParetoCard recordType={recordType} year={yearA} />
      <TopItemsCard recordType={recordType} year={yearA} />
    </div>
  </div>
</TabsContent>
```

> Nota: las 3 cards respetan el `recordType` (OV/FAC) y el año `yearA` ya existentes en la página. El selector OV/FAC vive en la tab Exploración; al cambiarlo allí, la tab Comercial usa el mismo estado.

- [ ] **Step 4:** `npx tsc --noEmit && npm run lint` → tsc rc 0; lint 0 errores.
- [ ] **Step 5:** Commit:

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(comercial): pestaña Comercial en Análisis con las 3 cards"
```

---

### Task 6: Build + verificación

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde; `/analytics` compila.
- [ ] **Step 2:** Push:

```bash
git push origin main
```

---

## Notas
- `react-query throwOnError` global → errores de las cards suben al error boundary del dashboard.
- `BucketMixCard` usa `queryKey ["sales", {}]` (mismo que la carga de la página) → react-query dedupe, sin consulta extra.
- Requiere `HUB_DB_URL`. Deploy en EasyPanel al terminar; validar abriendo Análisis → Comercial (FAC/OV, año 2025).
- `formatCompactUSD` y `formatUSD` existen en `@/lib/constants` (usados ya en otros charts).
