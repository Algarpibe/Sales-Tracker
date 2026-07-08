# Drill-down de cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/clientes/[customer]` (cliente 360) con KPIs, evolución anual, mezcla por macro-categoría, top artículos, margen y estacionalidad. Se llega haciendo clic en una fila de la matriz de Clientes.

**Architecture:** Client component que lee el nombre del cliente de la ruta y filtra client-side las actions existentes (sin SQL nuevo). Helpers puros en `customer-detail.ts` con tests. 6 cards autocontenidas (react-query, dedup con vistas de lista).

**Tech Stack:** Next 16 (App Router dynamic route), React 19, @tanstack/react-query, recharts, Tailwind, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/customer-detail.ts` (crear) | Helpers puros de filtrado/agregación por cliente. |
| `src/lib/__tests__/customer-detail.test.ts` (crear) | Tests de los helpers. |
| `src/components/customers/customer-kpi-row.tsx` (crear) | KPIs. |
| `src/components/customers/customer-evolution-card.tsx` (crear) | Evolución anual. |
| `src/components/customers/customer-bucket-mix-card.tsx` (crear) | Dona de buckets. |
| `src/components/customers/customer-top-items-card.tsx` (crear) | Top artículos. |
| `src/components/customers/customer-margin-card.tsx` (crear) | Tiles de margen. |
| `src/components/customers/customer-season-card.tsx` (crear) | Barras por mes. |
| `src/app/(dashboard)/clientes/[customer]/page.tsx` (crear) | Página: params, selectores, layout. |
| `src/app/(dashboard)/clientes/page.tsx` (mod) | Nombre de fila → `Link` al detalle. |

---

### Task 1: Helpers + tests (TDD)

**Files:** Create `src/lib/customer-detail.ts`, `src/lib/__tests__/customer-detail.test.ts`

- [ ] **Step 1: Tests (fallan)** — crear `src/lib/__tests__/customer-detail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  customerYearSeries, customerFirstYear, customerTotalVentas,
  customerBuckets, customerTopItems, customerMonths, customerMarginKpi,
} from "@/lib/customer-detail";
import type { CustomerYearRow, CustomerItemRow, CustomerMonthRow, MarginCustomerRow } from "@/types/database";

const years: CustomerYearRow[] = [
  { customer: "A", year: 2022, ventas: 100 },
  { customer: "A", year: 2021, ventas: 50 },
  { customer: "B", year: 2022, ventas: 999 },
  { customer: "A", year: 2023, ventas: 0 },
];

describe("customerYearSeries", () => {
  it("filtra al cliente y ordena por año", () => {
    expect(customerYearSeries(years, "A")).toEqual([
      { year: 2021, ventas: 50 }, { year: 2022, ventas: 100 }, { year: 2023, ventas: 0 },
    ]);
  });
});
describe("customerFirstYear", () => {
  it("min año con ventas>0", () => { expect(customerFirstYear(years, "A")).toBe(2021); });
  it("null si no hay ventas", () => { expect(customerFirstYear(years, "Z")).toBeNull(); });
});
describe("customerTotalVentas", () => {
  it("suma sus años", () => { expect(customerTotalVentas(years, "A")).toBe(150); });
});

