# Forecast más realista (A+B+C+D+E) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forecast de cierre de mes/año más realista: blend run-rate↔esperado (A), estacionalidad ponderada por recencia (B), año mezclado por ritmo YoY para reducir amplificación (C), On Track por ritmo real (D), banda + redondeo (E).

**Architecture:** Motor puro `src/lib/forecast.ts` (`computeForecast`) + `calculateSeasonalityFactors` con pesos. Panel principal usa el motor completo; forecasts por categoría/grupo adoptan la estacionalidad ponderada.

**Tech Stack:** Next 16, recharts, vitest. Sin BD ni migraciones.

Contexto verificado:
- Lógica actual del forecast en `analytics/page.tsx:201-238` (useMemo) + cards en `531-544` + chart `574` + explainer `648-696`.
- Misma matemática duplicada en `forecast-sales-category.tsx:169-181` y `group-forecast-card.tsx:129-141`.
- `calculateRunRate`, `calculateSeasonalityFactors`, `getSeasonalForecast` en `@/lib/math-utils` (se conservan).
- `PredictiveRunRateCard` props actuales: `currentTotal, lastYearMonthTotal, projectedTotal?, title?, currentLabel?, targetLabel?, className`.

---

### Task 1: `calculateSeasonalityFactors` con pesos (B) + tests

**Files:** Modify `src/lib/math-utils.ts`; Create `src/lib/__tests__/math-utils.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/math-utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { calculateSeasonalityFactors } from "@/lib/math-utils";

describe("calculateSeasonalityFactors", () => {
  it("los factores suman 1", () => {
    const f = calculateSeasonalityFactors([[10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("sin pesos = equiponderado (retrocompatible)", () => {
    const ene = [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const dic = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12];
    const f = calculateSeasonalityFactors([ene, dic]);
    expect(f[0]).toBeCloseTo(0.5);
    expect(f[11]).toBeCloseTo(0.5);
  });
  it("pesos por recencia dan más peso al año reciente", () => {
    const reciente = [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const viejo = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12];
    const f = calculateSeasonalityFactors([reciente, viejo], [3, 1]);
    expect(f[0]).toBeCloseTo(0.75);
    expect(f[11]).toBeCloseTo(0.25);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/math-utils.test.ts` → el 3er test FALLA (pesos aún no soportados).

- [ ] **Step 3: Implementar** — en `src/lib/math-utils.ts`, reemplazar la firma/cuerpo de `calculateSeasonalityFactors` por:
```ts
export function calculateSeasonalityFactors(historicalData: number[][], weights?: number[]): number[] {
  const n = historicalData.length;
  if (n === 0) return Array(12).fill(1 / 12);

  const monthlySums = Array(12).fill(0);
  let weightSum = 0;

  historicalData.forEach((yearData, idx) => {
    const yearTotal = yearData.reduce((a, b) => a + b, 0);
    if (yearTotal === 0) return;
    const wgt = weights?.[idx] ?? 1;
    weightSum += wgt;
    yearData.forEach((amount, monthIndex) => {
      // Peso de cada mes = su cuota del año, ponderada por recencia del año.
      monthlySums[monthIndex] += (amount / yearTotal) * wgt;
    });
  });

  if (weightSum === 0) return Array(12).fill(1 / 12);

  const factors = monthlySums.map((sum) => sum / weightSum);
  const factorsSum = factors.reduce((a, b) => a + b, 0);
  return factors.map((f) => f / (factorsSum || 1));
}
```
(Sin `weights`, `wgt=1` y `weightSum=nº años válidos` → idéntico al comportamiento anterior.)

- [ ] **Step 4:** vitest PASS (3/3) + `npx tsc --noEmit` + `npm run lint` (≤10 warnings).
- [ ] **Step 5:** Commit:
```bash
git add src/lib/math-utils.ts src/lib/__tests__/math-utils.test.ts
git commit -m "feat(forecast): estacionalidad ponderada por recencia (B) + tests"
```

---

