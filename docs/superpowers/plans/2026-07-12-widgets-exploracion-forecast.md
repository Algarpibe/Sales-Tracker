# Widgets de Exploración y Forecast (dashboard v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Catálogo del dashboard configurable 22 → 32 widgets, añadiendo Exploración y Forecast; eliminar `/spike-grid`.

**Architecture:** Extraer a funciones puras la lógica de `analytics/page.tsx` y usarla tanto en la página como en widgets nuevos autónomos. Registrar los componentes que ya son autónomos.

**Tech Stack:** Next 16, react-query, recharts, vitest. Sin BD ni migraciones.

Contexto verificado:
- `savedGroups` es prop **vestigial** en `GroupEvolutionCard` (`group-evolution-card.tsx:75`) y `GroupForecastCard` (`group-forecast-card.tsx:74`): aparece sólo en la interfaz, nunca en el cuerpo.
- `HistoricalSalesCategory()` (sin props) y `ForecastSalesCategory({baseYear})` ya son autónomos.
- `ST_CATEGORIES`/`CR_CATEGORIES` en `analytics/page.tsx:124-133`. Cálculo de `techServiceData` en el `useMemo` de `analytics/page.tsx:239-305`.
- Gráfico estacional inline: `analytics/page.tsx:556-650` aprox (Card completa). "Global Mensual" inline: `analytics/page.tsx:431-464` aprox.
- `computeForecast` en `@/lib/forecast` (entrada `ForecastInput`). `WidgetContext`/`WIDGETS`/`WIDGET_IDS` en `src/lib/widget-registry.tsx` y `src/lib/dashboard-layout.ts`.
- Patrón de altura ya aplicado a todos los gráficos: `Card` con `flex h-full flex-col`, `CardContent` con `min-h-0 flex-1`, `ResponsiveContainer height="100%" minHeight={NNN}`.

---

### Task 1: Lib `tech-service.ts` + tests (TDD)

**Files:** Create `src/lib/tech-service.ts`, `src/lib/__tests__/tech-service.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/tech-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildTechServiceData, ST_CATEGORIES, CR_CATEGORIES } from "@/lib/tech-service";

const rec = (record_month: number, amount_usd: number, category_id: string, record_type = "INVOICE") =>
  ({ record_month, amount_usd, category_id, record_type }) as never;

// c1 → categoría ST, c2 → categoría C&R, c9 → desconocida
const catMap = new Map<string, string>([["c1", ST_CATEGORIES[0]], ["c2", CR_CATEGORIES[0]], ["c9", "Otra"]]);

describe("buildTechServiceData", () => {
  it("agrega ST y C&R por trimestre y acumula", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(4, 10, "c1")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "QUARTERLY");
    expect(r).toHaveLength(4);
    expect(r[0].st).toBe(100);
    expect(r[0].cr).toBe(50);
    expect(r[0].total).toBe(150);
    expect(r[0].acum).toBe(150);
    expect(r[1].st).toBe(10);
    expect(r[1].acum).toBe(160); // acumulado corriente
  });
  it("separa año A de año B", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [rec(1, 40, "c1")], catMap, "INVOICE", "ANNUAL");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
    expect(r[0].total_prev).toBe(40);
    expect(r[0].acum_prev).toBe(40);
  });
  it("ignora categorías desconocidas y otro record_type", () => {
    const a = [rec(1, 999, "c9"), rec(1, 500, "c1", "SALES_ORDER")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("MONTHLY devuelve 12 slots", () => {
    expect(buildTechServiceData([], [], catMap, "INVOICE", "MONTHLY")).toHaveLength(12);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/tech-service.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/tech-service.ts`. MUEVE aquí `ST_CATEGORIES`/`CR_CATEGORIES` desde `analytics/page.tsx:124-133` (cópialas literalmente) y traslada el cálculo del `useMemo` de `analytics/page.tsx:239-305`:
```ts
import { MONTHS } from "@/lib/constants";
import type { SalesRecord, RecordType } from "@/types/database";
import type { TechServiceDataPoint } from "@/components/charts/tech-service-analysis";

export type TechServiceViewMode = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export const ST_CATEGORIES = [ /* copiar literal de analytics/page.tsx:124-127 */ ];
export const CR_CATEGORIES = [ /* copiar literal de analytics/page.tsx:129-133 */ ];

function slotsFor(viewMode: TechServiceViewMode): { label: string; months: number[] }[] {
  if (viewMode === "MONTHLY") return MONTHS.map((m) => ({ label: m.label, months: [m.value] }));
  if (viewMode === "QUARTERLY") {
    return [
      { label: "T1", months: [1, 2, 3] },
      { label: "T2", months: [4, 5, 6] },
      { label: "T3", months: [7, 8, 9] },
      { label: "T4", months: [10, 11, 12] },
    ];
  }
  return [{ label: "Anual", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }];
}

export function buildTechServiceData(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  catMap: Map<string, string>,
  recordType: RecordType,
  viewMode: TechServiceViewMode,
): TechServiceDataPoint[] {
  const slots = slotsFor(viewMode);
  let acumA = 0;
  let acumB = 0;

  const sum = (records: SalesRecord[], months: number[]) => {
    let st = 0;
    let cr = 0;
    for (const r of records) {
      if (r.record_type !== recordType) continue;
      if (!months.includes(Number(r.record_month))) continue;
      const catName = catMap.get(r.category_id);
      const amt = Number(r.amount_usd);
      if (catName && ST_CATEGORIES.includes(catName)) st += amt;
      else if (catName && CR_CATEGORIES.includes(catName)) cr += amt;
    }
    return { st, cr };
  };

  return slots.map((slot) => {
    const a = sum(recordsA, slot.months);
    const b = sum(recordsB, slot.months);
    const totalA = a.st + a.cr;
    const totalB = b.st + b.cr;
    acumA += totalA;
    acumB += totalB;
    return {
      label: slot.label,
      st: a.st, cr: a.cr, total: totalA, acum: acumA,
      st_prev: b.st, cr_prev: b.cr, total_prev: totalB, acum_prev: acumB,
    };
  });
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint` (≤10 warnings).
- [ ] **Step 5:** Commit:
```bash
git add src/lib/tech-service.ts src/lib/__tests__/tech-service.test.ts
git commit -m "feat(analisis): extraer cálculo de Análisis Financiero a lib puro + tests"
```

---

### Task 2: Lib `forecast-widget-data.ts` + tests (TDD)

**Files:** Create `src/lib/forecast-widget-data.ts`, `src/lib/__tests__/forecast-widget-data.test.ts`

- [ ] **Step 1: Test (falla)**:
```ts
import { describe, it, expect } from "vitest";
import { monthlyTotals, historicalMatrix } from "@/lib/forecast-widget-data";

const rec = (record_year: number, record_month: number, amount_usd: number, record_type = "INVOICE") =>
  ({ record_year, record_month, amount_usd, record_type, category_id: "c1" }) as never;

describe("monthlyTotals", () => {
  it("filtra por año y tipo, longitud 12", () => {
    const r = monthlyTotals([rec(2026, 1, 100), rec(2025, 1, 999), rec(2026, 1, 50, "SALES_ORDER")], 2026, "INVOICE");
    expect(r).toHaveLength(12);
    expect(r[0]).toBe(100);
    expect(r[11]).toBe(0);
  });
});

describe("historicalMatrix", () => {
  it("una fila por año, en el orden pedido", () => {
    const m = historicalMatrix([rec(2025, 1, 10), rec(2024, 2, 20)], [2025, 2024], "INVOICE");
    expect(m).toHaveLength(2);
    expect(m[0][0]).toBe(10);
    expect(m[1][1]).toBe(20);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/forecast-widget-data.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/forecast-widget-data.ts`:
```ts
import type { SalesRecord, RecordType } from "@/types/database";

export function monthlyTotals(records: SalesRecord[], year: number, recordType: RecordType): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    if (Number(r.record_year) !== year) continue;
    const m = Number(r.record_month);
    if (m >= 1 && m <= 12) out[m - 1] += Number(r.amount_usd);
  }
  return out;
}

export function historicalMatrix(records: SalesRecord[], years: number[], recordType: RecordType): number[][] {
  return years.map((y) => monthlyTotals(records, y, recordType));
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/forecast-widget-data.ts src/lib/__tests__/forecast-widget-data.test.ts
git commit -m "feat(forecast): helpers de series mensuales e histórico para widgets + tests"
```

---

### Task 3: Componentes extraídos (Global Mensual, estacional, tech-service)

**Files:** Create `src/components/charts/dashboard/monthly-comparison-chart.tsx`, `src/components/charts/dashboard/seasonal-forecast-chart.tsx`, `src/components/charts/dashboard/tech-service-widget.tsx`

