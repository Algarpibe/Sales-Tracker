# Dashboard General — nuevas visualizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la sección de backlog del Dashboard General por KPIs con Δ interanual, curva acumulada YoY, % ejecución mensual, Top clientes (Pareto) y mix por macro-categoría.

**Architecture:** Funciones puras testeadas (`dashboard-insights.ts`) + 4 componentes recharts + reescritura de `home/page.tsx`. Datos: `getSalesData({year})` + `getSalesData({year-1})` + `getCustomerSales`. Sin tablas ni migraciones.

**Tech Stack:** Next 16, react-query, recharts, vitest.

Contexto verificado:
- `KPICard` (`src/components/cards/kpi-card.tsx`) ya acepta `change?: number` → flecha ▲▼ + "vs. periodo anterior".
- `RecordTypeSelect` (`src/components/common/record-type-select.tsx`): props `value: "SALES_ORDER"|"INVOICE"`, `onValueChange`, `className`.
- `getCustomerSales({tipo, desdeAnio, hastaAnio})` → `CustomerYearRow[] {customer, year, ventas}`.
- `bucketForCategory(categoria: string|null): Bucket`, `BUCKET_LABELS`, colores `#6366f1 #10b981 #f59e0b #ef4444` (mano_obra/cr/equipos/operacion).
- `MONTHS` = `[{value:1,label:"Ene",...}, …]` (12). `formatUSD`, `formatCompactUSD`, `getYearRange` en `@/lib/constants`.
- `ChartTooltipProps<P>` en `@/lib/chart-types`. Patrón recharts+Card en `bar-chart-monthly.tsx`; ComposedChart doble eje en `charts/comercial/new-vs-recurring-card.tsx`.
- `computeDashboardMetrics(records, cats)` da `{sales_orders, invoices, avg_ticket, execution_rate, monthly:[{month,sales_orders,invoices}]}`.

---

### Task 1: Lib `dashboard-insights.ts` + tests (TDD)

**Files:** Create `src/lib/dashboard-insights.ts`, `src/lib/__tests__/dashboard-insights.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/dashboard-insights.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cumulativeSeries, executionByMonth, bucketMix, topCustomers, yoyChange } from "@/lib/dashboard-insights";

const rec = (record_type: string, record_month: number, amount_usd: number, category_id = "c1") =>
  ({ category_id, record_type, record_month, amount_usd });

describe("cumulativeSeries", () => {
  it("running total por record_type, longitud 12, meses vacíos mantienen acumulado", () => {
    const s = cumulativeSeries([rec("INVOICE", 1, 100), rec("INVOICE", 3, 50), rec("SALES_ORDER", 1, 999)], "INVOICE");
    expect(s).toHaveLength(12);
    expect(s[0]).toBe(100);
    expect(s[1]).toBe(100);
    expect(s[2]).toBe(150);
    expect(s[11]).toBe(150);
  });
});

describe("executionByMonth", () => {
  it("pct = inv/ov*100; OV=0 → 0", () => {
    const r = executionByMonth([
      { month: "Ene", sales_orders: 200, invoices: 100 },
      { month: "Feb", sales_orders: 0, invoices: 50 },
    ]);
    expect(r[0].pct).toBe(50);
    expect(r[1].pct).toBe(0);
  });
});

describe("bucketMix", () => {
  it("agrega por bucket; 4 entradas; pct suma ~100; filtra record_type", () => {
    const cats = new Map([["c1", "C&R Algo"], ["c2", "Equipos X"]]);
    const mix = bucketMix([rec("INVOICE", 1, 100, "c1"), rec("INVOICE", 2, 300, "c2"), rec("SALES_ORDER", 1, 999, "c1")], cats, "INVOICE");
    expect(mix).toHaveLength(4);
    expect(mix.find((m) => m.bucket === "cr")!.amount).toBe(100);
    expect(mix.find((m) => m.bucket === "equipos")!.amount).toBe(300);
    expect(Math.round(mix.reduce((s, m) => s + m.pct, 0))).toBe(100);
  });
});

describe("topCustomers", () => {
  it("ordena desc, agrega duplicados, cumPct llega a 100 con todos", () => {
    const rows = [
      { customer: "A", ventas: 100 }, { customer: "B", ventas: 300 },
      { customer: "A", ventas: 100 }, { customer: "C", ventas: 100 },
    ];
    const top = topCustomers(rows, 3);
    expect(top.map((t) => t.customer)).toEqual(["B", "A", "C"]);
    expect(top[1].amount).toBe(200);
    expect(Math.round(top[2].cumPct)).toBe(100);
  });
  it("respeta N", () => {
    expect(topCustomers([{ customer: "A", ventas: 1 }, { customer: "B", ventas: 2 }, { customer: "C", ventas: 3 }], 2)).toHaveLength(2);
  });
});

describe("yoyChange", () => {
  it("(a-b)/b*100; b<=0 → null", () => {
    expect(yoyChange(120, 100)).toBeCloseTo(20);
    expect(yoyChange(80, 100)).toBeCloseTo(-20);
    expect(yoyChange(100, 0)).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/dashboard-insights.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — crear `src/lib/dashboard-insights.ts`:
```ts
import { bucketForCategory, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";

export type InsightRecord = {
  category_id: string;
  record_type: string;
  record_month: number;
  amount_usd: number | string;
};

// Serie acumulada length-12 (índice 0 = Ene) del record_type dado.
export function cumulativeSeries(records: InsightRecord[], recordType: string): number[] {
  const monthly = new Array<number>(12).fill(0);
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const m = r.record_month;
    if (m >= 1 && m <= 12) monthly[m - 1] += Number(r.amount_usd);
  }
  const cum: number[] = [];
  let run = 0;
  for (let i = 0; i < 12; i++) { run += monthly[i]; cum.push(run); }
  return cum;
}

