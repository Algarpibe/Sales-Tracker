# Análisis Comercial — Lote 2 (C3 · C4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 gráficos más en la pestaña Comercial: C3 Nuevos vs recurrentes (importe apilado + línea de altas) y C4 Heatmap cliente × mes.

**Architecture:** C3 reutiliza `getCustomerSales` (sin SQL nuevo). C4 añade una consulta al hub (cliente × mes) que replica la fórmula neta de `hub-customer-sales.ts`. Matemática en helpers puros con tests; cards lazy-load con react-query. C4 se renderiza con grid CSS (no recharts).

**Tech Stack:** Next 16, React 19, @tanstack/react-query, recharts (C3), Tailwind, pg, vitest.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/database.ts` (mod) | + `CustomerMonthFilters`, `CustomerMonthRow`. |
| `src/db/hub-customer-month-sales.ts` (crear) | SQL cliente × mes (importe neto) para un año. |
| `src/actions/customer-month-actions.ts` (crear) | Action `getCustomerMonthSales` con `requireApproved`. |
| `src/lib/analytics-comercial.ts` (mod) | + `buildNewVsRecurring`, `buildMonthHeatmap` + tipos. |
| `src/lib/__tests__/analytics-comercial.test.ts` (mod) | + 2 describes. |
| `src/components/charts/comercial/new-vs-recurring-card.tsx` (crear) | C3. |
| `src/components/charts/comercial/month-heatmap-card.tsx` (crear) | C4. |
| `src/app/(dashboard)/analytics/page.tsx` (mod) | 2 dynamic imports + 2 cards full-width. |

---

### Task 1: Tipos + consulta hub + action (C4 backend)

**Files:** Modify `src/types/database.ts`; Create `src/db/hub-customer-month-sales.ts`, `src/actions/customer-month-actions.ts`

- [ ] **Step 1: Tipos**

En `src/types/database.ts`, tras el bloque `CustomerItemRow` (después de la línea 242), añade:

```ts
// ===== Ventas por cliente × mes (heatmap) =====

export interface CustomerMonthFilters {
  tipo: RecordType;   // "SALES_ORDER" (OV) | "INVOICE" (FAC)
  anio: number;
}

export interface CustomerMonthRow {
  customer: string;
  mes: number;        // 1..12
  importe: number;    // neto del descuento de cabecera (igual al informe Zoho)
}
```

- [ ] **Step 2: Consulta hub** — crear `src/db/hub-customer-month-sales.ts`:

```ts
import { getHubPool } from "@/db/hub";
import type { CustomerMonthFilters, CustomerMonthRow } from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerMonthSales(f: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
    GROUP BY h.customer_name, extract(month from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({
    customer: String(r.customer),
    mes: Number(r.mes),
    importe: Number(r.importe),
  }));
}
```

- [ ] **Step 3: Action** — crear `src/actions/customer-month-actions.ts`:

```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCustomerMonthSales } from "@/db/hub-customer-month-sales";
import type { CustomerMonthFilters, CustomerMonthRow } from "@/types/database";