READ `src/app/(dashboard)/analytics/page.tsx` completo antes de empezar.

- [ ] **Step 1: `monthly-comparison-chart.tsx`** — MUEVE aquí el `<Card>` del gráfico "Global Mensual" de la pestaña Exploración (el que tiene `CardTitle` con "Órdenes de Venta (Reserva)"/"Facturación (Ventas)" y el `<BarChart data={monthlyData}>`), junto con su tooltip `CustomMonthlyTooltip` si sólo lo usa ese gráfico. Firma:
```tsx
export function MonthlyComparisonChart({
  recordType, yearA, yearB, records, prevRecords,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
}) { /* … */ }
```
Calcula dentro, con `useMemo`, la serie mensual `{month, [`Año ${yearA}`]: n, [`Año ${yearB}`]: n, acumA, acumB}` usando `monthlyTotals` de `@/lib/forecast-widget-data` (una llamada por año) y `MONTHS`. Aplica el patrón de altura: `Card` `flex h-full flex-col`, `CardContent` `min-h-0 flex-1`, `ResponsiveContainer height="100%" minHeight={350}`.

- [ ] **Step 2: `seasonal-forecast-chart.tsx`** — MUEVE aquí la `<Card>` del gráfico "Histórico con Proyección Estacional" (pestaña Forecast, el `<ComposedChart data={forecastMonthlyData}>` con su `defs`/filtro glow, tooltip inline, barras y línea de tendencia). Firma:
```tsx
export function SeasonalForecastChart({
  recordType, year,
}: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) { /* … */ }
```
Es AUTÓNOMO: `useQuery({queryKey:["sales",{}], queryFn:()=>getSalesData({})})`; con esos registros arma `monthlyTotals(records, year, recordType)`, `monthlyTotals(records, year-1, ...)` e `historicalMatrix(records,[2025,2024,2023],...)`, llama a `computeForecast` (mismos parámetros que usa hoy `analytics/page.tsx`: `weights:[3,2,1]`, `now` con mes/día/díasDelMes actuales, `isCurrentActualYear: year === new Date().getFullYear()`) y construye `forecastMonthlyData` = `MONTHS.map((m,i)=>({month:m.label, [`Año ${year}`]: real[i], tendencia: forecast.monthlyForecast[i]}))`. Mismo patrón de altura (`minHeight={400}`). Muestra `<Skeleton className="h-full min-h-[400px] w-full" />` mientras carga.

- [ ] **Step 3: `tech-service-widget.tsx`**:
```tsx
"use client";

import { useMemo, useState } from "react";
import { TechServiceAnalysis } from "@/components/charts/tech-service-analysis";
import { buildTechServiceData, type TechServiceViewMode } from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

export function TechServiceWidget({
  recordType, yearA, yearB, records, prevRecords, catMap,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
}) {
  const [viewMode, setViewMode] = useState<TechServiceViewMode>("QUARTERLY");
  const data = useMemo(
    () => buildTechServiceData(records, prevRecords, catMap, recordType, viewMode),
    [records, prevRecords, catMap, recordType, viewMode]
  );
  return (
    <TechServiceAnalysis
      data={data}
      yearA={yearA}
      yearB={yearB}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}
```

- [ ] **Step 4:** `npx tsc --noEmit` + `npm run lint`. (`analytics/page.tsx` puede quedar temporalmente con código duplicado; se limpia en la Task 6.)
- [ ] **Step 5:** Commit:
```bash
git add src/components/charts/dashboard/
git commit -m "feat(dashboard): componentes autónomos de Global Mensual, estacional y Análisis Financiero"
```

---

### Task 4: ForecastSummaryWidget

**Files:** Create `src/components/charts/dashboard/forecast-summary-widget.tsx`

