# Selector $/% en gráficos de Margen — Implementation Plan

> **For agentic workers:** Ejecutar tarea a tarea. Steps con checkbox (`- [ ]`).

**Goal:** Selector `$ | %` dentro de "Margen por artículo (top 15)" e "Importe vs margen".

**Architecture:** `AmountModeToggle` compartido + estado local `mode` en cada tarjeta. Sin datos nuevos.

**Tech:** Next 16, recharts.

---

### Task 1: AmountModeToggle + copy

- [ ] **Step 1:** Crear `src/components/common/amount-mode-toggle.tsx`:
```tsx
"use client";

import { cn } from "@/lib/utils";

export type AmountMode = "money" | "pct";

export function AmountModeToggle({
  value, onChange, className,
}: { value: AmountMode; onChange: (m: AmountMode) => void; className?: string }) {
  return (
    <div className={cn("inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs", className)}>
      {(["money", "pct"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={cn(
            "rounded-sm px-2 py-0.5 font-medium transition-colors",
            value === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "money" ? "$" : "%"}
        </button>
      ))}
    </div>
  );
}
```
- [ ] **Step 2:** En `src/lib/chart-help.ts`, añadir al final de `margenPorArticulo` y `margenScatter` la frase " Usa el selector $/% para ver importe o porcentaje."
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`. Commit `feat(margen): AmountModeToggle + copy`.

### Task 2: Margen por artículo

- [ ] **Step 1:** En `margin-by-item-card.tsx`: importar `useState`, `AmountModeToggle`, `type AmountMode`. Estado `const [mode, setMode] = useState<AmountMode>("money");`.
- [ ] **Step 2:** `top` re-ordena según modo:
```tsx
  const top = useMemo(() => {
    const items = buildMarginItems(data ?? []);
    const sorted = mode === "pct"
      ? [...items].sort((a, b) => b.margenPct - a.margenPct || a.label.localeCompare(b.label))
      : items;
    return sorted.slice(0, 15);
  }, [data, mode]);
```
- [ ] **Step 3:** Cabecera con toggle a la derecha y subtítulo adaptado:
```tsx
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold"><span className="inline-flex items-center gap-1.5">Margen por artículo {year} (top 15)<InfoTooltip text={CHART_HELP.margenPorArticulo} /></span></CardTitle>
          <p className="text-xs text-muted-foreground">{mode === "pct" ? "Margen % estimado; solo bienes con costo." : "Margen $ estimado; solo bienes con costo."}</p>
        </div>
        <AmountModeToggle value={mode} onChange={setMode} />
      </CardHeader>
```
- [ ] **Step 4:** XAxis + Bar según modo:
```tsx
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={mode === "pct" ? (v) => `${Math.round(v)}%` : formatCompactUSD} tickLine={false} axisLine={false} />
              ...
              <Bar dataKey={mode === "pct" ? "margenPct" : "margen"} name="Margen" fill="#10b981" radius={[0, 4, 4, 0]} />
```
- [ ] **Step 5:** `npx tsc --noEmit` + `npm run lint`. Commit `feat(margen): selector $/% en Margen por artículo`.

### Task 3: Importe vs margen (scatter)

- [ ] **Step 1:** En `margin-scatter-card.tsx`: importar `useState`, `AmountModeToggle`, `type AmountMode`. Estado `const [mode, setMode] = useState<AmountMode>("pct");`.
- [ ] **Step 2:** `points` según modo:
```tsx
  const { points, overallPct } = useMemo(() => {
    const base = buildMarginItems(data ?? []);
    const pts = base.map((p) => ({ ...p, yPlot: mode === "pct" ? Math.max(p.margenPct, FLOOR_PCT) : p.margen }));
    const totV = pts.reduce((s, p) => s + p.ventas, 0);
    const totC = pts.reduce((s, p) => s + p.costo, 0);
    return { points: pts, overallPct: deriveMargin(totV, totC).margenPct };
  }, [data, mode]);
```
- [ ] **Step 3:** Cabecera con toggle + título/subtítulo adaptados:
```tsx
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold"><span className="inline-flex items-center gap-1.5">Importe vs margen {mode === "pct" ? "%" : "$"} {year}<InfoTooltip text={CHART_HELP.margenScatter} /></span></CardTitle>
          <p className="text-xs text-muted-foreground">{mode === "pct"
            ? "Cada punto es un artículo (bienes). Ámbar = margen % global; gris = equilibrio (0%). Márgenes bajo −50% se recortan al borde."
            : "Cada punto es un artículo (bienes). Gris = equilibrio (0). Eje Y = margen $ estimado."}</p>
        </div>
        <AmountModeToggle value={mode} onChange={setMode} />
      </CardHeader>
```
- [ ] **Step 4:** YAxis + ReferenceLines según modo:
```tsx
              <YAxis
                type="number"
                dataKey="yPlot"
                name={mode === "pct" ? "Margen %" : "Margen $"}
                domain={mode === "pct" ? [FLOOR_PCT, 100] : ["auto", "auto"]}
                ticks={mode === "pct" ? [-50, -25, 0, 25, 50, 75, 100] : undefined}
                allowDataOverflow={mode === "pct"}
                className="text-xs fill-muted-foreground"
                tickFormatter={mode === "pct" ? (v) => `${Math.round(v)}%` : formatCompactUSD}
                tickLine={false}
                axisLine={false}
              />
              ...
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
              {mode === "pct" && <ReferenceLine y={overallPct} stroke="#f59e0b" strokeDasharray="4 4" />}
```
Si `domain={mode === "pct" ? [FLOOR_PCT, 100] : ["auto", "auto"]}` diera error de tipos en TS, tipar la expresión como `AxisDomain` (`import type { AxisDomain } from "recharts/types/util/types"`) o extraer a `const yDomain: [number, number] | ["auto","auto"] = ...`. El tooltip del scatter puede seguir mostrando "Margen %"; opcionalmente añade la línea de "Margen $" al `ScatterTooltip`.
- [ ] **Step 5:** `npx tsc --noEmit` + `npm run lint`. Commit `feat(margen): selector $/% en Importe vs margen`.

### Task 4: Build + push
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` verde → `git push origin main`.

## Notas
- Sin datos ni migraciones → redeploy.
- `formatCompactUSD` ya importado en ambos.