// Lectura: lanza en error (react-query lo maneja). Requiere el hub (HUB_DB_URL).
export async function getCustomerMonthSales(filters: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  await requireApproved();
  return getHubCustomerMonthSales(filters);
}
```

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings).
- [ ] **Step 5:** Commit:

```bash
git add src/types/database.ts src/db/hub-customer-month-sales.ts src/actions/customer-month-actions.ts
git commit -m "feat(comercial): action+consulta hub cliente×mes (getCustomerMonthSales)"
```

---

### Task 2: Helpers + tests (TDD)

**Files:** Modify `src/lib/analytics-comercial.ts`, `src/lib/__tests__/analytics-comercial.test.ts`

- [ ] **Step 1: Añadir tests (fallan)**

En `src/lib/__tests__/analytics-comercial.test.ts`, añade a los imports desde `@/lib/analytics-comercial`:
`buildNewVsRecurring, buildMonthHeatmap`. Añade a los imports de tipos desde `@/types/database`
`CustomerYearRow, CustomerMonthRow` (extiende la línea existente; algunos ya pueden estar importados).
Añade al final:

```ts
describe("buildNewVsRecurring", () => {
  it("particiona nuevos/recurrentes por firstYear y cuenta altas", () => {
    const rows: CustomerYearRow[] = [
      { customer: "A", year: 2021, ventas: 100 },
      { customer: "A", year: 2022, ventas: 200 },
      { customer: "B", year: 2022, ventas: 50 },
      { customer: "C", year: 2023, ventas: 500 },
      { customer: "A", year: 2023, ventas: 10 },
    ];
    const r = buildNewVsRecurring(rows);
    expect(r.map((x) => x.year)).toEqual([2021, 2022, 2023]);
    expect(r[0]).toEqual({ year: 2021, nuevos: 100, recurrentes: 0, countNuevos: 1 });
    expect(r[1]).toEqual({ year: 2022, nuevos: 50, recurrentes: 200, countNuevos: 1 });
    expect(r[2]).toEqual({ year: 2023, nuevos: 500, recurrentes: 10, countNuevos: 1 });
  });

  it("cliente con hueco sigue siendo recurrente al volver", () => {
    const rows: CustomerYearRow[] = [
      { customer: "A", year: 2021, ventas: 100 },
      { customer: "A", year: 2023, ventas: 300 },
    ];
    const r = buildNewVsRecurring(rows);
    // 2022 no aparece (sin ventas de nadie); 2023: A es recurrente (firstYear 2021)
    expect(r.map((x) => x.year)).toEqual([2021, 2023]);
    expect(r[1]).toEqual({ year: 2023, nuevos: 0, recurrentes: 300, countNuevos: 0 });
  });
});

