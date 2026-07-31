# Dashboard configurable (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard General personalizable por usuario: añadir/quitar, arrastrar y redimensionar widgets tomados del catálogo (KPIs, Dashboard, Comercial, Margen), persistido en BD.

**Architecture:** Registro de widgets con `render(ctx)` uniforme + rejilla `react-grid-layout` v2 + persistencia en `saved_views` (sin migración) + provider de datos comunes.

**Tech Stack:** Next 16, React 19, react-grid-layout 2.2.4 (ya instalado), react-query, vitest.

Contexto verificado:
- RGL v2 API: `import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout"` + CSS `react-grid-layout/css/styles.css` y `react-resizable/css/styles.css`. Props: `layout`, `width`, `gridConfig={{cols,rowHeight,margin}}`, `dragConfig={{enable,handle}}`, `resizeConfig={{enable}}`, `onLayoutChange`. Ver ejemplo real en `src/app/(dashboard)/spike-grid/page.tsx`.
- `saved_views` (tabla ya migrada): `{user_id, view_key, name, state jsonb}` con UNIQUE(user_id,view_key,name). Patrón de actions en `src/actions/saved-views-actions.ts`.
- `computeDashboardMetrics(records, cats)` → `{sales_orders, invoices, avg_ticket, execution_rate, monthly}` (`@/lib/dashboard-metrics`). `yoyChange(a,b)` en `@/lib/dashboard-insights`.
- `KPICard` props: `{title, value, change?, icon, description?, info?, variant?}`.
- Componentes autónomos de Comercial/Margen: `{recordType, year}` salvo `BucketMixCard`, `NewVsRecurringCard`, `MarginKpiCard` que son solo `{recordType}`.
- `TopCustomersPareto` es `{year}`; `ExecutionMonthlyChart` es `{monthly}`; `CumulativeYoYChart` es `{current, previous, yearActual, yearPrev}`; `CategoryMixDonut` es `{records, catMap}`.

---

### Task 1: `dashboard-layout.ts` + tests (TDD)

**Files:** Create `src/lib/dashboard-layout.ts`, `src/lib/__tests__/dashboard-layout.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/dashboard-layout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseDashboardLayout, DEFAULT_LAYOUT } from "@/lib/dashboard-layout";

const valid = [{ id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 }];

describe("parseDashboardLayout", () => {
  it("estado válido → items", () => {
    expect(parseDashboardLayout({ items: valid })).toEqual(valid);
  });
  it("acepta un array pelado", () => {
    expect(parseDashboardLayout(valid)).toEqual(valid);
  });
  it("descarta ids que no existen en el registro", () => {
    const r = parseDashboardLayout({ items: [...valid, { id: "no-existe", x: 0, y: 3, w: 3, h: 3 }] });
    expect(r).toEqual(valid);
  });
  it("campos no numéricos → null", () => {
    expect(parseDashboardLayout({ items: [{ id: "kpi-ov", x: "a", y: 0, w: 3, h: 3 }] })).toBeNull();
  });
  it("null / no-objeto → null", () => {
    expect(parseDashboardLayout(null)).toBeNull();
    expect(parseDashboardLayout("x")).toBeNull();
  });
  it("array vacío → []", () => {
    expect(parseDashboardLayout({ items: [] })).toEqual([]);
  });
  it("DEFAULT_LAYOUT sólo referencia ids del registro", () => {
    expect(parseDashboardLayout({ items: DEFAULT_LAYOUT })).toEqual(DEFAULT_LAYOUT);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/dashboard-layout.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/dashboard-layout.ts`. NOTA: importa sólo los **ids** del registro para evitar un ciclo con componentes; el registro exportará `WIDGET_IDS` (Task 3). Para romper el orden de dependencias, define aquí la lista de ids canónica y que el registro la consuma:
```ts
export interface DashboardItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Ids canónicos del catálogo. El registro (widget-registry.tsx) debe cubrir exactamente estos.
export const WIDGET_IDS = [
  "kpi-ov", "kpi-fac", "kpi-ticket", "kpi-ejecucion",
  "ventas-mensuales", "acumulado-yoy", "ejecucion-mensual", "top-clientes-pareto", "mix-categoria",
  "pareto-clientes", "top-articulos", "pareto-skus", "mix-marca", "bucket-cliente",
  "heatmap-mes", "nuevos-recurrentes", "estacionalidad", "mix-anual",
  "margen-kpi", "margen-cliente", "margen-articulo", "margen-scatter",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

const IDS = new Set<string>(WIDGET_IDS);

// Replica el Dashboard General actual (12 columnas, rowHeight 40).
export const DEFAULT_LAYOUT: DashboardItem[] = [
  { id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 },
  { id: "kpi-fac", x: 3, y: 0, w: 3, h: 3 },
  { id: "kpi-ticket", x: 6, y: 0, w: 3, h: 3 },
  { id: "kpi-ejecucion", x: 9, y: 0, w: 3, h: 3 },
  { id: "ventas-mensuales", x: 0, y: 3, w: 12, h: 11 },
  { id: "acumulado-yoy", x: 0, y: 14, w: 7, h: 10 },
  { id: "ejecucion-mensual", x: 7, y: 14, w: 5, h: 10 },
  { id: "top-clientes-pareto", x: 0, y: 24, w: 7, h: 11 },
  { id: "mix-categoria", x: 7, y: 24, w: 5, h: 11 },
];

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Devuelve los items válidos, descartando ids desconocidos (catálogo cambiante).
// null si la forma es inválida → el llamante usa DEFAULT_LAYOUT.
export function parseDashboardLayout(raw: unknown): DashboardItem[] | null {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!arr) return null;

  const out: DashboardItem[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    if (typeof o.id !== "string") return null;
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.w) || !isNum(o.h)) return null;
    if (!IDS.has(o.id)) continue; // id retirado del catálogo: se ignora
    out.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h });
  }
  return out;
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint` (≤10 warnings).
- [ ] **Step 5:** Commit:
```bash
git add src/lib/dashboard-layout.ts src/lib/__tests__/dashboard-layout.test.ts
git commit -m "feat(dashboard): modelo de layout configurable + parser + tests"
```

---

### Task 2: Actions de persistencia

**Files:** Create `src/actions/dashboard-layout-actions.ts`

- [ ] **Step 1: Implementar** (READ `src/actions/saved-views-actions.ts` para el patrón exacto de `db`/`requireApproved`/`onConflictDoUpdate`):
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { parseDashboardLayout, type DashboardItem } from "@/lib/dashboard-layout";

const VIEW_KEY = "dashboard";
const NAME = "layout";

// null = el usuario no ha personalizado (el llamante usa DEFAULT_LAYOUT).
export async function getDashboardLayout(): Promise<DashboardItem[] | null> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ state: savedViews.state })
      .from(savedViews)
      .where(and(
        eq(savedViews.user_id, profile.id),
        eq(savedViews.view_key, VIEW_KEY),
        eq(savedViews.name, NAME),
      ))
      .limit(1);
    if (rows.length === 0) return null;
    return parseDashboardLayout(rows[0].state);
  } catch {
    return null;
  }
}

export async function saveDashboardLayout(items: DashboardItem[]): Promise<void> {
  const { profile } = await requireApproved();
  await db
    .insert(savedViews)
    .values({ user_id: profile.id, view_key: VIEW_KEY, name: NAME, state: { items } })
    .onConflictDoUpdate({
      target: [savedViews.user_id, savedViews.view_key, savedViews.name],
      set: { state: { items } },
    });
}

