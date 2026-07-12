# Tooltips informativos en gráficos y KPIs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Icono "i" con explicación (qué es + cómo se calcula) en cada gráfico/KPI del Dashboard y de las 4 pestañas de Análisis; en Forecast, quitar los bloques de pie e integrarlos en tooltips.

**Architecture:** `InfoTooltip` reutilizable sobre `@/components/ui/tooltip` + copy centralizado en `src/lib/chart-help.ts`. Icono junto al título de cada tarjeta/gráfico; `KPICard` con prop `info?`.

**Tech Stack:** Next 16, base-ui tooltip, lucide.

Contexto verificado:
- Primitiva `src/components/ui/tooltip.tsx` exporta `TooltipProvider, Tooltip, TooltipTrigger, TooltipContent` (base-ui). `TooltipContent` ya trae `max-w-xs`, flecha y animación.
- Patrón de cabecera con `<CardHeader><CardTitle>` en `charts/dashboard/*` y `bar-chart-monthly.tsx`; cabeceras premium con `<h3>/<h4>` y flex propio (p.ej. `concentration-card.tsx`, `predictive-run-rate.tsx`).
- `KPICard` (`src/components/cards/kpi-card.tsx`): título en `<p className="text-sm font-medium text-muted-foreground">{title}</p>` (l.35), dentro de `<div className="space-y-2">`.
- El pie del Forecast está en `analytics/page.tsx` bajo `{/* Additional info section */}` (~648-697).

**Uso del componente en cada sitio:** junto al elemento de título, añadir:
```tsx
<InfoTooltip text={CHART_HELP.<clave>} />
```
Import: `import { InfoTooltip } from "@/components/common/info-tooltip";` y `import { CHART_HELP } from "@/lib/chart-help";`. El icono debe quedar en línea con el título (envolver título+icono en un `<span className="inline-flex items-center gap-1.5">` si el título es texto suelto, o añadirlo dentro del flex del header si ya existe).

---

### Task 1: Infra — InfoTooltip + chart-help + KPICard.info

**Files:** Create `src/components/common/info-tooltip.tsx`, `src/lib/chart-help.ts`; Modify `src/components/cards/kpi-card.tsx`

- [ ] **Step 1: InfoTooltip** — crear `src/components/common/info-tooltip.tsx`:
```tsx
"use client";

import { Info } from "lucide-react";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";

export function InfoTooltip({ text, side = "top" }: { text: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label="Más información"
          className="inline-flex shrink-0 items-center text-muted-foreground/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```
(Si `TooltipTrigger` no acepta `type`/`className` directamente por ser el primitivo base-ui, envuelve el `<button>` con `render`/`asChild` según el patrón del repo; verifica leyendo `tooltip.tsx`. Objetivo: el icono es el disparador accesible.)