- [ ] **Step 1: Implementar** (una sola pieza sirve para la tarjeta de mes y la de año):
```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import { computeForecast } from "@/lib/forecast";
import { monthlyTotals, historicalMatrix } from "@/lib/forecast-widget-data";
import { PredictiveRunRateCard } from "@/components/charts/premium/predictive-run-rate";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_HELP } from "@/lib/chart-help";
import type { SalesRecord } from "@/types/database";

export function ForecastSummaryWidget({
  recordType, year, scope,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
  scope: "month" | "year";
}) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });

  const forecast = useMemo(() => {
    const records = (data ?? []) as SalesRecord[];
    const now = new Date();
    return computeForecast({
      currentYearMonthly: monthlyTotals(records, year, recordType),
      lastYearMonthly: monthlyTotals(records, year - 1, recordType),
      historicalMatrix: historicalMatrix(records, [2025, 2024, 2023], recordType),
      weights: [3, 2, 1],
      now: {
        monthIdx: now.getMonth(),
        day: now.getDate(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      },
      isCurrentActualYear: year === now.getFullYear(),
    });
  }, [data, year, recordType]);

  if (isLoading) return <Skeleton className="h-full min-h-[200px] w-full" />;

  const s = scope === "month" ? forecast.month : forecast.year;
  return (
    <PredictiveRunRateCard
      title={scope === "month" ? "Proyección de Cierre (Mes Actual)" : `Proyección de Cierre Año ${year}`}
      currentLabel={scope === "month" ? "Ventas Actuales" : "Ventas Acum. (YTD)"}
      targetLabel={scope === "month" ? "Mismo mes año anterior" : `Total Año ${year - 1}`}
      currentTotal={s.actual}
      lastYearMonthTotal={s.reference}
      projectedTotal={s.value}
      low={s.low}
      high={s.high}
      deltaPct={s.deltaPct}
      deltaLabel={scope === "month" ? "mismo mes año anterior" : "mismo periodo año anterior"}
      info={scope === "month" ? CHART_HELP.forecastMes : CHART_HELP.forecastAnio}
    />
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`. Si `PredictiveRunRateCard` no acepta alguna de esas props, verifica su interfaz y ajusta (debe aceptar `info`, `low`, `high`, `deltaPct`, `deltaLabel`).
- [ ] **Step 3:** Commit:
```bash
git add src/components/charts/dashboard/forecast-summary-widget.tsx
git commit -m "feat(forecast): widget autónomo de proyección de cierre (mes y año)"
```

---

### Task 5: Registro — 10 widgets nuevos

**Files:** Modify `src/lib/dashboard-layout.ts`, `src/lib/widget-registry.tsx`, `src/components/dashboard/dashboard-data-provider.tsx`, `src/components/dashboard/widget-picker.tsx`, `src/lib/chart-help.ts`, `src/components/charts/premium/group-evolution-card.tsx`, `src/components/charts/premium/group-forecast-card.tsx`

- [ ] **Step 1: Quitar prop vestigial** — en `group-evolution-card.tsx` elimina `savedGroups: CategoryGroup[];` de `GroupEvolutionCardProps`; igual en `group-forecast-card.tsx`. Elimina el import de `CategoryGroup` si queda huérfano.

- [ ] **Step 2: Ids** — en `src/lib/dashboard-layout.ts`, añade al final de `WIDGET_IDS` (antes del `] as const`):
```ts
  "global-mensual", "analisis-financiero", "historico-categoria", "agrupaciones", "evolucion-grupos",
  "forecast-mes", "forecast-anio", "forecast-estacional", "forecast-categoria", "forecast-grupos",
```

- [ ] **Step 3: Contexto con categorías** — en `dashboard-data-provider.tsx` añade `categories: Category[]` a `DashboardData` (import `type { Category } from "@/types/database"`) y expórtalo en el `value` (`categories: cats as Category[]`). En `widget-registry.tsx` añade `categories: Category[]` a `WidgetContext`. En `dashboard-grid.tsx` añade `categories: data.categories` al objeto `ctx`.

- [ ] **Step 4: Secciones** — en `widget-registry.tsx` amplía `WidgetSection` a `"KPIs" | "Dashboard" | "Exploración" | "Forecast" | "Comercial" | "Margen"`. En `widget-picker.tsx` actualiza `SECTIONS` a ese mismo orden.