### Task 2: Motor `computeForecast` (A+C+D+E) + tests

**Files:** Create `src/lib/forecast.ts`, `src/lib/__tests__/forecast.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/forecast.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeForecast, type ForecastInput } from "@/lib/forecast";

const arr = (obj: Record<number, number> = {}) => Array.from({ length: 12 }, (_, i) => obj[i] ?? 0);
// Año histórico uniforme (cada mes 100) → estacionalidad plana 1/12.
const flatHist = [Array.from({ length: 12 }, () => 100)];

function baseInput(over: Partial<ForecastInput>): ForecastInput {
  return {
    currentYearMonthly: arr(),
    lastYearMonthly: arr(),
    historicalMatrix: flatHist,
    weights: [1],
    now: { monthIdx: 0, day: 15, daysInMonth: 30 },
    isCurrentActualYear: true,
    ...over,
  };
}

describe("computeForecast — mes (A)", () => {
  it("a mitad de mes mezcla runRate y esperado 50/50", () => {
    // Ene MTD=50 en día 15/30 → runRate=100. Sin meses cerrados → pace=1 → esperado=Ene año prev=200.
    const r = computeForecast(baseInput({
      currentYearMonthly: arr({ 0: 50 }),
      lastYearMonthly: arr({ 0: 200 }),
      now: { monthIdx: 0, day: 15, daysInMonth: 30 },
    }));
    expect(r.month.value).toBe(150); // 0.5*100 + 0.5*200
  });
  it("a fin de mes el mes = runRate", () => {
    const r = computeForecast(baseInput({
      currentYearMonthly: arr({ 0: 90 }),
      lastYearMonthly: arr({ 0: 200 }),
      now: { monthIdx: 0, day: 30, daysInMonth: 30 },
    }));
    expect(r.month.value).toBe(90);
  });
});

describe("computeForecast — ritmo/On Track (D)", () => {
  it("YTD por delante del año anterior → onTrack y deltaPct>0", () => {
    const cur = Array.from({ length: 12 }, (_, i) => (i < 6 ? 100 : 0));  // 600 en meses 0..5
    const prev = Array.from({ length: 12 }, (_, i) => (i < 6 ? 80 : 0));  // 480
    const r = computeForecast(baseInput({
      currentYearMonthly: cur,
      lastYearMonthly: prev,
      now: { monthIdx: 6, day: 1, daysInMonth: 31 },
    }));
    expect(r.year.deltaPct).toBeCloseTo(0.25); // (600-480)/480
    expect(r.year.onTrack).toBe(true);
  });
});

describe("computeForecast — banda y redondeo (E)", () => {
  it("low ≤ value ≤ high y son enteros", () => {
    const r = computeForecast(baseInput({ currentYearMonthly: arr({ 0: 33 }), now: { monthIdx: 0, day: 10, daysInMonth: 30 } }));
    expect(Number.isInteger(r.year.value)).toBe(true);
    expect(Number.isInteger(r.year.low)).toBe(true);
    expect(r.year.low).toBeLessThanOrEqual(r.year.value);
    expect(r.year.high).toBeGreaterThanOrEqual(r.year.value);
  });
});

describe("computeForecast — año pasado", () => {
  it("isCurrentActualYear=false → sin proyección, value = suma actuals", () => {
    const cur = Array.from({ length: 12 }, () => 10); // 120
    const r = computeForecast(baseInput({ currentYearMonthly: cur, isCurrentActualYear: false }));
    expect(r.year.value).toBe(120);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/forecast.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — crear `src/lib/forecast.ts`:
```ts
import { calculateSeasonalityFactors, calculateRunRate } from "@/lib/math-utils";

export interface ForecastNow {
  monthIdx: number;   // 0-11
  day: number;        // día del mes
  daysInMonth: number;
}

export interface ForecastInput {
  currentYearMonthly: number[]; // 12, actuals del año A
  lastYearMonthly: number[];    // 12, actuals del año B (anterior)
  historicalMatrix: number[][]; // años recientes primero
  weights: number[];            // alineado a historicalMatrix (p.ej. [3,2,1])
  now: ForecastNow;
  isCurrentActualYear: boolean; // año A === año de calendario actual
}

