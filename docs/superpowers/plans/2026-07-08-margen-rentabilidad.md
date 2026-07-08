# Margen / Rentabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva pestaña "Margen" en `/analytics` con 4 vistas de margen bruto estimado (costo estándar `purchase_rate`, solo bienes): KPI+evolución, por-artículo, dispersión, por-cliente.

**Architecture:** 3 consultas nuevas al hub que unen líneas de venta con `books.items` (`raw->>'purchase_rate'`), filtrando bienes (`purchase_rate > 0`). Helpers puros en `analytics-margin.ts`. 4 cards lazy-load; por-artículo y dispersión comparten consulta (dedup). Queries defensivas: sin costo en el hub → resultado vacío ("Sin datos"), nunca error.

**Tech Stack:** Next 16, React 19, @tanstack/react-query, recharts, Tailwind, pg, vitest.

**Verificación del hub (deploy-time):** `HUB_DB_URL` no está en el entorno local, así que la verificación del dato es un paso del OPERADOR tras el deploy — ver "Notas" al final (query provista). Las cards degradan a "Sin datos" si el hub no expone `purchase_rate`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | + filtros y filas de margen. |
| `src/db/hub-margin.ts` (crear) | `getHubMarginByYear` / `getHubMarginByItem` / `getHubMarginByCustomer`. |
| `src/actions/margin-actions.ts` (crear) | 3 actions con `requireApproved`. |
| `src/lib/analytics-margin.ts` (crear) | `deriveMargin` + `buildMarginByYear` / `buildMarginItems` / `buildMarginCustomers`. |
| `src/lib/__tests__/analytics-margin.test.ts` (crear) | tests helpers. |
| `src/components/charts/margin/margin-kpi-card.tsx` (crear) | Vista 1. |
| `src/components/charts/margin/margin-by-item-card.tsx` (crear) | Vista 2. |
| `src/components/charts/margin/margin-scatter-card.tsx` (crear) | Vista 3. |
| `src/components/charts/margin/margin-by-customer-card.tsx` (crear) | Vista 4. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | Pestaña "Margen": trigger + content + 4 dynamic imports. |

---

### Task 1: Backend — tipos + consultas hub + actions

**Files:** Modify `src/types/database.ts`; Create `src/db/hub-margin.ts`, `src/actions/margin-actions.ts`

- [ ] **Step 1: Tipos** — en `src/types/database.ts`, al final (tras el bloque de `CustomerMonthRow`), añade:

```ts
// ===== Margen / rentabilidad (solo bienes, costo estándar) =====

export interface MarginByYearFilters { tipo: RecordType }
export interface MarginFilters { tipo: RecordType; anio: number }

export interface MarginYearRow { year: number; ventas: number; costo: number }
export interface MarginItemRow { item_id: string; sku: string | null; nombre: string; ventas: number; costo: number }
export interface MarginCustomerRow { customer: string; ventas: number; costo: number }
```

- [ ] **Step 2: Consultas** — crear `src/db/hub-margin.ts`:

```ts
import { getHubPool } from "@/db/hub";
import type {
  MarginByYearFilters, MarginFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

// Ingreso neto (mismo ajuste de descuento que hub-customer-sales.ts).
const VENTAS = `round(sum(l.bcy_rate * l.quantity *
  COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
)::numeric, 2)::float8`;
// Costo estándar del maestro (NO se descuenta).
const COSTO = `round(sum(NULLIF(it.raw->>'purchase_rate','')::numeric * l.quantity)::numeric, 2)::float8`;
// Solo bienes con costo real.
const COMMON_WHERE = `l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND NULLIF(it.raw->>'purchase_rate','')::numeric > 0`;

function src(tipo: MarginFilters["tipo"]) {
  return tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
}

export async function getHubMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT extract(year from h.date)::int AS year, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE ${COMMON_WHERE}
    GROUP BY 1
    ORDER BY 1`;
  const { rows } = await getHubPool().query(sql);
  return rows.map((r) => ({ year: Number(r.year), ventas: Number(r.ventas), costo: Number(r.costo) }));
}

export async function getHubMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT it.item_id, it.sku, it.name AS nombre, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND ${COMMON_WHERE}
    GROUP BY it.item_id, it.sku, it.name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    item_id: String(r.item_id), sku: r.sku ?? null, nombre: String(r.nombre ?? ""),
    ventas: Number(r.ventas), costo: Number(r.costo),
  }));
}