export function executionByMonth(
  monthly: { month: string; sales_orders: number; invoices: number }[]
): { month: string; pct: number }[] {
  return monthly.map((m) => ({
    month: m.month,
    pct: m.sales_orders > 0 ? (m.invoices / m.sales_orders) * 100 : 0,
  }));
}

export function bucketMix(
  records: InsightRecord[],
  catMap: Map<string, string>,
  recordType: string
): { bucket: Bucket; label: string; amount: number; pct: number }[] {
  const order: Bucket[] = ["mano_obra", "cr", "equipos", "operacion"];
  const sums = new Map<Bucket, number>(order.map((b) => [b, 0]));
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const b = bucketForCategory(catMap.get(r.category_id) ?? null);
    const amt = Number(r.amount_usd);
    sums.set(b, (sums.get(b) ?? 0) + amt);
    total += amt;
  }
  return order.map((b) => {
    const amount = sums.get(b) ?? 0;
    return { bucket: b, label: BUCKET_LABELS[b], amount, pct: total > 0 ? (amount / total) * 100 : 0 };
  });
}

// Top N clientes por ventas + % acumulado sobre el total GENERAL (Pareto).
export function topCustomers(
  rows: { customer: string; ventas: number }[],
  n: number
): { customer: string; amount: number; cumPct: number }[] {
  const byCustomer = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const v = Number(r.ventas);
    byCustomer.set(r.customer, (byCustomer.get(r.customer) ?? 0) + v);
    total += v;
  }
  const sorted = Array.from(byCustomer.entries())
    .map(([customer, amount]) => ({ customer, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
  let run = 0;
  return sorted.map((r) => {
    run += r.amount;
    return { customer: r.customer, amount: r.amount, cumPct: total > 0 ? (run / total) * 100 : 0 };
  });
}

export function yoyChange(a: number, b: number): number | null {
  if (b <= 0) return null;
  return ((a - b) / b) * 100;
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint` (≤10 warnings).
- [ ] **Step 5:** Commit:
```bash
git add src/lib/dashboard-insights.ts src/lib/__tests__/dashboard-insights.test.ts
git commit -m "feat(dashboard): dashboard-insights (cumulative/execution/bucketMix/topCustomers/yoy) + tests"
```

---

### Task 2: Componente CumulativeYoYChart

**Files:** Create `src/components/charts/dashboard/cumulative-yoy-chart.tsx`

- [ ] **Step 1: Implementar** (patrón recharts+Card de `bar-chart-monthly.tsx`):
```tsx
"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MONTHS, formatCompactUSD, formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { cumulativeSeries, type InsightRecord } from "@/lib/dashboard-insights";
import type { ChartTooltipProps } from "@/lib/chart-types";

type CumPoint = { month: string; actual: number; anterior: number };

function CumTooltip({ active, payload, label }: ChartTooltipProps<CumPoint>) {
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

export function CumulativeYoYChart({
  current, previous, yearActual, yearPrev,
}: {
  current: InsightRecord[];
  previous: InsightRecord[];
  yearActual: number;
  yearPrev: number;
}) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const data = useMemo<CumPoint[]>(() => {
    const cur = cumulativeSeries(current, tipo);
    const prev = cumulativeSeries(previous, tipo);
    return MONTHS.map((m, i) => ({ month: m.label, actual: cur[i], anterior: prev[i] }));
  }, [current, previous, tipo]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">Acumulado {yearActual} vs {yearPrev}</CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
            <XAxis dataKey="month" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
            <Tooltip content={<CumTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="actual" name={String(yearActual)} stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="anterior" name={String(yearPrev)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/charts/dashboard/cumulative-yoy-chart.tsx
git commit -m "feat(dashboard): CumulativeYoYChart (acumulado año actual vs anterior, toggle OV/FAC)"
```

---

### Task 3: Componente ExecutionMonthlyChart

**Files:** Create `src/components/charts/dashboard/execution-monthly-chart.tsx`

- [ ] **Step 1: Implementar** (la ejecución puede superar 100% en un mes → dominio con techo dinámico):
```tsx
"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { executionByMonth } from "@/lib/dashboard-insights";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ExecPoint = { month: string; pct: number };

function ExecTooltip({ active, payload, label }: ChartTooltipProps<ExecPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="font-mono">{Math.round(payload[0].value ?? 0)}% ejecución</div>
    </div>
  );
}

export function ExecutionMonthlyChart({
  monthly,
}: {
  monthly: { month: string; sales_orders: number; invoices: number }[];
}) {
  const data = useMemo(() => executionByMonth(monthly), [monthly]);
  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">% Ejecución mensual (OV→FAC)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
            <XAxis dataKey="month" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis
              domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 25) * 25)]}
              tickFormatter={(v) => `${Math.round(v)}%`}
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ExecTooltip />} />
            <Line type="monotone" dataKey="pct" name="Ejecución" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/charts/dashboard/execution-monthly-chart.tsx
git commit -m "feat(dashboard): ExecutionMonthlyChart (% ejecución OV→FAC por mes)"
```

---

### Task 4: Componente TopCustomersPareto

**Files:** Create `src/components/charts/dashboard/top-customers-pareto.tsx`

- [ ] **Step 1: Implementar** (ComposedChart doble eje, patrón de `new-vs-recurring-card.tsx`; query propia por tipo):
```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { topCustomers } from "@/lib/dashboard-insights";
import { formatCompactUSD, formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ParetoPoint = { customer: string; amount: number; cumPct: number };

function ParetoTooltip({ active, payload, label }: ChartTooltipProps<ParetoPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.amount ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{Math.round(p?.cumPct ?? 0)}%</span></div>
    </div>
  );
}

export function TopCustomersPareto({ year }: { year: number }) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales-top", { tipo, year }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio: year, hastaAnio: year }),
  });
  const rows = useMemo(
    () => topCustomers((data ?? []).map((r) => ({ customer: r.customer, ventas: r.ventas })), 10),
    [data]
  );

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">Top 10 clientes · Pareto</CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[340px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="customer" className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${Math.round(v)}%`} className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="amount" name="Importe" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
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
git add src/components/charts/dashboard/top-customers-pareto.tsx
git commit -m "feat(dashboard): TopCustomersPareto (top 10 + % acumulado, toggle OV/FAC)"
```

---

### Task 5: Componente CategoryMixDonut

**Files:** Create `src/components/charts/dashboard/category-mix-donut.tsx`

- [ ] **Step 1: Implementar** (PieChart donut, colores de bucket):
```tsx
"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bucketMix, type InsightRecord } from "@/lib/dashboard-insights";
import { formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import type { ChartTooltipProps } from "@/lib/chart-types";

const COLORS: Record<string, string> = {
  mano_obra: "#6366f1", cr: "#10b981", equipos: "#f59e0b", operacion: "#ef4444",
};

type MixSlice = { bucket: string; label: string; amount: number; pct: number };

function MixTooltip({ active, payload }: ChartTooltipProps<MixSlice>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold">{p.label}</div>
      <div className="font-mono">{formatUSD(p.amount)} · {Math.round(p.pct)}%</div>
    </div>
  );
}