export interface ProjectionStat {
  value: number;
  low: number;
  high: number;
  actual: number;    // MTD (mes) / YTD (año)
  reference: number; // año anterior (mismo mes / total)
  deltaPct: number | null; // ritmo vs mismo periodo año anterior
  onTrack: boolean;
}

export interface ForecastResult {
  monthlyForecast: number[]; // 12 (línea del chart)
  month: ProjectionStat;
  year: ProjectionStat;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r0 = (x: number) => Math.round(x);

export function computeForecast(input: ForecastInput): ForecastResult {
  const { currentYearMonthly, lastYearMonthly, historicalMatrix, weights, now, isCurrentActualYear } = input;
  const { monthIdx, day, daysInMonth } = now;

  const factors = calculateSeasonalityFactors(historicalMatrix, weights); // (B)

  const w = isCurrentActualYear ? clamp01(daysInMonth > 0 ? day / daysInMonth : 1) : 1;
  const completedCount = isCurrentActualYear ? monthIdx : 12;
  const completedActual = sum(currentYearMonthly.slice(0, completedCount));
  const lastYearCompleted = sum(lastYearMonthly.slice(0, completedCount));
  const yoyPace = lastYearCompleted > 0 ? completedActual / lastYearCompleted : 1;

  // --- (A) MES actual ---
  const mtd = currentYearMonthly[monthIdx] || 0;
  const lastYearThisMonth = lastYearMonthly[monthIdx] || 0;
  let monthValue: number;
  if (isCurrentActualYear) {
    const runRate = calculateRunRate(mtd, day, daysInMonth);
    const expected = lastYearThisMonth > 0 ? lastYearThisMonth * yoyPace : runRate;
    monthValue = w * runRate + (1 - w) * expected;
  } else {
    monthValue = mtd;
  }
  const monthRef = lastYearThisMonth * w;
  const monthDelta = monthRef > 0 ? (mtd - monthRef) / monthRef : null;
  const monthUnc = isCurrentActualYear ? (1 - w) * 0.5 : 0; // (E)
  const monthStat: ProjectionStat = {
    value: r0(monthValue),
    low: r0(monthValue * (1 - monthUnc)),
    high: r0(monthValue * (1 + monthUnc)),
    actual: r0(mtd),
    reference: r0(lastYearThisMonth),
    deltaPct: monthDelta,
    onTrack: monthDelta === null ? monthValue >= lastYearThisMonth : monthDelta >= 0,
  };

  // --- (C) AÑO ---
  const knownTotal = completedActual + (isCurrentActualYear ? monthValue : 0);
  const knownSeasonality = isCurrentActualYear ? sum(factors.slice(0, monthIdx + 1)) : 1;
  const seasonalYearEst = knownSeasonality > 0 ? knownTotal / knownSeasonality : knownTotal;
  const lastYearTotal = sum(lastYearMonthly);
  const paceYearEst = lastYearTotal > 0 ? lastYearTotal * yoyPace : seasonalYearEst;
  const wy = clamp01(knownSeasonality);
  const yearEstimate = isCurrentActualYear ? wy * seasonalYearEst + (1 - wy) * paceYearEst : completedActual;

  const monthlyForecast = factors.map((f, i) => {
    if (!isCurrentActualYear) return currentYearMonthly[i] || 0;
    if (i < monthIdx) return currentYearMonthly[i] || 0;
    if (i === monthIdx) return monthValue;
    return yearEstimate * f;
  });
  const yearValue = sum(monthlyForecast);

  // (E) banda: dispersión entre las formas históricas
  const estimates: number[] = [yearValue];
  if (isCurrentActualYear) {
    for (const yearData of historicalMatrix) {
      const t = sum(yearData);
      if (t <= 0) continue;
      const cumShare = sum(yearData.slice(0, monthIdx + 1)) / t;
      if (cumShare > 0) estimates.push(knownTotal / cumShare);
    }
  }
  const yearLow = Math.min(...estimates);
  const yearHigh = Math.max(...estimates);

  // (D) ritmo del año vs mismo periodo del año anterior (prorrateado al día)
  const ytdActual = completedActual + (isCurrentActualYear ? mtd : 0);
  const lastYearToDate = lastYearCompleted + (isCurrentActualYear ? lastYearThisMonth * w : 0);
  const yearDelta = lastYearToDate > 0 ? (ytdActual - lastYearToDate) / lastYearToDate : null;

  const yearStat: ProjectionStat = {
    value: r0(yearValue),
    low: r0(yearLow),
    high: r0(yearHigh),
    actual: r0(ytdActual),
    reference: r0(lastYearTotal),
    deltaPct: yearDelta,
    onTrack: yearDelta === null ? yearValue >= lastYearTotal : yearDelta >= 0,
  };

  return { monthlyForecast, month: monthStat, year: yearStat };
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/forecast.ts src/lib/__tests__/forecast.test.ts
git commit -m "feat(forecast): motor computeForecast (blend mes A, año por ritmo C, On Track D, banda E)"
```

---

### Task 3: `PredictiveRunRateCard` con banda + ritmo (D+E)

**Files:** Modify `src/components/charts/premium/predictive-run-rate.tsx`

- [ ] **Step 1:** READ el archivo. Reemplázalo COMPLETO por:
```tsx
"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { formatUSD } from "@/lib/constants";
import { calculateRunRate } from "@/lib/math-utils";
import { cn } from "@/lib/utils";

interface PredictiveRunRateCardProps {
  currentTotal: number;
  lastYearMonthTotal: number;
  projectedTotal?: number;
  low?: number;
  high?: number;
  deltaPct?: number | null;
  deltaLabel?: string;
  title?: string;
  currentLabel?: string;
  targetLabel?: string;
  className?: string;
}

const money0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function PredictiveRunRateCard({
  currentTotal,
  lastYearMonthTotal,
  projectedTotal: externalProjectedTotal,
  low,
  high,
  deltaPct,
  deltaLabel = "año anterior",
  title = "Proyección de Cierre (Mes Actual)",
  currentLabel = "Ventas Actuales",
  targetLabel = "Objetivo (Año Prev.)",
  className,
}: PredictiveRunRateCardProps) {
  const now = new Date();
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const projectedTotal = externalProjectedTotal ?? calculateRunRate(currentTotal, currentDay, totalDays);
  const progressPercent = projectedTotal > 0 ? Math.min(100, (currentTotal / projectedTotal) * 100) : 0;

  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const isOnTrack = hasDelta ? (deltaPct as number) >= 0 : projectedTotal >= lastYearMonthTotal;
  const hasBand = low !== undefined && high !== undefined && high > low;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("relative group", className)}
    >
      <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-50 pointer-events-none" />

        <CardContent className="p-6 relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{title}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                  {money0(projectedTotal)}
                </span>
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Forecast
                </span>
              </div>
              {hasBand && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Rango estimado: {money0(low!)} – {money0(high!)}
                </p>
              )}
            </div>