export async function getHubMarginByCustomer(f: MarginFilters): Promise<MarginCustomerRow[]> {
  const s = src(f.tipo);
  const sql = `
    SELECT h.customer_name AS customer, ${VENTAS} AS ventas, ${COSTO} AS costo
    FROM ${s.lines} l
    JOIN ${s.header} h ON h.${s.fk} = l.${s.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND h.customer_name IS NOT NULL
      AND ${COMMON_WHERE}
    GROUP BY h.customer_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({ customer: String(r.customer), ventas: Number(r.ventas), costo: Number(r.costo) }));
}
```

READ `src/db/hub-customer-sales.ts` y `src/db/hub-item-sales.ts` antes, para confirmar `getHubPool`, el patrón SOURCES y el join `books.items it ON it.item_id = l.item_id`. Adapta si algo difiere.

- [ ] **Step 3: Actions** — crear `src/actions/margin-actions.ts`:

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubMarginByYear, getHubMarginByItem, getHubMarginByCustomer } from "@/db/hub-margin";
import type {
  MarginByYearFilters, MarginFilters,
  MarginYearRow, MarginItemRow, MarginCustomerRow,
} from "@/types/database";

export async function getMarginByYear(f: MarginByYearFilters): Promise<MarginYearRow[]> {
  await requireApproved();
  return getHubMarginByYear(f);
}

export async function getMarginByItem(f: MarginFilters): Promise<MarginItemRow[]> {
  await requireApproved();
  return getHubMarginByItem(f);
}

export async function getMarginByCustomer(f: MarginFilters): Promise<MarginCustomerRow[]> {
  await requireApproved();
  return getHubMarginByCustomer(f);
}
```

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings).
- [ ] **Step 5:** Commit:

```bash
git add src/types/database.ts src/db/hub-margin.ts src/actions/margin-actions.ts
git commit -m "feat(margen): tipos + consultas hub + actions (margen bruto por año/artículo/cliente)"
```

---

### Task 2: Helpers + tests (TDD)

**Files:** Create `src/lib/analytics-margin.ts`, `src/lib/__tests__/analytics-margin.test.ts`

- [ ] **Step 1: Tests (fallan)** — crear `src/lib/__tests__/analytics-margin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveMargin, buildMarginByYear, buildMarginItems, buildMarginCustomers,
} from "@/lib/analytics-margin";
import type { MarginYearRow, MarginItemRow, MarginCustomerRow } from "@/types/database";

describe("deriveMargin", () => {
  it("calcula margen y %", () => {
    expect(deriveMargin(100, 40)).toEqual({ margen: 60, margenPct: 60 });
  });
  it("ventas=0 → margenPct 0 (sin división por cero)", () => {
    expect(deriveMargin(0, 0)).toEqual({ margen: 0, margenPct: 0 });
  });
});

describe("buildMarginByYear", () => {
  it("series ordenada + totales globales", () => {
    const rows: MarginYearRow[] = [
      { year: 2023, ventas: 200, costo: 100 },
      { year: 2022, ventas: 100, costo: 60 },
    ];
    const { series, totals } = buildMarginByYear(rows);
    expect(series.map((s) => s.year)).toEqual([2022, 2023]);
    expect(series[0]).toEqual({ year: 2022, ventas: 100, costo: 60, margen: 40, margenPct: 40 });
    expect(totals).toEqual({ ventas: 300, costo: 160, margen: 140, margenPct: (140 / 300) * 100 });
  });
});

describe("buildMarginItems", () => {
  it("orden por margen desc, label=nombre", () => {
    const rows: MarginItemRow[] = [
      { item_id: "1", sku: "A", nombre: "uno", ventas: 100, costo: 90 },
      { item_id: "2", sku: "B", nombre: "dos", ventas: 200, costo: 50 },
    ];
    const p = buildMarginItems(rows);
    expect(p.map((x) => x.label)).toEqual(["dos", "uno"]);
    expect(p[0]).toEqual({ label: "dos", sku: "B", ventas: 200, costo: 50, margen: 150, margenPct: 75 });
  });
});

