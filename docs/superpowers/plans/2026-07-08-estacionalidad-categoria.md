# Estacionalidad por categoría (bucket × mes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card en la pestaña Comercial con los 4 macro-buckets apilados por mes (estacionalidad del año seleccionado).

**Architecture:** Consulta hub mes × categoría (replica la fórmula neta); helper puro mapea a buckets; card lazy con react-query.

**Tech Stack:** Next 16, @tanstack/react-query, recharts, pg, vitest.

---

### Task 1: Backend — tipos + consulta hub + action

**Files:** Modify `src/types/database.ts`; Create `src/db/hub-category-month-sales.ts`, `src/actions/category-month-actions.ts`

- [ ] **Step 1: Tipos** — en `src/types/database.ts`, al final, añade:
```ts
// ===== Estacionalidad por categoría (mes × categoría) =====

export interface CategoryMonthFilters { tipo: RecordType; anio: number }
export interface CategoryMonthRow { mes: number; categoria: string | null; importe: number } // mes 1..12
```

- [ ] **Step 2: Consulta** — crear `src/db/hub-category-month-sales.ts`:
```ts
import { getHubPool } from "@/db/hub";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

// Tabla por tipo elegida en servidor (NO input de usuario → sin inyección).
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT extract(month from h.date)::int AS mes,
           it.category_name AS categoria,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    JOIN books.items it ON it.item_id = l.item_id
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
    GROUP BY extract(month from h.date), it.category_name`;
  const { rows } = await getHubPool().query(sql, [f.anio]);
  return rows.map((r) => ({ mes: Number(r.mes), categoria: r.categoria ?? null, importe: Number(r.importe) }));
}
```
READ `src/db/hub-customer-month-sales.ts` antes para confirmar el patrón; adapta si algo difiere.

- [ ] **Step 3: Action** — crear `src/actions/category-month-actions.ts`:
```ts
"use server";

import { requireApproved } from "@/lib/auth/guards";
import { getHubCategoryMonthSales } from "@/db/hub-category-month-sales";
import type { CategoryMonthFilters, CategoryMonthRow } from "@/types/database";

export async function getCategoryMonthSales(f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  await requireApproved();
  return getHubCategoryMonthSales(f);
}
```

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings).
- [ ] **Step 5:** Commit:
```bash
git add src/types/database.ts src/db/hub-category-month-sales.ts src/actions/category-month-actions.ts
git commit -m "feat(comercial): consulta hub + action mes×categoría (getCategoryMonthSales)"
```

---

### Task 2: Helper buildBucketSeason + test (TDD)

**Files:** Modify `src/lib/analytics-comercial.ts`, `src/lib/__tests__/analytics-comercial.test.ts`

- [ ] **Step 1: Test (falla)** — en `src/lib/__tests__/analytics-comercial.test.ts`, añade `buildBucketSeason` al import desde `@/lib/analytics-comercial` y `CategoryMonthRow` al import de tipos desde `@/types/database`; añade:
```ts
describe("buildBucketSeason", () => {
  it("agrega a bucket por mes, 12 filas, meses vacíos en 0", () => {
    const rows: CategoryMonthRow[] = [
      { mes: 1, categoria: "CAL PM", importe: 100 },     // mano_obra
      { mes: 1, categoria: "C&R EDM 180", importe: 50 }, // cr
      { mes: 3, categoria: "EDM180", importe: 200 },     // equipos (default)
    ];
    const s = buildBucketSeason(rows);
    expect(s).toHaveLength(12);
    expect(s[0]).toEqual({ mes: 1, mano_obra: 100, cr: 50, equipos: 0, operacion: 0 });
    expect(s[1]).toEqual({ mes: 2, mano_obra: 0, cr: 0, equipos: 0, operacion: 0 });
    expect(s[2]).toEqual({ mes: 3, mano_obra: 0, cr: 0, equipos: 200, operacion: 0 });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/analytics-comercial.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/analytics-comercial.ts`, añade `CategoryMonthRow` al import de tipos desde `@/types/database` (mantén lo ya importado). `bucketForCategory` ya está importado. Añade al final:
```ts
export interface BucketSeasonRow { mes: number; mano_obra: number; cr: number; equipos: number; operacion: number }

export function buildBucketSeason(rows: CategoryMonthRow[]): BucketSeasonRow[] {
  const months: BucketSeasonRow[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1, mano_obra: 0, cr: 0, equipos: 0, operacion: 0,
  }));
  for (const r of rows) {
    if (r.mes >= 1 && r.mes <= 12) months[r.mes - 1][bucketForCategory(r.categoria)] += r.importe;
  }
  return months;
}
```

- [ ] **Step 4:** vitest → PASS. `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/analytics-comercial.ts src/lib/__tests__/analytics-comercial.test.ts
git commit -m "feat(comercial): helper buildBucketSeason + test"
```

---

### Task 3: SeasonByBucketCard

**Files:** Create `src/components/charts/comercial/season-by-bucket-card.tsx`

- [ ] **Step 1: Implementar** (patrón: READ `bucket-by-client-card.tsx` para confirmar rutas/tooltip):
```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryMonthSales } from "@/actions/category-month-actions";
import { buildBucketSeason } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

type SeasonPoint = { mesLabel: string; mano_obra: number; cr: number; equipos: number; operacion: number };

function SeasonTooltip({ active, payload, label }: ChartTooltipProps<SeasonPoint>) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-white/10 mt-1 pt-1 font-semibold">
        <span>Total</span>
        <span className="font-mono">{formatUSD(total)}</span>
      </div>
    </div>
  );
}