describe("buildMonthHeatmap", () => {
  it("agrega por mes (índice mes-1), total y orden desc", () => {
    const rows: CustomerMonthRow[] = [
      { customer: "A", mes: 1, importe: 100 },
      { customer: "A", mes: 3, importe: 50 },
      { customer: "B", mes: 12, importe: 500 },
    ];
    const h = buildMonthHeatmap(rows);
    expect(h.map((x) => x.customer)).toEqual(["B", "A"]);
    expect(h[1].months).toHaveLength(12);
    expect(h[1].months[0]).toBe(100);
    expect(h[1].months[2]).toBe(50);
    expect(h[1].total).toBe(150);
    expect(h[0].months[11]).toBe(500);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → FAIL (funciones no existen).

- [ ] **Step 3: Implementar los helpers**

En `src/lib/analytics-comercial.ts`, añade `CustomerYearRow` y `CustomerMonthRow` al import de tipos
desde `@/types/database` (mantén lo ya importado: `CustomerYearRow` puede estar ya; añade `CustomerMonthRow`).
Añade al final del archivo:

```ts
export interface NewVsRecurringRow {
  year: number;
  nuevos: number;
  recurrentes: number;
  countNuevos: number;
}

export function buildNewVsRecurring(rows: CustomerYearRow[]): NewVsRecurringRow[] {
  // firstYear por cliente (mínimo año con ventas > 0)
  const firstYear = new Map<string, number>();
  for (const r of rows) {
    if (r.ventas > 0) {
      const cur = firstYear.get(r.customer);
      if (cur === undefined || r.year < cur) firstYear.set(r.customer, r.year);
    }
  }
  const byYear = new Map<number, NewVsRecurringRow>();
  for (const r of rows) {
    if (r.ventas <= 0) continue;
    let acc = byYear.get(r.year);
    if (!acc) {
      acc = { year: r.year, nuevos: 0, recurrentes: 0, countNuevos: 0 };
      byYear.set(r.year, acc);
    }
    if (firstYear.get(r.customer) === r.year) {
      acc.nuevos += r.ventas;
      acc.countNuevos += 1;
    } else {
      acc.recurrentes += r.ventas;
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export interface MonthHeatmapRow {
  customer: string;
  months: number[]; // length 12, índice 0 = enero
  total: number;
}

export function buildMonthHeatmap(rows: CustomerMonthRow[]): MonthHeatmapRow[] {
  const map = new Map<string, MonthHeatmapRow>();
  for (const r of rows) {
    let row = map.get(r.customer);
    if (!row) {
      row = { customer: r.customer, months: new Array(12).fill(0), total: 0 };
      map.set(r.customer, row);
    }
    if (r.mes >= 1 && r.mes <= 12) {
      row.months[r.mes - 1] += r.importe;
      row.total += r.importe;
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.customer.localeCompare(b.customer));
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → PASS (todos, incluidos los previos).
- [ ] **Step 5:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings).
- [ ] **Step 6:** Commit:

```bash
git add src/lib/analytics-comercial.ts src/lib/__tests__/analytics-comercial.test.ts
git commit -m "feat(comercial): helpers nuevos-vs-recurrentes / heatmap mes + tests"
```

Nota: `CustomerMonthRow` ya existe (creado en Task 1), así que `tsc` sobre el helper compila sin problemas.

---

### Task 3: NewVsRecurringCard (C3)

**Files:** Create `src/components/charts/comercial/new-vs-recurring-card.tsx`

- [ ] **Step 1: Implementar**

Antes: READ `src/components/charts/comercial/client-pareto-card.tsx` para confirmar rutas de import y patrón
de tooltip módulo-level. Adapta cualquier ruta si difiere.

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { buildNewVsRecurring } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { NewVsRecurringRow } from "@/lib/analytics-comercial";

const FIRST_YEAR = 2021;

function NvrTooltip({ active, payload, label }: ChartTooltipProps<NewVsRecurringRow>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span style={{ color: "#10b981" }}>Nuevos</span><span className="font-mono">{formatUSD(p?.nuevos ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span style={{ color: "#6366f1" }}>Recurrentes</span><span className="font-mono">{formatUSD(p?.recurrentes ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span style={{ color: "#f59e0b" }}>Altas nuevas</span><span className="font-mono">{p?.countNuevos ?? 0}</span></div>
    </div>
  );
}

export function NewVsRecurringCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const thisYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const chart = useMemo(() => buildNewVsRecurring(data ?? []), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Nuevos vs recurrentes</CardTitle>
        <p className="text-xs text-muted-foreground">Importe por año según año de primera venta. {FIRST_YEAR} es 100% nuevos por definición.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[380px] w-full" />
        ) : chart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chart} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<NvrTooltip />} />
              <Legend />
              <Bar yAxisId="left" dataKey="nuevos" name="Nuevos" stackId="1" fill="#10b981" />
              <Bar yAxisId="left" dataKey="recurrentes" name="Recurrentes" stackId="1" fill="#6366f1" />
              <Line yAxisId="right" type="monotone" dataKey="countNuevos" name="Altas nuevas" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings para este archivo).
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/new-vs-recurring-card.tsx
git commit -m "feat(comercial): NewVsRecurringCard (nuevos vs recurrentes)"
```

---

### Task 4: MonthHeatmapCard (C4)

**Files:** Create `src/components/charts/comercial/month-heatmap-card.tsx`

- [ ] **Step 1: Implementar** (grid CSS, no recharts)

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerMonthSales } from "@/actions/customer-month-actions";
import { buildMonthHeatmap } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function MonthHeatmapCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-month", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerMonthSales({ tipo: recordType, anio: year }),
  });

  const { rows, max } = useMemo(() => {
    const top = buildMonthHeatmap(data ?? []).slice(0, 15);
    let m = 0;
    for (const r of top) for (const v of r.months) if (v > m) m = v;
    return { rows: top, max: m };
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Heatmap cliente × mes {year} (top 15)</CardTitle>
        <p className="text-xs text-muted-foreground">Importe neto por mes; intensidad absoluta (misma escala para toda la tabla).</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[480px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground min-w-[160px]">Cliente</th>
                  {MESES.map((m) => (
                    <th key={m} className="text-center font-medium text-muted-foreground min-w-[52px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer}>
                    <td className="sticky left-0 z-10 bg-card truncate max-w-[160px] pr-2" title={r.customer}>{r.customer}</td>
                    {r.months.map((v, i) => {
                      const alpha = max > 0 && v > 0 ? 0.08 + 0.92 * (v / max) : 0;
                      return (
                        <td
                          key={i}
                          className="text-center rounded tabular-nums"
                          style={{ backgroundColor: alpha > 0 ? `rgba(16,185,129,${alpha})` : "transparent" }}
                          title={v > 0 ? `${r.customer} · ${MESES[i]} ${year}: ${formatUSD(v)}` : ""}
                        >
                          {v > 0 ? formatCompactUSD(v) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings). Si lint marca el `key={i}`
  del `.map` de meses, usa `key={\`${r.customer}-${i}\`}` en su lugar (más único).
- [ ] **Step 3:** Commit:

```bash
git add src/components/charts/comercial/month-heatmap-card.tsx
git commit -m "feat(comercial): MonthHeatmapCard (heatmap cliente×mes)"
```

---

### Task 5: Integrar en `analytics/page.tsx`

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

LEE el archivo. Ya tiene `chartSkeleton`, los `dynamic(...)` del Lote 1 (`SkuParetoCard`, `BucketByClientCard`,
`BrandMixCard`) tras `TopItemsCard`, y el `<TabsContent value="comercial">` cuyo `div.space-y-6` termina con
el grid de `BucketByClientCard` + `BrandMixCard`.

- [ ] **Step 1: 2 dynamic imports** (junto a los de comercial, tras el bloque de `BrandMixCard`):

```tsx
const NewVsRecurringCard = dynamic(
  () => import("@/components/charts/comercial/new-vs-recurring-card").then((m) => m.NewVsRecurringCard),
  { ssr: false, loading: chartSkeleton }
);
const MonthHeatmapCard = dynamic(
  () => import("@/components/charts/comercial/month-heatmap-card").then((m) => m.MonthHeatmapCard),
  { ssr: false, loading: chartSkeleton }
);
```

- [ ] **Step 2: Render** dentro de `<TabsContent value="comercial">`, en el mismo `div.space-y-6`, tras el
  grid `BucketByClientCard`+`BrandMixCard` (última línea antes de cerrar el `div.space-y-6`):

```tsx
              <NewVsRecurringCard recordType={recordType} />
              <MonthHeatmapCard recordType={recordType} year={yearA} />
```

Resultado esperado del bloque:
```tsx
          <TabsContent value="comercial" className="outline-none">
            <div className="space-y-6">
              <BucketMixCard recordType={recordType} />
              <div className="grid gap-6 lg:grid-cols-2">
                <ClientParetoCard recordType={recordType} year={yearA} />
                <TopItemsCard recordType={recordType} year={yearA} />
              </div>
              <SkuParetoCard recordType={recordType} year={yearA} />
              <div className="grid gap-6 lg:grid-cols-2">
                <BucketByClientCard recordType={recordType} year={yearA} />
                <BrandMixCard recordType={recordType} year={yearA} />
              </div>
              <NewVsRecurringCard recordType={recordType} />
              <MonthHeatmapCard recordType={recordType} year={yearA} />
            </div>
          </TabsContent>
```

- [ ] **Step 3:** `npx tsc --noEmit` (limpio) y `npm run lint` (sin nuevos warnings; el file tiene 1 warning
  pre-existente de react-hooks/immutability que solo cambia de línea).
- [ ] **Step 4:** Commit:

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(comercial): añadir C3/C4 a la pestaña Comercial"
```

---

### Task 6: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `react-query throwOnError` global → errores al error boundary; las cards solo manejan isLoading + vacío.
- Dedup: C3 comparte key `["customer-sales", {tipo, desdeAnio, hastaAnio}]` con la vista Clientes cuando el
  rango coincide (2021→año actual). C4 usa key propia `["customer-month", {tipo, anio}]`.
- C4 reconcilia con los totales anuales de Clientes (misma fórmula neta, suma sobre meses = anual).
- Deploy en EasyPanel al terminar; validar en Análisis → Comercial (FAC 2025).