export async function resetDashboardLayout(): Promise<void> {
  const { profile } = await requireApproved();
  await db.delete(savedViews).where(and(
    eq(savedViews.user_id, profile.id),
    eq(savedViews.view_key, VIEW_KEY),
    eq(savedViews.name, NAME),
  ));
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/actions/dashboard-layout-actions.ts
git commit -m "feat(dashboard): actions get/save/reset del layout (reutiliza saved_views)"
```

---

### Task 3: Provider de datos comunes + widget de ventas mensuales

**Files:** Create `src/components/dashboard/dashboard-data-provider.tsx`, `src/components/dashboard/monthly-sales-widget.tsx`

- [ ] **Step 1: Provider** — crear `src/components/dashboard/dashboard-data-provider.tsx`:
```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import { getCategories } from "@/actions/category-actions";
import { computeDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics";
import type { SalesRecord } from "@/types/database";

export interface DashboardData {
  year: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
  metrics: DashboardMetrics;
  metricsPrev: DashboardMetrics;
  isLoading: boolean;
}

const Ctx = createContext<DashboardData | null>(null);

export function useDashboardData(): DashboardData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDashboardData debe usarse dentro de DashboardDataProvider");
  return v;
}

export function DashboardDataProvider({ year, children }: { year: number; children: React.ReactNode }) {
  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", { year }],
    queryFn: () => getSalesData({ year }),
  });
  const { data: prevData, isLoading: l2 } = useQuery({
    queryKey: ["sales", { year: year - 1 }],
    queryFn: () => getSalesData({ year: year - 1 }),
  });
  const { data: catsData, isLoading: l3 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const value = useMemo<DashboardData>(() => {
    const records = (recordsData ?? []) as SalesRecord[];
    const prevRecords = (prevData ?? []) as SalesRecord[];
    const cats = catsData ?? [];
    return {
      year,
      records,
      prevRecords,
      catMap: new Map(cats.map((c) => [c.id, c.name] as [string, string])),
      metrics: computeDashboardMetrics(records, cats),
      metricsPrev: computeDashboardMetrics(prevRecords, cats),
      isLoading: l1 || l2 || l3,
    };
  }, [recordsData, prevData, catsData, year, l1, l2, l3]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Widget de ventas mensuales** (conserva los checkboxes OV/FAC, ahora dentro de la tarjeta) — crear `src/components/dashboard/monthly-sales-widget.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";

export function MonthlySalesWidget({ metrics }: { metrics: DashboardMetrics }) {
  const [showOV, setShowOV] = useState(true);
  const [showFAC, setShowFAC] = useState(true);

  const data = useMemo(
    () => metrics.monthly.map((m) => ({
      month: m.month,
      sales_orders: showOV ? m.sales_orders : 0,
      invoices: showFAC ? m.invoices : 0,
    })),
    [metrics.monthly, showOV, showFAC]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox id="w-ov" checked={showOV} onCheckedChange={() => setShowOV((v) => !v)} />
          <Label htmlFor="w-ov" className="text-xs font-medium cursor-pointer">Órdenes (OV)</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="w-fac" checked={showFAC} onCheckedChange={() => setShowFAC((v) => !v)} />
          <Label htmlFor="w-fac" className="text-xs font-medium cursor-pointer">Facturas (FAC)</Label>
        </div>
      </div>
      <BarChartMonthly data={data} />
    </div>
  );
}
```

- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 4:** Commit:
```bash
git add src/components/dashboard/dashboard-data-provider.tsx src/components/dashboard/monthly-sales-widget.tsx
git commit -m "feat(dashboard): provider de datos comunes + widget de ventas mensuales"
```

---

### Task 4: Registro de widgets (22)

**Files:** Create `src/lib/widget-registry.tsx`

- [ ] **Step 1: Implementar** — crear `src/lib/widget-registry.tsx`:
```tsx
import { ShoppingCart, FileText, Receipt, Activity } from "lucide-react";
import { KPICard } from "@/components/cards/kpi-card";
import { formatUSD } from "@/lib/constants";
import { CHART_HELP } from "@/lib/chart-help";
import { yoyChange, type InsightRecord } from "@/lib/dashboard-insights";
import { WIDGET_IDS } from "@/lib/dashboard-layout";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";
import type { SalesRecord } from "@/types/database";

import { MonthlySalesWidget } from "@/components/dashboard/monthly-sales-widget";
import { CumulativeYoYChart } from "@/components/charts/dashboard/cumulative-yoy-chart";
import { ExecutionMonthlyChart } from "@/components/charts/dashboard/execution-monthly-chart";
import { TopCustomersPareto } from "@/components/charts/dashboard/top-customers-pareto";
import { CategoryMixDonut } from "@/components/charts/dashboard/category-mix-donut";

import { ClientParetoCard } from "@/components/charts/comercial/client-pareto-card";
import { TopItemsCard } from "@/components/charts/comercial/top-items-card";
import { SkuParetoCard } from "@/components/charts/comercial/sku-pareto-card";
import { BrandMixCard } from "@/components/charts/comercial/brand-mix-card";
import { BucketByClientCard } from "@/components/charts/comercial/bucket-by-client-card";
import { MonthHeatmapCard } from "@/components/charts/comercial/month-heatmap-card";
import { NewVsRecurringCard } from "@/components/charts/comercial/new-vs-recurring-card";
import { SeasonByBucketCard } from "@/components/charts/comercial/season-by-bucket-card";
import { BucketMixCard } from "@/components/charts/comercial/bucket-mix-card";

import { MarginKpiCard } from "@/components/charts/margin/margin-kpi-card";
import { MarginByCustomerCard } from "@/components/charts/margin/margin-by-customer-card";
import { MarginByItemCard } from "@/components/charts/margin/margin-by-item-card";
import { MarginScatterCard } from "@/components/charts/margin/margin-scatter-card";

export type WidgetSection = "KPIs" | "Dashboard" | "Comercial" | "Margen";

export interface WidgetContext {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
  metrics: DashboardMetrics;
  metricsPrev: DashboardMetrics;
}

export interface WidgetDef {
  id: string;
  title: string;
  section: WidgetSection;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  render: (ctx: WidgetContext) => React.ReactNode;
}

const KPI_SIZE = { w: 3, h: 3 };
const KPI_MIN = { w: 2, h: 3 };
const CHART_SIZE = { w: 6, h: 10 };
const CHART_MIN = { w: 3, h: 6 };

export const WIDGETS: WidgetDef[] = [
  // --- KPIs ---
  {
    id: "kpi-ov", title: "Ventas Comprometidas (OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Ventas Comprometidas (OV)" value={formatUSD(c.metrics.sales_orders)}
        change={yoyChange(c.metrics.sales_orders, c.metricsPrev.sales_orders) ?? undefined}
        icon={ShoppingCart} variant="premium" info={CHART_HELP.kpiVentasOV} />
    ),
  },
  {
    id: "kpi-fac", title: "Total Facturado", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Total Facturado" value={formatUSD(c.metrics.invoices)}
        change={yoyChange(c.metrics.invoices, c.metricsPrev.invoices) ?? undefined}
        icon={FileText} variant="premium" info={CHART_HELP.kpiFacturado} />
    ),
  },
  {
    id: "kpi-ticket", title: "Ticket Medio (OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Ticket Medio (OV)" value={formatUSD(c.metrics.avg_ticket)}
        change={yoyChange(c.metrics.avg_ticket, c.metricsPrev.avg_ticket) ?? undefined}
        icon={Receipt} variant="premium" info={CHART_HELP.kpiTicket} />
    ),
  },
  {
    id: "kpi-ejecucion", title: "% Ejecución (FAC/OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="% Ejecución (FAC/OV)" value={`${c.metrics.execution_rate.toFixed(1)}%`}
        change={c.metricsPrev.execution_rate > 0 ? c.metrics.execution_rate - c.metricsPrev.execution_rate : undefined}
        icon={Activity} variant="premium" info={CHART_HELP.kpiEjecucion} />
    ),
  },

  // --- Dashboard ---
  {
    id: "ventas-mensuales", title: "Ventas mensuales", section: "Dashboard",
    defaultSize: { w: 12, h: 11 }, minSize: { w: 4, h: 8 },
    render: (c) => <MonthlySalesWidget metrics={c.metrics} />,
  },
  {
    id: "acumulado-yoy", title: "Acumulado año actual vs anterior", section: "Dashboard",
    defaultSize: { w: 7, h: 10 }, minSize: CHART_MIN,
    render: (c) => (
      <CumulativeYoYChart
        current={c.records as unknown as InsightRecord[]}
        previous={c.prevRecords as unknown as InsightRecord[]}
        yearActual={c.year} yearPrev={c.year - 1}
      />
    ),
  },
  {
    id: "ejecucion-mensual", title: "% Ejecución mensual (OV→FAC)", section: "Dashboard",
    defaultSize: { w: 5, h: 10 }, minSize: CHART_MIN,
    render: (c) => <ExecutionMonthlyChart monthly={c.metrics.monthly} />,
  },
  {
    id: "top-clientes-pareto", title: "Top 10 clientes · Pareto", section: "Dashboard",
    defaultSize: { w: 7, h: 11 }, minSize: CHART_MIN,
    render: (c) => <TopCustomersPareto year={c.year} />,
  },
  {
    id: "mix-categoria", title: "Mix por macro-categoría", section: "Dashboard",
    defaultSize: { w: 5, h: 11 }, minSize: CHART_MIN,
    render: (c) => <CategoryMixDonut records={c.records as unknown as InsightRecord[]} catMap={c.catMap} />,
  },

  // --- Comercial ---
  {
    id: "pareto-clientes", title: "Pareto de clientes", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <ClientParetoCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "top-articulos", title: "Top 15 artículos", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <TopItemsCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "pareto-skus", title: "Pareto de SKUs", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <SkuParetoCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "mix-marca", title: "Mix por marca", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BrandMixCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "bucket-cliente", title: "Macro-categoría × cliente", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BucketByClientCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "heatmap-mes", title: "Heatmap cliente × mes", section: "Comercial",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 6 },
    render: (c) => <MonthHeatmapCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "nuevos-recurrentes", title: "Nuevos vs recurrentes", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <NewVsRecurringCard recordType={c.recordType} />,
  },
  {
    id: "estacionalidad", title: "Estacionalidad por categoría", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <SeasonByBucketCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "mix-anual", title: "Mix por macro-categoría (evolución anual)", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BucketMixCard recordType={c.recordType} />,
  },

  // --- Margen ---
  {
    id: "margen-kpi", title: "Margen bruto estimado", section: "Margen",
    defaultSize: { w: 12, h: 11 }, minSize: { w: 4, h: 8 },
    render: (c) => <MarginKpiCard recordType={c.recordType} />,
  },
  {
    id: "margen-cliente", title: "Margen por cliente", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginByCustomerCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "margen-articulo", title: "Margen por artículo", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginByItemCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "margen-scatter", title: "Importe vs margen", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginScatterCard recordType={c.recordType} year={c.year} />,
  },
];

export const WIDGET_MAP = new Map(WIDGETS.map((w) => [w.id, w]));

// Salvaguarda: el registro debe cubrir exactamente los ids canónicos.
export const MISSING_WIDGETS = WIDGET_IDS.filter((id) => !WIDGET_MAP.has(id));
```

- [ ] **Step 2:** Verifica que `MISSING_WIDGETS` queda vacío (los 22 ids cubiertos). Ejecuta:
```bash
npx tsc --noEmit
```
y comprueba manualmente que cada id de `WIDGET_IDS` aparece en `WIDGETS`.
- [ ] **Step 3:** `npm run lint` (≤10 warnings; si el archivo dispara `react-hooks/static-components` por los componentes en `render`, añade un `/* eslint-disable-next-line */` acotado con comentario explicativo, sin subir el baseline).
- [ ] **Step 4:** Commit:
```bash
git add src/lib/widget-registry.tsx
git commit -m "feat(dashboard): registro de 22 widgets con render uniforme"
```

---

### Task 5: WidgetFrame + WidgetPicker

**Files:** Create `src/components/dashboard/widget-frame.tsx`, `src/components/dashboard/widget-picker.tsx`

- [ ] **Step 1: WidgetFrame** — crear `src/components/dashboard/widget-frame.tsx`:
```tsx
"use client";

import { GripVertical, X } from "lucide-react";

export function WidgetFrame({
  title, editing, onRemove, children,
}: {
  title: string;
  editing: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {editing && (
        <div className="widget-drag-handle flex cursor-move items-center justify-between gap-2 rounded-t-lg border border-b-0 border-primary/30 bg-primary/10 px-2 py-1">
          <span className="flex items-center gap-1.5 text-xs font-medium truncate">
            <GripVertical className="h-3.5 w-3.5 shrink-0" />
            {title}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${title}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: WidgetPicker** — crear `src/components/dashboard/widget-picker.tsx` (READ `src/components/ui/dialog.tsx` para confirmar los exports disponibles; si el proyecto no tiene `Dialog`, usa `DropdownMenu` como en `export-menu.tsx`):
```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { WIDGETS, type WidgetSection } from "@/lib/widget-registry";

const SECTIONS: WidgetSection[] = ["KPIs", "Dashboard", "Comercial", "Margen"];

export function WidgetPicker({
  presentIds, onAdd,
}: {
  presentIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  const available = WIDGETS.filter((w) => !presentIds.has(w.id));

  return (
    <Dialog>
      <DialogTrigger
        render={(props) => (
          <Button variant="outline" size="sm" {...props}>
            <Plus className="mr-2 h-4 w-4" /> Añadir tarjeta
          </Button>
        )}
      />
      <DialogContent className="max-h-[70vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir tarjeta</DialogTitle>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ya has añadido todas las tarjetas.</p>
        ) : (
          <div className="space-y-4">
            {SECTIONS.map((s) => {
              const items = available.filter((w) => w.section === s);
              if (items.length === 0) return null;
              return (
                <div key={s} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s}</p>
                  <div className="grid gap-1">
                    {items.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onAdd(w.id)}
                        className="rounded-md border border-border/50 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        {w.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`. Si `DialogTrigger` no acepta `render`, usa el patrón que use el repo (mira `src/components/ui/dialog.tsx` y algún consumidor existente).
- [ ] **Step 4:** Commit:
```bash
git add src/components/dashboard/widget-frame.tsx src/components/dashboard/widget-picker.tsx
git commit -m "feat(dashboard): marco de widget y selector de tarjetas"
```

---

### Task 6: DashboardGrid (rejilla + modo edición)

**Files:** Create `src/components/dashboard/dashboard-grid.tsx`

- [ ] **Step 1: Implementar** — crear `src/components/dashboard/dashboard-grid.tsx` (patrón RGL tomado de `src/app/(dashboard)/spike-grid/page.tsx`):
```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Save, RotateCcw, XCircle } from "lucide-react";

import { getDashboardLayout, saveDashboardLayout, resetDashboardLayout } from "@/actions/dashboard-layout-actions";
import { DEFAULT_LAYOUT, type DashboardItem } from "@/lib/dashboard-layout";
import { WIDGET_MAP, type WidgetContext } from "@/lib/widget-registry";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { usePeriod } from "@/components/providers/period-provider";
import { WidgetFrame } from "@/components/dashboard/widget-frame";
import { WidgetPicker } from "@/components/dashboard/widget-picker";

// Tras mover o redimensionar, recharts necesita un evento de resize para remedirse.
function pokeResize() {
  window.dispatchEvent(new Event("resize"));
}

export function DashboardGrid() {
  const { width, containerRef, mounted } = useContainerWidth();
  const qc = useQueryClient();
  const data = useDashboardData();
  const { tipo } = usePeriod();

  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DashboardItem[] | null>(null);
  const [backup, setBackup] = useState<DashboardItem[] | null>(null);

  const layoutQ = useQuery({ queryKey: ["dashboard-layout"], queryFn: getDashboardLayout });

  // Carga inicial: layout guardado o el por defecto.
  useEffect(() => {
    if (items === null && !layoutQ.isLoading) {
      setItems(layoutQ.data && layoutQ.data.length > 0 ? layoutQ.data : DEFAULT_LAYOUT);
    }
  }, [layoutQ.data, layoutQ.isLoading, items]);

  const saveMut = useMutation({
    mutationFn: (next: DashboardItem[]) => saveDashboardLayout(next),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard-layout"] }); toast.success("Dashboard guardado"); },
    onError: () => toast.error("No se pudo guardar el dashboard"),
  });
  const resetMut = useMutation({
    mutationFn: resetDashboardLayout,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard-layout"] }); setItems(DEFAULT_LAYOUT); toast.success("Dashboard restablecido"); },
    onError: () => toast.error("No se pudo restablecer"),
  });

  const ctx: WidgetContext = useMemo(() => ({
    recordType: tipo as "SALES_ORDER" | "INVOICE",
    year: data.year,
    records: data.records,
    prevRecords: data.prevRecords,
    catMap: data.catMap,
    metrics: data.metrics,
    metricsPrev: data.metricsPrev,
  }), [tipo, data]);

  const rglLayout: Layout = useMemo(
    () => (items ?? []).map((it) => {
      const def = WIDGET_MAP.get(it.id);
      return { i: it.id, x: it.x, y: it.y, w: it.w, h: it.h, minW: def?.minSize.w, minH: def?.minSize.h };
    }),
    [items]
  );

  if (!items || data.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const startEdit = () => { setBackup(items); setEditing(true); };
  const cancelEdit = () => { if (backup) setItems(backup); setEditing(false); };
  const save = () => { saveMut.mutate(items); setEditing(false); };

  const addWidget = (id: string) => {
    const def = WIDGET_MAP.get(id);
    if (!def || items.some((i) => i.id === id)) return;
    const maxY = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
    setItems([...items, { id, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }]);
  };
  const removeWidget = (id: string) => setItems(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <WidgetPicker presentIds={new Set(items.map((i) => i.id))} onAdd={addWidget} />
            <Button variant="outline" size="sm" onClick={() => resetMut.mutate()}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restablecer
            </Button>
            <Button variant="outline" size="sm" onClick={cancelEdit}>
              <XCircle className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="mr-2 h-4 w-4" /> Guardar
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Personalizar
          </Button>
        )}
      </div>

      <div ref={containerRef}>
        {mounted && (
          <ReactGridLayout
            layout={rglLayout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [16, 16] }}
            dragConfig={{ enable: editing, handle: ".widget-drag-handle" }}
            resizeConfig={{ enable: editing }}
            onLayoutChange={(l) => {
              if (!editing) return;
              setItems((prev) => (prev ?? []).map((it) => {
                const p = l.find((x) => x.i === it.id);
                return p ? { ...it, x: p.x, y: p.y, w: p.w, h: p.h } : it;
              }));
            }}
            onResizeStop={pokeResize}
            onDragStop={pokeResize}
          >
            {items.map((it) => {
              const def = WIDGET_MAP.get(it.id);
              if (!def) return <div key={it.id} />;
              return (
                <div key={it.id}>
                  <WidgetFrame title={def.title} editing={editing} onRemove={() => removeWidget(it.id)}>
                    {def.render(ctx)}
                  </WidgetFrame>
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit`. Ajusta si la firma real de `onResizeStop`/`onDragStop` en v2 difiere (consulta `node_modules/react-grid-layout/dist/index.d.ts`); el objetivo es llamar a `pokeResize` al terminar.
- [ ] **Step 3:** `npm run lint`. Si aparece `react-hooks/set-state-in-effect` por el `useEffect` de carga inicial, suprímelo con un `/* eslint-disable-next-line react-hooks/set-state-in-effect */` y un comentario explicando que es hidratación del layout guardado (mismo criterio que `period-provider.tsx`). El baseline debe seguir en 10.
- [ ] **Step 4:** Commit:
```bash
git add src/components/dashboard/dashboard-grid.tsx
git commit -m "feat(dashboard): rejilla configurable con modo edición (drag, resize, añadir, quitar)"
```

---

### Task 7: Reescribir `home/page.tsx`

**Files:** Modify `src/app/(dashboard)/home/page.tsx`

- [ ] **Step 1:** READ el archivo. Reemplázalo COMPLETO por:
```tsx
"use client";

import { useState } from "react";
import { getYearRange } from "@/lib/constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default function HomePage() {
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="flex flex-col gap-6 pb-20">
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

      <DashboardDataProvider year={year}>
        <DashboardGrid />
      </DashboardDataProvider>
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` (sin imports huérfanos) + `npm run lint` (baseline 10).
- [ ] **Step 3:** Commit:
```bash
git add "src/app/(dashboard)/home/page.tsx"
git commit -m "feat(dashboard): Dashboard General configurable por usuario"
```

---

### Task 8: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde (lint ≤10 warnings).
- [ ] **Step 2:** `git push origin main`

---

## Notas
- **Sin migración**: reutiliza `saved_views` (`view_key="dashboard"`). Solo redeploy.
- Degradación: sin fila guardada o estado inválido → `DEFAULT_LAYOUT` (idéntico al dashboard actual), así nadie pierde su vista.
- Ids retirados del catálogo se ignoran al cargar (no rompen el layout).
- Limitación v1 aceptada: los gráficos tienen altura interna fija; al agrandar mucho un widget queda espacio libre y al reducirlo aparece scroll.
- `/spike-grid` se elimina en el lote siguiente (junto con los widgets de Exploración/Forecast).
