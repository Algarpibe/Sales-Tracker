# Tooltips informativos en gráficos y KPIs — Diseño

**Contexto:** Muchos gráficos del Dashboard General y de Análisis Inteligente no explican qué muestran ni cómo se calculan. Además, la pestaña Forecast tiene dos bloques de texto al pie que ocupan espacio.

**Goal:** Un icono "i" en cada gráfico/KPI (dashboard + 4 pestañas de análisis) que explica al pasar el ratón/foco qué es y cómo se calcula. En Forecast, eliminar los bloques de pie e integrar su contenido en los tooltips de las tarjetas y el gráfico estacional.

**Arquitectura:** Componente reutilizable `InfoTooltip` sobre la primitiva `@/components/ui/tooltip` (base-ui) + copy centralizado en `src/lib/chart-help.ts`. Colocación del icono junto al título de cada tarjeta/gráfico. Solo UI; sin datos ni migraciones.

**Tech:** Next 16, base-ui tooltip, lucide `Info`.

---

## Componente — `src/components/common/info-tooltip.tsx`
```tsx
<InfoTooltip text={string} side?="top" />
```
- Icono `Info` (lucide, `h-3.5 w-3.5`, `text-muted-foreground/60 hover:text-foreground`), como `TooltipTrigger` (botón accesible, `aria-label="Más información"`).
- Envuelve `TooltipProvider` (delay ~150) + `Tooltip` + `TooltipContent` (texto, `max-w-xs`, ya estilado por la primitiva).
- Cliente (`"use client"`). Presentacional.

## Copy centralizado — `src/lib/chart-help.ts`
`export const CHART_HELP = { <clave>: "qué muestra + cómo se calcula (1-2 frases)" }`. Una clave por gráfico/KPI. Se edita/revisa en un solo sitio.

## Colocación
- Tarjetas con `CardTitle`/`CardHeader`: icono junto al título (`<CardTitle>… <InfoTooltip .../></CardTitle>` o en el header flex).
- Cabeceras premium con `<h3>`/`<h4>`: icono junto al título.
- `KPICard` (`src/components/cards/kpi-card.tsx`): nuevo prop opcional `info?: string` → renderiza `<InfoTooltip>` junto al `title`.

## Superficies (todas)
- **Dashboard General**: 4 KPIs (OV, Facturado, Ticket medio, % Ejecución) + BarChartMonthly + cumulative-yoy + execution-monthly + top-customers-pareto + category-mix-donut.
- **Análisis · Exploración**: bar-chart-monthly/by-category, tech-service-analysis, premium/group-evolution, grouping-analysis, historical-sales-category.
- **Análisis · Forecast**: las 2 `PredictiveRunRateCard` (mes/año), gráfico estacional, forecast-sales-category, group-forecast.
- **Análisis · Comercial**: brand-mix, bucket-by-client, bucket-mix, client-pareto, month-heatmap, new-vs-recurring, season-by-bucket, sku-pareto, top-items.
- **Análisis · Margen**: margin-kpi, margin-by-customer, margin-by-item, margin-scatter.

## Forecast — integrar el pie
- **Eliminar** el bloque `{/* Additional info section */}` de `analytics/page.tsx` (~648-697): las dos tarjetas "¿Cómo calculamos el Forecast?" y "Seguimiento y ritmo (On Track)".
- Su contenido se condensa en el copy de los tooltips de: la card de mes, la card de año y el gráfico estacional (método) + el badge de ritmo (On Track). Claves en `CHART_HELP`: `forecastMes`, `forecastAnio`, `forecastEstacional`.

## Testing
Puramente presentacional (UI). Gate = `tsc` + `lint` + `build`. Verificación manual: el icono aparece y el texto se muestra al pasar el ratón/foco en cada superficie.

## Fuera de alcance
- `grouping-manager` (gestor de agrupaciones, no es un gráfico).
- Tooltips en las tablas (Clientes/Artículos/Tablas) — este lote es solo gráficos/KPIs.
- Internacionalización del copy (español).

## Notas
- La primitiva ya trae animación, flecha y `max-w-xs`; `InfoTooltip` solo aporta el icono + wiring.
- Ejecución por volumen (~28 archivos): primero infra (InfoTooltip + chart-help + KPICard), luego bloques en paralelo (dashboard, comercial, margen, forecast/exploración).