- [ ] **Step 2: chart-help** — crear `src/lib/chart-help.ts`:
```ts
// Copy centralizado de los tooltips informativos de gráficos y KPIs.
export const CHART_HELP = {
  // --- Dashboard: KPIs ---
  kpiVentasOV: "Suma de las Órdenes de Venta (ventas comprometidas) del año. El ▲▼% compara con el mismo total del año anterior.",
  kpiFacturado: "Suma de lo facturado (FAC) en el año. El ▲▼% compara con el año anterior.",
  kpiTicket: "Importe medio por Orden de Venta (total OV ÷ nº de órdenes). El ▲▼% compara con el año anterior.",
  kpiEjecucion: "Facturado ÷ Comprometido (FAC/OV) del año: cuánto de lo vendido ya se ha facturado. El Δ es en puntos frente al año anterior.",

  // --- Dashboard: gráficos ---
  barMensual: "Ventas por mes: Órdenes (OV) y Facturas (FAC). Usa las casillas para mostrar u ocultar cada serie.",
  cumulativeYoY: "Ventas acumuladas mes a mes del año actual frente al anterior. Si la línea va por encima, vas por delante del año pasado. Cambia OV/FAC con el selector.",
  executionMensual: "Ejecución de cada mes = Facturado ÷ Comprometido (FAC/OV). Muestra cómo evoluciona la conversión de venta a factura.",
  topClientesPareto: "Los 10 mayores clientes por importe (barras) y el % acumulado sobre el total (línea, regla 80/20). Cambia OV/FAC con el selector.",
  mixCategoria: "Reparto del importe entre las 4 macro-categorías (Mano de obra, C&R, Equipos, Operación). Cambia OV/FAC con el selector.",

  // --- Análisis: Comercial ---
  brandMix: "Reparto del importe por marca. Muestra de qué marcas depende la facturación.",
  bucketByClient: "Importe por cliente desglosado en las 4 macro-categorías, para ver el mix de cada cliente.",
  bucketMixAnual: "Evolución anual del reparto entre las 4 macro-categorías (área apilada).",
  clientePareto: "Clientes ordenados por importe con su % acumulado (regla 80/20): cuántos clientes concentran la mayoría de las ventas.",
  monthHeatmap: "Intensidad de ventas por cliente y mes: colores más fuertes = más importe. Ayuda a detectar estacionalidad por cliente.",
  nuevosVsRecurrentes: "Importe de clientes nuevos (primera compra en el año) frente a recurrentes, mes a mes.",
  estacionalidadCategoria: "Reparto mensual del importe por macro-categoría (barras apiladas): en qué meses pesa más cada tipo de negocio.",
  skuPareto: "SKUs ordenados por importe con su % acumulado (regla 80/20): qué artículos concentran las ventas.",
  topItems: "Los 15 artículos con mayor importe en el periodo.",

  // --- Análisis: Margen ---
  margenKpi: "Margen bruto estimado = Ventas − Costo estándar, solo de bienes con costo>0 (excluye servicios). Usa el costo del maestro (aproximación, no COGS real).",
  margenPorCliente: "Margen estimado por cliente (Ventas − Costo estándar). Solo bienes con costo.",
  margenPorArticulo: "Margen estimado por artículo (Ventas − Costo estándar). Solo bienes con costo.",
  margenScatter: "Cada punto es un artículo: importe (eje X) frente a % de margen (eje Y). La línea en 0% es el punto de equilibrio.",

  // --- Análisis: Exploración / premium ---
  barCategoria: "Ventas por categoría (barras).",
  techService: "Comparativa financiera entre las líneas ST y C&R por periodo (mensual, trimestral o anual).",
  grupoEvolucion: "Evolución del importe de tus agrupaciones personalizadas a lo largo del tiempo.",
  groupingAnalysis: "Análisis de ventas por agrupaciones personalizadas de categorías.",
  historicoCategoria: "Ventas históricas por categoría seleccionada a lo largo de los años.",

  // --- Análisis: Forecast (integra el pie eliminado) ---
  forecastMes: "Proyección de cierre del mes en curso. Mezcla el run-rate diario con lo esperado según el año anterior y el ritmo del año: al principio del mes pesa lo esperado, al final lo real. El rango refleja la incertidumbre. El semáforo compara tu acumulado con el mismo punto del año pasado (En Trayectoria / En Riesgo).",
  forecastAnio: "Proyección de cierre del año. Combina la extrapolación estacional (peso de cada mes ponderado dando más importancia a los años recientes) con el ritmo interanual (YTD vs año anterior), evitando amplificar el error a principios de año. El rango refleja la dispersión de las formas históricas.",
  forecastEstacional: "Datos reales del año más la proyección de los meses restantes, usando estacionalidad ponderada por recencia y el ritmo interanual del negocio.",
  forecastCategoria: "Proyección de cierre por categoría, con la misma lógica de estacionalidad ponderada.",
  grupoForecast: "Proyección de cierre por agrupación, con la misma lógica de estacionalidad ponderada.",
} as const;
```

- [ ] **Step 3: KPICard.info** — en `src/components/cards/kpi-card.tsx`: añade `info?: string` a `KPICardProps` y a la desestructuración; importa `InfoTooltip`; envuelve el título:
```tsx
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              {info && <InfoTooltip text={info} />}
            </div>
```
(reemplazando la línea 35 `<p …>{title}</p>`).

- [ ] **Step 4:** `npx tsc --noEmit` + `npm run lint` (≤10 warnings). Verifica que el tooltip renderiza sin error de contexto (base-ui a veces requiere el `Provider`; ya lo incluye `InfoTooltip`).
- [ ] **Step 5:** Commit:
```bash
git add src/components/common/info-tooltip.tsx src/lib/chart-help.ts src/components/cards/kpi-card.tsx
git commit -m "feat(ui): InfoTooltip reutilizable + copy centralizado + KPICard.info"
```

---

### Task 2: Dashboard General

**Files:** Modify `src/app/(dashboard)/home/page.tsx`, `src/components/charts/bar-chart-monthly.tsx`, `src/components/charts/dashboard/{cumulative-yoy-chart,execution-monthly-chart,top-customers-pareto,category-mix-donut}.tsx`

READ cada archivo. Coloca `<InfoTooltip text={CHART_HELP.<clave>} />` junto al título:

- [ ] **Step 1: KPIs** — en `home/page.tsx`, a los 4 `KPICard` añade `info`: OV→`CHART_HELP.kpiVentasOV`, Facturado→`kpiFacturado`, Ticket→`kpiTicket`, Ejecución→`kpiEjecucion`.
- [ ] **Step 2: charts** — `bar-chart-monthly.tsx`→`barMensual` (junto a `CardTitle`); `cumulative-yoy-chart.tsx`→`cumulativeYoY`; `execution-monthly-chart.tsx`→`executionMensual`; `top-customers-pareto.tsx`→`topClientesPareto`; `category-mix-donut.tsx`→`mixCategoria`. En los que ya tienen un header flex con el `RecordTypeSelect`, mete el icono junto al `CardTitle`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/home/page.tsx" src/components/charts/bar-chart-monthly.tsx src/components/charts/dashboard/
git commit -m "feat(dashboard): tooltips informativos en KPIs y gráficos"
```

---

### Task 3: Análisis · Comercial (9 gráficos)

**Files:** Modify `src/components/charts/comercial/{brand-mix-card,bucket-by-client-card,bucket-mix-card,client-pareto-card,month-heatmap-card,new-vs-recurring-card,season-by-bucket-card,sku-pareto-card,top-items-card}.tsx`

READ cada archivo; coloca el icono junto a su título con la clave:
- brand-mix→`brandMix`; bucket-by-client→`bucketByClient`; bucket-mix→`bucketMixAnual`; client-pareto→`clientePareto`; month-heatmap→`monthHeatmap`; new-vs-recurring→`nuevosVsRecurrentes`; season-by-bucket→`estacionalidadCategoria`; sku-pareto→`skuPareto`; top-items→`topItems`.

- [ ] **Step 1:** Aplicar en los 9. **Step 2:** `npx tsc --noEmit` + `npm run lint`. **Step 3:** Commit:
```bash
git add src/components/charts/comercial/
git commit -m "feat(comercial): tooltips informativos en gráficos"
```

---

### Task 4: Análisis · Margen + Exploración/premium

**Files:** Modify `src/components/charts/margin/{margin-kpi-card,margin-by-customer-card,margin-by-item-card,margin-scatter-card}.tsx`, `src/components/charts/tech-service-analysis.tsx`, `src/components/charts/bar-chart-by-category.tsx`, `src/components/charts/premium/{group-evolution-card,grouping-analysis-card,historical-sales-category}.tsx`

Claves: margin-kpi→`margenKpi`; margin-by-customer→`margenPorCliente`; margin-by-item→`margenPorArticulo`; margin-scatter→`margenScatter`; tech-service-analysis→`techService`; bar-chart-by-category→`barCategoria`; group-evolution-card→`grupoEvolucion`; grouping-analysis-card→`groupingAnalysis`; historical-sales-category→`historicoCategoria`.

READ cada archivo y coloca el icono junto al título real del gráfico (ignora textos de estado vacío). Si algún componente no tiene un título fijo visible (p.ej. cabecera dinámica), colócalo junto al encabezado principal de la tarjeta.

- [ ] **Step 1:** Aplicar. **Step 2:** `npx tsc --noEmit` + `npm run lint`. **Step 3:** Commit:
```bash
git add src/components/charts/margin/ src/components/charts/tech-service-analysis.tsx src/components/charts/bar-chart-by-category.tsx src/components/charts/premium/group-evolution-card.tsx src/components/charts/premium/grouping-analysis-card.tsx src/components/charts/premium/historical-sales-category.tsx
git commit -m "feat(analisis): tooltips informativos en Margen y Exploración"
```

---

### Task 5: Forecast — tooltips + eliminar el pie

**Files:** Modify `src/components/charts/premium/predictive-run-rate.tsx`, `src/components/charts/premium/forecast-sales-category.tsx`, `src/components/charts/premium/group-forecast-card.tsx`, `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Cards de forecast** — `PredictiveRunRateCard`: añade prop opcional `info?: string` y renderiza `<InfoTooltip text={info} />` junto al `<h3>` del título (el que muestra `{title}`). En `analytics/page.tsx`, pasa `info={CHART_HELP.forecastMes}` a la card de mes e `info={CHART_HELP.forecastAnio}` a la de año.
- [ ] **Step 2: Gráfico estacional** — en `analytics/page.tsx`, junto al `CardTitle` "Histórico con Proyección Estacional" (~l.553), añade `<InfoTooltip text={CHART_HELP.forecastEstacional} />`.
- [ ] **Step 3: Categoría/grupo** — `forecast-sales-category.tsx`→`forecastCategoria`; `group-forecast-card.tsx`→`grupoForecast` (junto a sus títulos).
- [ ] **Step 4: Eliminar el pie** — en `analytics/page.tsx`, elimina TODO el bloque `{/* Additional info section */}` (`~648-697`): el `<div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">` con las dos tarjetas "¿Cómo calculamos el Forecast?" y "Seguimiento y ritmo (On Track)". Verifica que no queden imports sin usar tras el borrado (p.ej. `Activity` si solo se usaba ahí).
- [ ] **Step 5:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 6:** Commit:
```bash
git add src/components/charts/premium/predictive-run-rate.tsx src/components/charts/premium/forecast-sales-category.tsx src/components/charts/premium/group-forecast-card.tsx "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(forecast): tooltips en tarjetas y gráfico estacional; elimina bloques de pie"
```

---

### Task 6: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde (lint ≤10 warnings).
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Solo UI; sin datos ni migraciones → redeploy en EasyPanel.
- Las claves de `CHART_HELP` son la única fuente de copy; si algún título no encaja con su clave, ajústalo en `chart-help.ts` (no inline).
- Cada `InfoTooltip` ya incluye su `TooltipProvider`, así que no depende de un provider global.
- `grouping-manager.tsx` queda fuera (no es un gráfico).