            <div className={cn(
              "p-3 rounded-2xl border backdrop-blur-md transition-all duration-500 group-hover:scale-110",
              isOnTrack
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                : "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            )}>
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end text-sm">
              <div className="space-y-1">
                <span className="text-muted-foreground">{currentLabel}</span>
                <p className="font-bold tabular-nums">{formatUSD(currentTotal)}</p>
              </div>
              <div className="text-right space-y-1">
                <span className="text-muted-foreground">{targetLabel}</span>
                <p className="font-bold tabular-nums text-muted-foreground/80">{formatUSD(lastYearMonthTotal)}</p>
              </div>
            </div>

            <div className="relative h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_15px_rgba(99,102,241,0.5)] z-20"
              />
              <div className="absolute inset-y-0 left-0 w-full bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,rgba(99,102,241,0.2)_4px,rgba(99,102,241,0.2)_8px)] z-10" />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", isOnTrack ? "bg-emerald-500" : "bg-amber-500")} />
              <span className={cn("text-xs font-bold uppercase tracking-wider", isOnTrack ? "text-emerald-500" : "text-amber-500")}>
                {isOnTrack ? "En Trayectoria (On Track)" : "En Riesgo (At Risk)"}
              </span>
              {hasDelta && (
                <span className="text-xs font-medium text-muted-foreground normal-case tracking-normal">
                  · {(deltaPct as number) >= 0 ? "+" : ""}{((deltaPct as number) * 100).toFixed(1)}% vs {deltaLabel}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/charts/premium/predictive-run-rate.tsx
git commit -m "feat(forecast): banda de incertidumbre + ritmo vs año anterior en PredictiveRunRateCard"
```

---

### Task 4: Re-cablear el panel principal (`analytics/page.tsx`)

**Files:** Modify `src/app/(dashboard)/analytics/page.tsx`

READ el archivo. Los cambios:

- [ ] **Step 1: Imports** — en la línea 17 elimina `getSeasonalForecast, calculateRunRate` (y `calculateSeasonalityFactors` si deja de usarse en el archivo tras el cambio) del import de `@/lib/math-utils`; añade:
```tsx
import { computeForecast } from "@/lib/forecast";
```

- [ ] **Step 2: Bloque de cálculo** — en el `useMemo` (`~175-238`), sustituye desde `// --- Calcular Forecast Proyectado ---` (l.212) hasta el `return` (l.237) por:
```ts
    const now = new Date();
    const currentYearMonthly = parsedMonthlyData.map((d) => d.rawA);
    const lastYearMonthly = parsedMonthlyData.map((d) => Number(d[`Año ${yearB}`] || 0));

    const forecast = computeForecast({
      currentYearMonthly,
      lastYearMonthly,
      historicalMatrix,
      weights: [3, 2, 1], // 2025 / 2024 / 2023
      now: {
        monthIdx: now.getMonth(),
        day: now.getDate(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      },
      isCurrentActualYear: yearA === now.getFullYear(),
    });

    const forecastWithTrend = parsedMonthlyData.map((d, i) => ({
      ...d,
      tendencia: Math.round(forecast.monthlyForecast[i] * 100) / 100,
    }));

    return { monthlyData: parsedMonthlyData, forecastMonthlyData: forecastWithTrend, forecast };
```
(La línea 210 `const seasonalityFactors = calculateSeasonalityFactors(historicalMatrix);` se ELIMINA; `historicalMatrix` sigue construyéndose en l.202-208 porque lo consume `computeForecast`.) Ajusta la desestructuración del `useMemo`:
```ts
  const { monthlyData, forecastMonthlyData, forecast } = useMemo(() => {
```

- [ ] **Step 3: Cards** — reemplaza el bloque de las 2 `PredictiveRunRateCard` (`~531-544`) por:
```tsx
                  <PredictiveRunRateCard
                    currentTotal={forecast.month.actual}
                    lastYearMonthTotal={forecast.month.reference}
                    projectedTotal={forecast.month.value}
                    low={forecast.month.low}
                    high={forecast.month.high}
                    deltaPct={forecast.month.deltaPct}
                    deltaLabel="mismo mes año anterior"
                  />

                  <PredictiveRunRateCard
                    title={`Proyección de Cierre Año ${yearA}`}
                    currentLabel="Ventas Acum. (YTD)"
                    targetLabel={`Total Año ${yearB}`}
                    currentTotal={forecast.year.actual}
                    lastYearMonthTotal={forecast.year.reference}
                    projectedTotal={forecast.year.value}
                    low={forecast.year.low}
                    high={forecast.year.high}
                    deltaPct={forecast.year.deltaPct}
                    deltaLabel="mismo periodo año anterior"
                  />
```

- [ ] **Step 4: Subtítulo del chart** — en la l.556 cambia el texto a:
```tsx
                        Datos reales {yearA} + proyección: estacionalidad ponderada por recencia y ritmo interanual.
```

- [ ] **Step 5: Explainer** — reemplaza los 4 `<li>` de "¿Cómo calculamos el Forecast?" (`~659-682`) por:
```tsx
                        <li>
                          <p className="text-zinc-950 font-bold flex items-center gap-2">1. Estacionalidad ponderada:</p>
                          <p className="text-xs opacity-80">El peso de cada mes se calcula del histórico dando más importancia a los años recientes (2025 pesa más que 2023).</p>
                        </li>
                        <li>
                          <p className="text-zinc-950 font-bold flex items-center gap-2">2. Mes en curso (mezcla):</p>
                          <p className="text-xs opacity-80">Combina el run-rate diario con lo esperado según el año anterior y el ritmo del año; al principio del mes pesa lo esperado, al final lo real.</p>
                        </li>
                        <li>
                          <p className="text-zinc-950 font-bold flex items-center gap-2">3. Cierre de año (por ritmo):</p>
                          <p className="text-xs opacity-80">Mezcla la extrapolación estacional con el ritmo interanual (YTD vs año anterior), evitando amplificar el error a principios de año.</p>
                        </li>
                        <li>
                          <p className="text-zinc-950 font-bold flex items-center gap-2">4. Banda de incertidumbre:</p>
                          <p className="text-xs opacity-80">Mostramos un rango basado en la dispersión de las formas históricas, no un único número con falsa precisión.</p>
                        </li>
```
Y el bloque "Run-Rate" (`~690-695`): cambia el `<h4>` a `Seguimiento y ritmo (On Track)` y el `<p>` a:
```tsx
                      Comparamos el acumulado con el mismo punto del año anterior: si vas por delante, <strong>&quot;En Trayectoria&quot; (On Track)</strong>; si por detrás, <strong>&quot;En Riesgo&quot; (At Risk)</strong>. El porcentaje muestra el ritmo real frente al año pasado.
```

- [ ] **Step 6:** `npx tsc --noEmit` (limpio; verifica que no queden imports sin usar) + `npm run lint` (0 errores, ≤10 warnings).
- [ ] **Step 7:** Commit:
```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(forecast): panel principal usa computeForecast (blend, banda, ritmo) + copy actualizado"
```

---

### Task 5: Propagar estacionalidad ponderada a categoría/grupo (B)

**Files:** Modify `src/components/charts/premium/forecast-sales-category.tsx`, `src/components/charts/premium/group-forecast-card.tsx`

- [ ] **Step 1:** En `forecast-sales-category.tsx:169`, cambia:
```tsx
        const seasonalityFactors = calculateSeasonalityFactors(historicalMatrix);
```
por:
```tsx
        const seasonalityFactors = calculateSeasonalityFactors(historicalMatrix, [3, 2, 1]);
```
(El orden de `historicalYears` es `[2025, 2024, 2023]`, así que `[3,2,1]` alinea bien.)

- [ ] **Step 2:** En `group-forecast-card.tsx:129`, aplica el mismo cambio (verifica que `historicalYears`/`historicalMatrix` estén ordenados recientes-primero; si no, ajusta el orden de los pesos para que el más reciente reciba 3).

- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 4:** Commit:
```bash
git add src/components/charts/premium/forecast-sales-category.tsx src/components/charts/premium/group-forecast-card.tsx
git commit -m "feat(forecast): estacionalidad ponderada por recencia en forecast por categoría y grupo"
```

---

### Task 6: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde (lint ≤10 warnings).
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Sin tablas ni migraciones → solo redeploy en EasyPanel.
- `getSeasonalForecast`/`calculateRunRate` se conservan (motor y retrocompatibilidad).
- Degradación: sin año anterior → `yoyPace=1`, `expected=runRate`; banda desde formas históricas; nada rompe.
- El número del forecast se muestra **sin céntimos** (`money0`); las "Ventas Actuales"/"Total Año prev" siguen con `formatUSD`.
```