describe("buildMarginCustomers", () => {
  it("orden por margen desc", () => {
    const rows: MarginCustomerRow[] = [
      { customer: "X", ventas: 100, costo: 80 },
      { customer: "Y", ventas: 300, costo: 100 },
    ];
    expect(buildMarginCustomers(rows).map((x) => x.customer)).toEqual(["Y", "X"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/analytics-margin.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/analytics-margin.ts`:

```ts
import type { MarginYearRow, MarginItemRow, MarginCustomerRow } from "@/types/database";

export interface MarginDerived { margen: number; margenPct: number }

export function deriveMargin(ventas: number, costo: number): MarginDerived {
  const margen = ventas - costo;
  return { margen, margenPct: ventas > 0 ? (margen / ventas) * 100 : 0 };
}

export interface MarginYearPoint { year: number; ventas: number; costo: number; margen: number; margenPct: number }
export interface MarginTotals { ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginByYear(rows: MarginYearRow[]): { series: MarginYearPoint[]; totals: MarginTotals } {
  const series = [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: r.year, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }));
  const ventas = rows.reduce((s, r) => s + r.ventas, 0);
  const costo = rows.reduce((s, r) => s + r.costo, 0);
  return { series, totals: { ventas, costo, ...deriveMargin(ventas, costo) } };
}

export interface MarginItemPoint { label: string; sku: string | null; ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginItems(rows: MarginItemRow[]): MarginItemPoint[] {
  return rows
    .map((r) => ({ label: r.nombre, sku: r.sku, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }))
    .sort((a, b) => b.margen - a.margen || a.label.localeCompare(b.label));
}

export interface MarginCustomerPoint { customer: string; ventas: number; costo: number; margen: number; margenPct: number }

export function buildMarginCustomers(rows: MarginCustomerRow[]): MarginCustomerPoint[] {
  return rows
    .map((r) => ({ customer: r.customer, ventas: r.ventas, costo: r.costo, ...deriveMargin(r.ventas, r.costo) }))
    .sort((a, b) => b.margen - a.margen || a.customer.localeCompare(b.customer));
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/analytics-margin.test.ts` → PASS.
- [ ] **Step 5:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings).
- [ ] **Step 6:** Commit:

```bash
git add src/lib/analytics-margin.ts src/lib/__tests__/analytics-margin.test.ts
git commit -m "feat(margen): helpers deriveMargin / byYear / items / customers + tests"
```

---

### Task 3: MarginKpiCard (Vista 1)

**Files:** Create `src/components/charts/margin/margin-kpi-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByYear } from "@/actions/margin-actions";
import { buildMarginByYear } from "@/lib/analytics-margin";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginYearPoint } from "@/lib/analytics-margin";

function PctTooltip({ active, payload, label }: ChartTooltipProps<MarginYearPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

export function MarginKpiCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-year", { tipo: recordType }],
    queryFn: () => getMarginByYear({ tipo: recordType }),
  });
  const { series, totals } = useMemo(() => buildMarginByYear(data ?? []), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen bruto estimado (solo bienes)</CardTitle>
        <p className="text-xs text-muted-foreground">Costo estándar del maestro; excluye servicios sin costo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Ventas (bienes)" value={formatUSD(totals.ventas)} />
              <Tile label="Costo" value={formatUSD(totals.costo)} />
              <Tile label="Margen" value={formatUSD(totals.margen)} />
              <Tile label="Margen %" value={`${totals.margenPct.toFixed(1)}%`} />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={series} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
                <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
                <YAxis domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <Tooltip content={<PctTooltip />} />
                <Line type="monotone" dataKey="margenPct" name="Margen %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings). READ `src/components/charts/comercial/sku-pareto-card.tsx` para confirmar rutas de import.
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/margin/margin-kpi-card.tsx
git commit -m "feat(margen): MarginKpiCard (KPI + evolución anual)"
```

---

### Task 4: MarginByItemCard (Vista 2)

**Files:** Create `src/components/charts/margin/margin-by-item-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByItem } from "@/actions/margin-actions";
import { buildMarginItems } from "@/lib/analytics-margin";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginItemPoint } from "@/lib/analytics-margin";

function ItemTooltip({ active, payload, label }: ChartTooltipProps<MarginItemPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginByItemCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-item", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByItem({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => buildMarginItems(data ?? []).slice(0, 15), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen por artículo {year} (top 15)</CardTitle>
        <p className="text-xs text-muted-foreground">Margen $ estimado; solo bienes con costo.</p>
      </CardHeader>
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
              <Bar dataKey="margen" name="Margen" fill="#10b981" radius={[0, 4, 4, 0]} />
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
git add src/components/charts/margin/margin-by-item-card.tsx
git commit -m "feat(margen): MarginByItemCard (top 15 por margen $)"
```

---

### Task 5: MarginScatterCard (Vista 3)

**Files:** Create `src/components/charts/margin/margin-scatter-card.tsx`

Reusa la MISMA query key `["margin-item", { tipo, anio }]` (dedup con Task 4).

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByItem } from "@/actions/margin-actions";
import { buildMarginItems, deriveMargin } from "@/lib/analytics-margin";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginItemPoint } from "@/lib/analytics-margin";

function ScatterTooltip({ active, payload }: ChartTooltipProps<MarginItemPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{p?.label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginScatterCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-item", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByItem({ tipo: recordType, anio: year }),
  });
  const { points, overallPct } = useMemo(() => {
    const pts = buildMarginItems(data ?? []);
    const totV = pts.reduce((s, p) => s + p.ventas, 0);
    const totC = pts.reduce((s, p) => s + p.costo, 0);
    return { points: pts, overallPct: deriveMargin(totV, totC).margenPct };
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Importe vs margen % {year}</CardTitle>
        <p className="text-xs text-muted-foreground">Cada punto es un artículo (bienes). Línea = margen % global.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" />
              <XAxis type="number" dataKey="ventas" name="Ventas" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} />
              <YAxis type="number" dataKey="margenPct" name="Margen %" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <ZAxis range={[40, 40]} />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine y={overallPct} stroke="#f59e0b" strokeDasharray="4 4" />
              <Scatter data={points} fill="#6366f1" fillOpacity={0.6} />
            </ScatterChart>
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
git add src/components/charts/margin/margin-scatter-card.tsx
git commit -m "feat(margen): MarginScatterCard (importe vs margen %)"
```

---

### Task 6: MarginByCustomerCard (Vista 4)

**Files:** Create `src/components/charts/margin/margin-by-customer-card.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { buildMarginCustomers } from "@/lib/analytics-margin";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginCustomerPoint } from "@/lib/analytics-margin";

function CustTooltip({ active, payload, label }: ChartTooltipProps<MarginCustomerPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginByCustomerCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => buildMarginCustomers(data ?? []).slice(0, 15), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen por cliente {year} (top 15)</CardTitle>
        <p className="text-xs text-muted-foreground">Margen $ estimado; solo bienes con costo.</p>
      </CardHeader>
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
              <Tooltip content={<CustTooltip />} />
              <Bar dataKey="margen" name="Margen" fill="#10b981" radius={[0, 4, 4, 0]} />
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
git add src/components/charts/margin/margin-by-customer-card.tsx
git commit -m "feat(margen): MarginByCustomerCard (top 15 por margen $)"
```

---

### Task 7: Integrar pestaña "Margen" en `analytics/page.tsx`

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

LEE el archivo. Referencias: `chartSkeleton` (~línea 29); los `dynamic()` de comercial terminan tras `MonthHeatmapCard`; la `TabsList` tiene triggers `exploration`/`forecast`/`comercial` (~líneas 345-355); el `<TabsContent value="comercial">` termina con `</TabsContent>` (~línea 690).

- [ ] **Step 1: 4 dynamic imports** — tras el bloque `MonthHeatmapCard` dynamic:

```tsx
const MarginKpiCard = dynamic(
  () => import("@/components/charts/margin/margin-kpi-card").then((m) => m.MarginKpiCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginByItemCard = dynamic(
  () => import("@/components/charts/margin/margin-by-item-card").then((m) => m.MarginByItemCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginScatterCard = dynamic(
  () => import("@/components/charts/margin/margin-scatter-card").then((m) => m.MarginScatterCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginByCustomerCard = dynamic(
  () => import("@/components/charts/margin/margin-by-customer-card").then((m) => m.MarginByCustomerCard),
  { ssr: false, loading: chartSkeleton }
);
```

- [ ] **Step 2: Trigger** — en la `TabsList`, tras el `<TabsTrigger value="comercial">…</TabsTrigger>`:

```tsx
              <TabsTrigger value="margen" className="rounded-xl px-6 h-9 font-bold data-active:bg-amber-600 data-active:text-white flex gap-2">
                Margen
              </TabsTrigger>
```

- [ ] **Step 3: Content** — tras el `</TabsContent>` de `value="comercial"` (antes de `</Tabs>`):

```tsx
          <TabsContent value="margen" className="outline-none">
            <div className="space-y-6">
              <MarginKpiCard recordType={recordType} />
              <div className="grid gap-6 lg:grid-cols-2">
                <MarginByItemCard recordType={recordType} year={yearA} />
                <MarginScatterCard recordType={recordType} year={yearA} />
              </div>
              <MarginByCustomerCard recordType={recordType} year={yearA} />
            </div>
          </TabsContent>
```

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings; el file tiene 1 warning pre-existente de react-hooks/immutability que solo cambia de línea).
- [ ] **Step 5:** Commit:

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(margen): pestaña Margen en Análisis (4 cards)"
```

---

### Task 8: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `react-query throwOnError` global → errores al error boundary; cards solo manejan isLoading + vacío.
- Dedup: Vista 2 y Vista 3 comparten `["margin-item", {tipo, anio}]`. KPI usa `["margin-year", {tipo}]`; cliente `["margin-customer", {tipo, anio}]`.
- Costo NO se descuenta; ingreso SÍ (neto). Solo bienes (`purchase_rate > 0`).
- **Verificación deploy-time (operador):** tras desplegar, abrir Análisis → Margen (FAC 2025). Si aparece "Sin datos" en todas, el hub no expone `purchase_rate` en `books.items.raw` — verificar en el hub con:
  `SELECT count(*) FROM books.items WHERE NULLIF(raw->>'purchase_rate','')::numeric > 0;`
  Debe ser > 0. (Confirmado en Zoho origen; el hub debería replicarlo igual que `manufacturer`.)
- Deploy en EasyPanel al terminar.