export function CategoryMixDonut({
  records, catMap,
}: {
  records: InsightRecord[];
  catMap: Map<string, string>;
}) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const mix = useMemo(
    () => bucketMix(records, catMap, tipo).filter((m) => m.amount > 0),
    [records, catMap, tipo]
  );

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">Mix por macro-categoría</CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent>
        {mix.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={mix} dataKey="amount" nameKey="label" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {mix.map((m) => <Cell key={m.bucket} fill={COLORS[m.bucket]} />)}
              </Pie>
              <Tooltip content={<MixTooltip />} />
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
git add src/components/charts/dashboard/category-mix-donut.tsx
git commit -m "feat(dashboard): CategoryMixDonut (mix 4 buckets, toggle OV/FAC)"
```

---

### Task 6: Reescribir `home/page.tsx` (KPIs YoY + ensamblar + quitar backlog)

**Files:** Modify `src/app/(dashboard)/home/page.tsx`

READ el archivo actual. Reemplázalo COMPLETO por lo siguiente. Cambios: +query año anterior, +`metricsPrev`/`catMap`, KPIs con `change`, nuevas gráficas, y se ELIMINA la sección de backlog y el uso de `KPIDashboardSection` (el componente NO se borra: puede usarse en otras vistas).

```tsx
"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, FileText, Receipt, Activity } from "lucide-react";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { KPICard } from "@/components/cards/kpi-card";
import { getSalesData } from "@/actions/sales-actions";
import { getCategories } from "@/actions/category-actions";
import { getYearRange, formatUSD } from "@/lib/constants";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";
import { yoyChange, type InsightRecord } from "@/lib/dashboard-insights";
import { CumulativeYoYChart } from "@/components/charts/dashboard/cumulative-yoy-chart";
import { ExecutionMonthlyChart } from "@/components/charts/dashboard/execution-monthly-chart";
import { TopCustomersPareto } from "@/components/charts/dashboard/top-customers-pareto";
import { CategoryMixDonut } from "@/components/charts/dashboard/category-mix-donut";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function HomePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["SALES_ORDER", "INVOICE"]);

  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", { year }],
    queryFn: () => getSalesData({ year }),
  });
  const { data: prevData, isLoading: l1b } = useQuery({
    queryKey: ["sales", { year: year - 1 }],
    queryFn: () => getSalesData({ year: year - 1 }),
  });
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const isLoading = l1 || l1b || l2;

  const handleTypeToggle = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const metrics = useMemo(
    () => computeDashboardMetrics(recordsData ?? [], catsData ?? []),
    [recordsData, catsData]
  );
  const metricsPrev = useMemo(
    () => computeDashboardMetrics(prevData ?? [], catsData ?? []),
    [prevData, catsData]
  );
  const catMap = useMemo(
    () => new Map((catsData ?? []).map((c) => [c.id, c.name] as [string, string])),
    [catsData]
  );

  const chartData = useMemo(() => {
    return metrics.monthly.map((m) => ({
      month: m.month,
      sales_orders: selectedTypes.includes("SALES_ORDER") ? m.sales_orders : 0,
      invoices: selectedTypes.includes("INVOICE") ? m.invoices : 0,
    }));
  }, [metrics.monthly, selectedTypes]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 pb-20">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard General</h1>
          <p className="text-muted-foreground mt-1">Vista centralizada de métricas y rendimiento para el año {year}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 bg-card/50 px-4 py-2 rounded-lg border border-border/50 backdrop-blur-sm shadow-sm">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 font-semibold bg-transparent">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>Año {y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sección 1: KPIs con Δ interanual */}
      <section className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Ventas Comprometidas (OV)" value={formatUSD(metrics.sales_orders)} change={yoyChange(metrics.sales_orders, metricsPrev.sales_orders) ?? undefined} icon={ShoppingCart} variant="premium" />
        <KPICard title="Total Facturado" value={formatUSD(metrics.invoices)} change={yoyChange(metrics.invoices, metricsPrev.invoices) ?? undefined} icon={FileText} variant="premium" />
        <KPICard title="Ticket Medio (OV)" value={formatUSD(metrics.avg_ticket)} change={yoyChange(metrics.avg_ticket, metricsPrev.avg_ticket) ?? undefined} icon={Receipt} variant="premium" />
        <KPICard title="% Ejecución (FAC/OV)" value={`${metrics.execution_rate.toFixed(1)}%`} change={metricsPrev.execution_rate > 0 ? metrics.execution_rate - metricsPrev.execution_rate : undefined} icon={Activity} variant="premium" />
      </section>

      <Separator className="opacity-50" />

      {/* Sección 2: Evolución */}
      <section className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Análisis de Tendencias</h2>
            <p className="text-sm text-muted-foreground">Evolución mensual de ventas y facturación.</p>
          </div>
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-md">
            <div className="flex items-center space-x-2">
              <Checkbox id="type-ov-home" checked={selectedTypes.includes("SALES_ORDER")} onCheckedChange={() => handleTypeToggle("SALES_ORDER")} />
              <Label htmlFor="type-ov-home" className="text-sm font-medium cursor-pointer">Órdenes (OV)</Label>
            </div>
            <div className="flex items-center space-x-2 border-l pl-4 border-border/50">
              <Checkbox id="type-fac-home" checked={selectedTypes.includes("INVOICE")} onCheckedChange={() => handleTypeToggle("INVOICE")} />
              <Label htmlFor="type-fac-home" className="text-sm font-medium cursor-pointer">Facturas (FAC)</Label>
            </div>
          </div>
        </div>

        <BarChartMonthly data={chartData} />

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <CumulativeYoYChart current={(recordsData ?? []) as InsightRecord[]} previous={(prevData ?? []) as InsightRecord[]} yearActual={year} yearPrev={year - 1} />
          </div>
          <div className="lg:col-span-2">
            <ExecutionMonthlyChart monthly={metrics.monthly} />
          </div>
        </div>
      </section>

      <Separator className="opacity-50" />

      {/* Sección 3: Composición y concentración */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Composición y concentración</h2>
          <p className="text-sm text-muted-foreground">Clientes principales y mix por macro-categoría.</p>
        </div>
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <TopCustomersPareto year={year} />
          </div>
          <div className="lg:col-span-2">
            <CategoryMixDonut records={(recordsData ?? []) as InsightRecord[]} catMap={catMap} />
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 1:** Aplicar el reemplazo completo del archivo.
- [ ] **Step 2:** `npx tsc --noEmit` (limpio). Si `getSalesData`/`getCategories` no aceptan la forma usada o los tipos no encajan (p. ej. `c.id`/`c.name`, o `InsightRecord` no es asignable desde `SalesRecord`), ajusta el cast mínimo necesario (ya se usa `as InsightRecord[]`). Verifica que `Receipt` y `Activity` existen en lucide-react.
- [ ] **Step 3:** `npm run lint` (0 errores, ≤10 warnings). Si aparece `react-hooks/exhaustive-deps` u otro nuevo, resuélvelo sin bajar de 10 el baseline.
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/home/page.tsx"
git commit -m "feat(dashboard): Dashboard General con KPIs YoY, acumulado, ejecución, Pareto y mix (quita backlog)"
```

---

### Task 7: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde (lint ≤10 warnings).
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Sin tablas ni migraciones → solo redeploy en EasyPanel.
- La curva acumulada y el mix filtran client-side los registros ya en caché (toggle OV/FAC instantáneo); Top clientes consulta por tipo (react-query cacheada por `["customer-sales-top",{tipo,year}]`).
- `KPICard` ya soporta `change`; el KPI de % Ejecución pasa la diferencia en **puntos** (la card lo rotula como "%", imprecisión menor aceptada).
- Degradación: si el año anterior no tiene datos, `yoyChange`→null → KPIs sin flecha; gráficas muestran "Sin datos".
- `KPIDashboardSection`, `BacklogCard`, `AgingCard`, `ConcentrationCard` dejan de usarse en home pero NO se borran.
```