- [ ] **Step 5: Widgets** — añade a `WIDGETS` (imports arriba del archivo):
```tsx
  // --- Exploración ---
  {
    id: "global-mensual", title: "Ventas mensuales (año A vs B)", section: "Exploración",
    defaultSize: { w: 12, h: 11 }, minSize: { w: 4, h: 8 },
    render: (c) => (
      <MonthlyComparisonChart recordType={c.recordType} yearA={c.year} yearB={c.year - 1}
        records={c.records} prevRecords={c.prevRecords} />
    ),
  },
  {
    id: "analisis-financiero", title: "Análisis Financiero (ST vs C&R)", section: "Exploración",
    defaultSize: { w: 12, h: 16 }, minSize: { w: 6, h: 10 },
    render: (c) => (
      <TechServiceWidget recordType={c.recordType} yearA={c.year} yearB={c.year - 1}
        records={c.records} prevRecords={c.prevRecords} catMap={c.catMap} />
    ),
  },
  {
    id: "historico-categoria", title: "Histórico por categoría", section: "Exploración",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: () => <HistoricalSalesCategory />,
  },
  {
    id: "agrupaciones", title: "Análisis por agrupaciones", section: "Exploración",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: (c) => <GroupingAnalysisCard categories={c.categories} recordType={c.recordType} />,
  },
  {
    id: "evolucion-grupos", title: "Evolución por grupo", section: "Exploración",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: (c) => <GroupEvolutionCard recordType={c.recordType} />,
  },

  // --- Forecast ---
  {
    id: "forecast-mes", title: "Proyección de cierre (mes)", section: "Forecast",
    defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 5 },
    render: (c) => <ForecastSummaryWidget recordType={c.recordType} year={c.year} scope="month" />,
  },
  {
    id: "forecast-anio", title: "Proyección de cierre (año)", section: "Forecast",
    defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 5 },
    render: (c) => <ForecastSummaryWidget recordType={c.recordType} year={c.year} scope="year" />,
  },
  {
    id: "forecast-estacional", title: "Histórico con proyección estacional", section: "Forecast",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: (c) => <SeasonalForecastChart recordType={c.recordType} year={c.year} />,
  },
  {
    id: "forecast-categoria", title: "Forecast por categoría", section: "Forecast",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: (c) => <ForecastSalesCategory baseYear={c.year} />,
  },
  {
    id: "forecast-grupos", title: "Forecast por grupo", section: "Forecast",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 },
    render: (c) => <GroupForecastCard recordType={c.recordType} baseYear={c.year} />,
  },
```

- [ ] **Step 6: Copy** — en `src/lib/chart-help.ts` añade las claves que falten y úsalas si el componente admite `info`. Como mínimo: `globalMensual: "Ventas por mes del año seleccionado frente al anterior, para el tipo de registro elegido."`.

- [ ] **Step 7:** `npx tsc --noEmit` (verifica que `MISSING_WIDGETS` sigue vacío: los 32 ids deben estar en `WIDGETS`) + `npm run lint` (≤10 warnings).
- [ ] **Step 8:** Commit:
```bash
git add src/lib/dashboard-layout.ts src/lib/widget-registry.tsx src/lib/chart-help.ts src/components/dashboard/ src/components/charts/premium/group-evolution-card.tsx src/components/charts/premium/group-forecast-card.tsx
git commit -m "feat(dashboard): 10 widgets nuevos de Exploración y Forecast (catálogo 32)"
```

---

### Task 6: Limpiar `analytics/page.tsx` y borrar el spike

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`; Delete `src/app/(dashboard)/spike-grid/page.tsx`

- [ ] **Step 1:** En `analytics/page.tsx`:
  - Sustituye el `useMemo` de `techServiceData` por una llamada a `buildTechServiceData(dataA, dataB, catMap, recordType, techServiceViewMode)` del lib nuevo, y elimina `ST_CATEGORIES`/`CR_CATEGORIES` locales (ahora se importan de `@/lib/tech-service` si siguen haciendo falta).
  - Sustituye el gráfico inline "Global Mensual" por `<MonthlyComparisonChart …/>` y el estacional por `<SeasonalForecastChart …/>`, pasando las props que esperan.
  - Quita `savedGroups` de las llamadas a `<GroupEvolutionCard>` y `<GroupForecastCard>`; si `savedGroups` queda sin uso, elimina también su `useMemo` y los imports huérfanos.
  - Verifica con `npx tsc --noEmit` que no quedan variables/imports sin usar.
- [ ] **Step 2:** Borrar el spike:
```bash
rm -rf "src/app/(dashboard)/spike-grid"
```
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint` (≤10 warnings, 0 errores).
- [ ] **Step 4:** Commit:
```bash
git add -A "src/app/(dashboard)"
git commit -m "refactor(analisis): usar componentes/libs compartidos y eliminar la ruta de spike"
```

---

### Task 7: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Sin migración: los layouts guardados siguen válidos; los ids nuevos sólo aparecen al añadirlos.
- Todos los componentes nuevos siguen el patrón de altura flexible ya establecido.
- Si algún componente extraído usa variables del padre que no están en sus props, pásalas como prop explícita (no crear estado global).