const items: CustomerItemRow[] = [
  { customer: "A", sku: "1", marca: null, nombre: "uno", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
  { customer: "A", sku: "2", marca: null, nombre: "dos", categoria: "CAL PM", cantidad: 1, importe: 40 },
  { customer: "A", sku: "3", marca: null, nombre: "tres", categoria: "EDM180", cantidad: 1, importe: 200 },
  { customer: "B", sku: "9", marca: null, nombre: "otro", categoria: null, cantidad: 1, importe: 999 },
];

describe("customerBuckets", () => {
  it("suma por bucket del cliente", () => {
    expect(customerBuckets(items, "A")).toEqual({ mano_obra: 40, cr: 100, equipos: 200, operacion: 0, total: 340 });
  });
});
describe("customerTopItems", () => {
  it("orden desc + top n", () => {
    expect(customerTopItems(items, "A", 2)).toEqual([
      { label: "tres", sku: "3", importe: 200 }, { label: "uno", sku: "1", importe: 100 },
    ]);
  });
});

const months: CustomerMonthRow[] = [
  { customer: "A", mes: 1, importe: 100 }, { customer: "A", mes: 3, importe: 50 }, { customer: "B", mes: 6, importe: 999 },
];
describe("customerMonths", () => {
  it("array 12, índice mes-1", () => {
    const m = customerMonths(months, "A");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe(100); expect(m[2]).toBe(50); expect(m[5]).toBe(0);
  });
});

const marg: MarginCustomerRow[] = [{ customer: "A", ventas: 100, costo: 40 }];
describe("customerMarginKpi", () => {
  it("find + deriveMargin", () => {
    expect(customerMarginKpi(marg, "A")).toEqual({ ventas: 100, costo: 40, margen: 60, margenPct: 60 });
  });
  it("cliente inexistente → 0", () => {
    expect(customerMarginKpi(marg, "Z")).toEqual({ ventas: 0, costo: 0, margen: 0, margenPct: 0 });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-detail.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/customer-detail.ts`:

```ts
import type { CustomerYearRow, CustomerItemRow, CustomerMonthRow, MarginCustomerRow } from "@/types/database";
import { bucketForCategory } from "@/lib/customer-item";
import { deriveMargin } from "@/lib/analytics-margin";

export interface CustomerYearPoint { year: number; ventas: number }

export function customerYearSeries(rows: CustomerYearRow[], customer: string): CustomerYearPoint[] {
  return rows
    .filter((r) => r.customer === customer)
    .map((r) => ({ year: r.year, ventas: r.ventas }))
    .sort((a, b) => a.year - b.year);
}

export function customerFirstYear(rows: CustomerYearRow[], customer: string): number | null {
  const ys = rows.filter((r) => r.customer === customer && r.ventas > 0).map((r) => r.year);
  return ys.length ? Math.min(...ys) : null;
}

export function customerTotalVentas(rows: CustomerYearRow[], customer: string): number {
  return rows.filter((r) => r.customer === customer).reduce((s, r) => s + r.ventas, 0);
}

export interface CustomerBuckets { mano_obra: number; cr: number; equipos: number; operacion: number; total: number }

export function customerBuckets(rows: CustomerItemRow[], customer: string): CustomerBuckets {
  const acc: CustomerBuckets = { mano_obra: 0, cr: 0, equipos: 0, operacion: 0, total: 0 };
  for (const r of rows) {
    if (r.customer !== customer) continue;
    acc[bucketForCategory(r.categoria)] += r.importe;
    acc.total += r.importe;
  }
  return acc;
}

export interface CustomerItemPoint { label: string; sku: string | null; importe: number }

export function customerTopItems(rows: CustomerItemRow[], customer: string, n: number): CustomerItemPoint[] {
  return rows
    .filter((r) => r.customer === customer)
    .map((r) => ({ label: r.nombre, sku: r.sku, importe: r.importe }))
    .sort((a, b) => b.importe - a.importe || a.label.localeCompare(b.label))
    .slice(0, n);
}

export function customerMonths(rows: CustomerMonthRow[], customer: string): number[] {
  const months = new Array(12).fill(0) as number[];
  for (const r of rows) {
    if (r.customer === customer && r.mes >= 1 && r.mes <= 12) months[r.mes - 1] += r.importe;
  }
  return months;
}

export interface CustomerMarginKpi { ventas: number; costo: number; margen: number; margenPct: number }

export function customerMarginKpi(rows: MarginCustomerRow[], customer: string): CustomerMarginKpi {
  const row = rows.find((r) => r.customer === customer);
  const ventas = row?.ventas ?? 0;
  const costo = row?.costo ?? 0;
  return { ventas, costo, ...deriveMargin(ventas, costo) };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/customer-detail.test.ts` → PASS.
- [ ] **Step 5:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings).
- [ ] **Step 6:** Commit:
```bash
git add src/lib/customer-detail.ts src/lib/__tests__/customer-detail.test.ts
git commit -m "feat(cliente): helpers de detalle por cliente + tests"
```

---

### Task 2: CustomerKpiRow

**Files:** Create `src/components/customers/customer-kpi-row.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerYearSeries, customerFirstYear, customerTotalVentas, customerMarginKpi } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FIRST_YEAR = 2021;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

export function CustomerKpiRow({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const thisYear = new Date().getFullYear();
  const salesQ = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const marginQ = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });

  const kpis = useMemo(() => {
    const series = customerYearSeries(salesQ.data ?? [], customer);
    return {
      ventasAnio: series.find((s) => s.year === year)?.ventas ?? 0,
      total: customerTotalVentas(salesQ.data ?? [], customer),
      first: customerFirstYear(salesQ.data ?? [], customer),
      margenPct: customerMarginKpi(marginQ.data ?? [], customer).margenPct,
    };
  }, [salesQ.data, marginQ.data, customer, year]);

  if (salesQ.isLoading || marginQ.isLoading) return <Skeleton className="h-[92px] w-full" />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label={`Ventas ${year}`} value={formatUSD(kpis.ventasAnio)} />
      <Tile label={`Margen % ${year} (bienes)`} value={`${kpis.margenPct.toFixed(1)}%`} />
      <Tile label="Ventas histórico" value={formatUSD(kpis.total)} />
      <Tile label="Cliente desde" value={kpis.first ? String(kpis.first) : "—"} />
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-kpi-row.tsx
git commit -m "feat(cliente): CustomerKpiRow"
```

---

### Task 3: CustomerEvolutionCard

**Files:** Create `src/components/customers/customer-evolution-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { customerYearSeries } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { CustomerYearPoint } from "@/lib/customer-detail";

const FIRST_YEAR = 2021;

function EvoTooltip({ active, payload, label }: ChartTooltipProps<CustomerYearPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(payload[0]?.value ?? 0)}</span></div>
    </div>
  );
}

export function CustomerEvolutionCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const thisYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const series = useMemo(() => customerYearSeries(data ?? [], customer), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Evolución anual</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={series} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<EvoTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                {series.map((s) => (
                  <Cell key={s.year} fill={s.year === year ? "#6366f1" : "#6366f180"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-evolution-card.tsx
git commit -m "feat(cliente): CustomerEvolutionCard (evolución anual)"
```

---

### Task 4: CustomerBucketMixCard

**Files:** Create `src/components/customers/customer-bucket-mix-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { customerBuckets } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

type Slice = { name: string; value: number; color: string };

function BucketTooltip({ active, payload, total }: ChartTooltipProps<Slice> & { total: number }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  const v = p?.value ?? 0;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{p?.name}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(v)}</span></div>
      <div className="flex justify-between gap-4"><span>% del total</span><span className="font-mono">{total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</span></div>
    </div>
  );
}

export function CustomerBucketMixCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const { slices, total } = useMemo(() => {
    const b = customerBuckets(data ?? [], customer);
    return {
      slices: SERIES.map((s) => ({ name: s.label, value: b[s.key], color: s.color })).filter((s) => s.value > 0),
      total: b.total,
    };
  }, [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Mezcla por macro-categoría {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[360px] w-full" />
        ) : slices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<BucketTooltip total={total} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-bucket-mix-card.tsx
git commit -m "feat(cliente): CustomerBucketMixCard (dona de buckets)"
```

---

### Task 5: CustomerTopItemsCard

**Files:** Create `src/components/customers/customer-top-items-card.tsx`

Reusa la MISMA query key `["customer-item", { tipo, anio }]` (dedup con Task 4).

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { customerTopItems } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { CustomerItemPoint } from "@/lib/customer-detail";

function ItemTooltip({ active, payload, label }: ChartTooltipProps<CustomerItemPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.importe ?? 0)}</span></div>
    </div>
  );
}

export function CustomerTopItemsCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => customerTopItems(data ?? [], customer, 15), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Top artículos {year}</CardTitle></CardHeader>
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
              <YAxis type="category" dataKey="label" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ItemTooltip />} />
              <Bar dataKey="importe" name="Importe" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-top-items-card.tsx
git commit -m "feat(cliente): CustomerTopItemsCard (top artículos)"
```

---

### Task 6: CustomerMarginCard

**Files:** Create `src/components/customers/customer-margin-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerMarginKpi } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

export function CustomerMarginCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });
  const m = useMemo(() => customerMarginKpi(data ?? [], customer), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen {year}</CardTitle>
        <p className="text-xs text-muted-foreground">Estimado, solo bienes con costo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : m.ventas === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin bienes con costo.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Ventas (bienes)" value={formatUSD(m.ventas)} />
            <Tile label="Costo" value={formatUSD(m.costo)} />
            <Tile label="Margen" value={formatUSD(m.margen)} />
            <Tile label="Margen %" value={`${m.margenPct.toFixed(1)}%`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-margin-card.tsx
git commit -m "feat(cliente): CustomerMarginCard (tiles de margen)"
```

---

### Task 7: CustomerSeasonCard

**Files:** Create `src/components/customers/customer-season-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerMonthSales } from "@/actions/customer-month-actions";
import { customerMonths } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type MonthPoint = { mes: string; importe: number };

function MonthTooltip({ active, payload, label }: ChartTooltipProps<MonthPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(payload[0]?.value ?? 0)}</span></div>
    </div>
  );
}

export function CustomerSeasonCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-month", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerMonthSales({ tipo: recordType, anio: year }),
  });
  const rows = useMemo(() => customerMonths(data ?? [], customer).map((importe, i) => ({ mes: MESES[i], importe })), [data, customer]);
  const hasData = useMemo(() => rows.some((r) => r.importe > 0), [rows]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Estacionalidad {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="mes" className="text-[10px] fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="importe" name="Importe" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/customers/customer-season-card.tsx
git commit -m "feat(cliente): CustomerSeasonCard (estacionalidad mensual)"
```

---

### Task 8: Página de detalle + disparador (Link)

**Files:** Create `src/app/(dashboard)/clientes/[customer]/page.tsx`; Modify `src/app/(dashboard)/clientes/page.tsx`

- [ ] **Step 1: Crear la página** `src/app/(dashboard)/clientes/[customer]/page.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerKpiRow } from "@/components/customers/customer-kpi-row";
import { CustomerEvolutionCard } from "@/components/customers/customer-evolution-card";
import { CustomerBucketMixCard } from "@/components/customers/customer-bucket-mix-card";
import { CustomerTopItemsCard } from "@/components/customers/customer-top-items-card";
import { CustomerMarginCard } from "@/components/customers/customer-margin-card";
import { CustomerSeasonCard } from "@/components/customers/customer-season-card";

const FIRST_YEAR = 2021;

export default function ClienteDetallePage() {
  const params = useParams<{ customer: string }>();
  const customer = decodeURIComponent(params.customer);
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const [anio, setAnio] = useState(thisYear);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary w-fit">
          <ArrowLeft className="h-4 w-4" /> Volver a Clientes
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight break-words">{customer}</h1>
          <div className="flex flex-wrap items-end gap-3">
            <RecordTypeSelect value={tipo} onValueChange={setTipo} />
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
        </div>
      </div>

      <CustomerKpiRow customer={customer} recordType={tipo} year={anio} />
      <CustomerEvolutionCard customer={customer} recordType={tipo} year={anio} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerBucketMixCard customer={customer} recordType={tipo} year={anio} />
        <CustomerTopItemsCard customer={customer} recordType={tipo} year={anio} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerMarginCard customer={customer} recordType={tipo} year={anio} />
        <CustomerSeasonCard customer={customer} recordType={tipo} year={anio} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Disparador** — en `src/app/(dashboard)/clientes/page.tsx`: añade `import Link from "next/link";` arriba, y reemplaza la celda del nombre en la fila de datos:

Buscar:
```tsx
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">{r.customer}</TableCell>
```
Reemplazar por:
```tsx
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <Link href={`/clientes/${encodeURIComponent(r.customer)}`} className="hover:text-primary hover:underline">{r.customer}</Link>
                      </TableCell>
```

- [ ] **Step 3:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings; `clientes/page.tsx` no tenía warnings previos).
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/clientes/[customer]/page.tsx" "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(cliente): página de detalle /clientes/[customer] + enlace desde la matriz"
```

---

### Task 9: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde. Confirmar que aparece la ruta `/clientes/[customer]` en el output del build.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `react-query throwOnError` global → errores al error boundary; cards solo manejan isLoading + vacío.
- Dedup de queries: `["customer-sales",{tipo,desdeAnio,hastaAnio}]` (KpiRow + Evolution, y la lista /clientes), `["customer-item",{tipo,anio}]` (BucketMix + TopItems, y /cliente-articulo), `["margin-customer",{tipo,anio}]` (KpiRow + Margin), `["customer-month",{tipo,anio}]` (Season + heatmap C4).
- Sin SQL nuevo; se filtra client-side. Si el volumen crece, añadir consultas filtradas por cliente.
- Deploy en EasyPanel al terminar; validar clic en un cliente desde la matriz.
