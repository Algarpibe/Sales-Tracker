# Forecast más realista (A+B+C+D+E) — Diseño

**Contexto:** El Forecast actual (run-rate lineal por día + escalado estacional YTD, estacionalidad equiponderada 2023-2025, "On Track" trivial) se aleja de la realidad. Ver diagnóstico previo. Se aplican 5 mejoras.

**Goal:** Proyecciones de cierre de mes/año más estables y honestas, con semáforo accionable y banda de incertidumbre.

**Arquitectura:** Motor puro nuevo `src/lib/forecast.ts` (`computeForecast`) + `calculateSeasonalityFactors` extendido con pesos de recencia. El panel principal (2 cards + chart estacional) usa el motor completo; los forecasts por categoría y por grupo adoptan la estacionalidad ponderada (B) para consistencia.

**Tech:** Next 16, recharts, vitest. Sin BD ni migraciones.

---

## Decisiones (aprobadas)
- **A** — Esperado del mes = `mismoMesAñoAnterior × ritmoYoY`.
- **B** — Estacionalidad = media ponderada por recencia **3/2/1** (2025/2024/2023).
- **C** — Año = mezcla de estimación estacional y estimación por ritmo YoY, ponderada por fracción de año transcurrida.
- **D** — "On Track" = ritmo del YTD vs **mismo periodo del año anterior** (prorrateado al día).
- **E** — Banda ± (dispersión histórica) + redondeo sin céntimos.

## Fórmulas (motor `computeForecast`)
Entradas: `currentYearMonthly[12]`, `lastYearMonthly[12]`, `historicalMatrix` (años recientes primero) + `weights` (p.ej. `[3,2,1]`), `now={monthIdx,day,daysInMonth}`, `isCurrentActualYear`.

```
w  = isCurrentActualYear ? min(1, day/daysInMonth) : 1        // fracción del mes transcurrida
completedCount = isCurrentActualYear ? monthIdx : 12          // meses cerrados
completedActual = Σ currentYearMonthly[0..completedCount-1]
lastYearCompleted = Σ lastYearMonthly[0..completedCount-1]
yoyPace = lastYearCompleted>0 ? completedActual/lastYearCompleted : 1

factors = weightedSeasonalityFactors(historicalMatrix, weights)   // (B) 12, suma 1

// --- (A) MES actual ---
mtd = currentYearMonthly[monthIdx]
runRate = calculateRunRate(mtd, day, daysInMonth)
expected = lastYearMonthly[monthIdx]>0 ? lastYearMonthly[monthIdx]*yoyPace : runRate
monthValue = w*runRate + (1-w)*expected                      // temprano→esperado, tarde→real
monthRef = lastYearMonthly[monthIdx]*w                       // (D) año anterior prorrateado al día
monthDelta = monthRef>0 ? (mtd-monthRef)/monthRef : null
monthBandUnc = (1-w)*0.5                                     // (E) ±50% a día 0 → 0 a fin de mes

// --- (C) AÑO ---
knownTotal = completedActual + monthValue                    // meses cerrados + mes proyectado
knownSeasonality = Σ factors[0..monthIdx]
seasonalYearEst = knownSeasonality>0 ? knownTotal/knownSeasonality : knownTotal
lastYearTotal = Σ lastYearMonthly
paceYearEst = lastYearTotal>0 ? lastYearTotal*yoyPace : seasonalYearEst
wy = clamp(knownSeasonality,0,1)
yearEstimate = wy*seasonalYearEst + (1-wy)*paceYearEst       // temprano→ritmo, tarde→estacional

monthlyForecast[i] = i<monthIdx ? actual : i===monthIdx ? monthValue : yearEstimate*factors[i]
yearValue = Σ monthlyForecast                               // coherente con el chart

// --- (D) ritmo del año ---
ytdActual       = completedActual + mtd
lastYearToDate  = lastYearCompleted + lastYearMonthly[monthIdx]*w
yearDelta = lastYearToDate>0 ? (ytdActual-lastYearToDate)/lastYearToDate : null
onTrack   = yearDelta>=0 (o, si null, yearValue>=lastYearTotal)

// --- (E) banda del año (dispersión entre formas históricas) ---
para cada año histórico con total>0: est_y = knownTotal / Σ(shares_y[0..monthIdx])
yearLow  = min(est_y ∪ {yearValue});  yearHigh = max(est_y ∪ {yearValue})
```
`isCurrentActualYear === false` (viendo un año pasado): sin proyección → cards muestran actuals, banda = valor, delta vs total año anterior. Todos los `value/low/high` se **redondean a entero** (sin céntimos).