export function SeasonByBucketCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["category-month", { tipo: recordType, anio: year }],
    queryFn: () => getCategoryMonthSales({ tipo: recordType, anio: year }),
  });
  const rows = useMemo(
    () => buildBucketSeason(data ?? []).map((r) => ({
      mesLabel: MESES[r.mes - 1], mano_obra: r.mano_obra, cr: r.cr, equipos: r.equipos, operacion: r.operacion,
    })),
    [data]
  );
  const hasData = useMemo(() => rows.some((r) => r.mano_obra || r.cr || r.equipos || r.operacion), [rows]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Estacionalidad por categoría {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[380px] w-full" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="mesLabel" className="text-[10px] fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<SeasonTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
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

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/charts/comercial/season-by-bucket-card.tsx
git commit -m "feat(comercial): SeasonByBucketCard (estacionalidad por categoría)"
```

---

### Task 4: Integrar en `analytics/page.tsx`

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

LEE el archivo. Tras el bloque `dynamic` de `MonthHeatmapCard` (~línea 86-89) y el render de `<MonthHeatmapCard .../>` en `TabsContent value="comercial"` (~línea 709).

- [ ] **Step 1: dynamic** — tras el bloque `const MonthHeatmapCard = dynamic(...)`:
```tsx
const SeasonByBucketCard = dynamic(
  () => import("@/components/charts/comercial/season-by-bucket-card").then((m) => m.SeasonByBucketCard),
  { ssr: false, loading: chartSkeleton }
);
```

- [ ] **Step 2: render** — en `TabsContent value="comercial"`, tras `<MonthHeatmapCard recordType={recordType} year={yearA} />` (última línea del `div.space-y-6`):
```tsx
              <SeasonByBucketCard recordType={recordType} year={yearA} />
```

- [ ] **Step 3:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings; el file tiene 1 warning pre-existente que solo cambia de línea).
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(comercial): añadir Estacionalidad por categoría a la pestaña Comercial"
```

---

### Task 5: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `react-query throwOnError` global → errores al boundary; la card maneja isLoading + vacío.
- Colores/labels de bucket consistentes con `BucketByClientCard`/`BucketMixCard`.
- La consulta no filtra por `purchase_rate` ni bucket en SQL: devuelve mes × `category_name` y el bucketing se hace en el helper (mismo criterio `bucketForCategory` que el resto).
- Deploy en EasyPanel; validar en Análisis → Comercial (FAC 2025).