Salida:
```ts
interface ProjectionStat { value:number; low:number; high:number; actual:number; reference:number; deltaPct:number|null; onTrack:boolean }
interface ForecastResult { monthlyForecast:number[]; month:ProjectionStat; year:ProjectionStat }
```

## Componentes / archivos
- **`src/lib/math-utils.ts`** — `calculateSeasonalityFactors(historicalData, weights?)`: media ponderada por año (peso por año válido); sin `weights` → comportamiento actual (retrocompatible). (B)
- **`src/lib/forecast.ts`** (NUEVO, puro + tests) — `weightedSeasonalityFactors` (reexporta/usa lo anterior con `[3,2,1]`), `computeForecast(input): ForecastResult`. (A+C+D+E)
- **`src/components/charts/premium/predictive-run-rate.tsx`** — nuevos props opcionales `low?`, `high?`, `deltaPct?: number|null`, `deltaLabel?`. Muestra el rango bajo el número (p.ej. "$1.05M – $1.16M") y un badge de ritmo (+X% / −Y% vs año anterior) que decide el color/On-Track. Retrocompatible (si no llegan, usa la lógica actual). (D+E)
- **`src/app/(dashboard)/analytics/page.tsx`** — el bloque de forecast (l.201-238) llama a `computeForecast`; las 2 cards reciben `value/low/high/deltaPct`; el chart estacional usa `monthlyForecast`; se actualiza el texto explicativo "Cómo funciona" para describir el modelo nuevo.
- **`forecast-sales-category.tsx`** y **`group-forecast-card.tsx`** — pasar `weights=[3,2,1]` a `calculateSeasonalityFactors` (B) para consistencia. (Su blend mensual A/C por categoría queda fuera de alcance: el ritmo por categoría pequeña es ruidoso.)

## Testing — `src/lib/__tests__/forecast.test.ts` (+ casos en math-utils.test si existe)
- `calculateSeasonalityFactors` con pesos: años recientes pesan más; suma 1; sin pesos = comportamiento actual.
- `computeForecast`:
  - **Blend mes**: a mitad de mes (w=0.5) `monthValue` = media de runRate y esperado; a fin de mes (w=1) = runRate; a día 0 (w≈0) ≈ esperado.
  - **yoyPace**: crecimiento reflejado en esperado y en paceYearEst.
  - **Año**: temprano en el año (knownSeasonality baja) el resultado se acerca a paceYearEst (menos amplificación); tarde se acerca al estacional.
  - **Ritmo/On Track**: `deltaPct` correcto; onTrack por signo; denominador 0 → null.
  - **Banda**: `low ≤ value ≤ high`; con una sola forma histórica, banda colapsa al valor.
  - **Año pasado** (`isCurrentActualYear=false`): sin proyección, value = suma actuals.
  - Redondeo: value/low/high enteros.

## Fuera de alcance
- Modelos ML/ARIMA; datos diarios históricos (no existen → el mes se prorratea por días de calendario). 
- Blend A/C por categoría/grupo (solo B ahí).
- Objetivos/presupuesto manual como referencia de On-Track (se usa el año anterior).

## Notas
- `getSeasonalForecast` y `calculateRunRate` se conservan (los usa el motor / retrocompatibilidad).
- Degradación: sin datos del año anterior → `yoyPace=1`, `expected=runRate`, banda desde formas históricas; nada rompe.
