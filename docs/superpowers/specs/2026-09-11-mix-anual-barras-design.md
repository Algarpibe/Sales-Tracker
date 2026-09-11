# Mix por macro-categoría en barras apiladas — Diseño

**Goal:** El gráfico "Mix por macro-categoría (evolución anual)" pasa de áreas apiladas a barras apiladas, con los mismos colores y el mismo tono que tiene hoy.

**Arquitectura:** Cambio de presentación en un solo componente, `BucketMixCard` (`src/components/charts/comercial/bucket-mix-card.tsx`): `AreaChart`/`Area` pasan a `BarChart`/`Bar`. Los datos (`buildBucketMixByYear`), el título, el contenido del tooltip y los ejes no cambian. El componente se ve en la pestaña Comercial de `/analytics` y en el widget "Mix anual" del dashboard (`mix-anual` en `src/lib/widget-registry.tsx`), así que cambia en los dos sitios.

**Tech:** recharts 2.15, Playwright.

---

## Contexto verificado
- Es el único `AreaChart` de la aplicación.
- Series y colores (`SERIES`, `bucket-mix-card.tsx:18-23`): Mano de Obra / Cal `#6366f1`, C&R `#10b981`, Equipos `#f59e0b`, Operación `#ef4444`. Hoy se pintan con `fillOpacity={0.5}`, de ahí el tono pastel.
- Precedente de barras apiladas con la misma paleta en la misma pestaña: `season-by-bucket-card.tsx:78-82` ("Estacionalidad por categoría"), con relleno sólido.
- `CHART_HELP.bucketMixAnual` (`src/lib/chart-help.ts:19`) describe el gráfico como "(área apilada)".

## Componente — `src/components/charts/comercial/bucket-mix-card.tsx`
- Import de recharts: `AreaChart` y `Area` se sustituyen por `BarChart` y `Bar`; el resto de imports no cambia.
- `<BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>`: mismo `data` y mismo `margin` que el `AreaChart` actual.
- Cada serie, en el orden de `SERIES` (Mano de Obra abajo, Operación arriba): `<Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} fillOpacity={0.5} maxBarSize={64} />`.
  - `fillOpacity={0.5}` conserva el tono actual.
  - `maxBarSize={64}` evita bloques de ~250 px con seis años a ancho completo; es el mismo límite que las barras anuales de "Margen bruto estimado" (`margin-kpi-card.tsx`).
- `Tooltip`: `content={<MixTooltip />}` (sin cambios) y `cursor={{ fill: "rgba(255,255,255,0.04)" }}`, como en "Estacionalidad por categoría".
- `CartesianGrid`, `XAxis`, `YAxis`, `Legend`, `ResponsiveContainer` (`height="100%"`, `minHeight={340}`), el skeleton y "Sin datos." no cambian.
- Efecto esperado en la leyenda: recharts usa un cuadrado como icono de las barras en lugar de la línea de las áreas.

## Texto de ayuda — `src/lib/chart-help.ts:19`
- `"Evolución anual del reparto entre las 4 macro-categorías (área apilada)."` pasa a `"Evolución anual del reparto entre las 4 macro-categorías (barras apiladas)."`.

## Pruebas — `e2e/specs/charts.spec.ts`
TDD: el test se escribe primero y debe fallar antes del cambio.

- Test nuevo, **"el Mix por macro-categoría se pinta con barras apiladas"**: abrir `/analytics`, pasar a la pestaña Comercial y acotar a la tarjeta con el título "Mix por macro-categoría (evolución anual)" mediante `[data-slot="card"]` (mismo criterio que el test del Histórico Anual). Comprobar que hay al menos un `.recharts-bar-rectangle` y ningún `.recharts-area`.
- Hoy falla (el gráfico es de áreas: no hay rectángulos de barra). Tras el cambio pasa.
- Datos: con la semilla ficticia del hub todas las categorías ("Aguas", "Aire", "Suelos") caen en "Equipos" (`bucketForCategory`), y hay facturas de 2021 a 2024. Por eso habrá una barra de un solo tramo por año, suficiente para comprobar el tipo de gráfico.
- Usa el `storageState: APPROVED_STATE` que ya declara el fichero: no hace login ni consume el rate limit.

## Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest sin cambios: 124 pasados + 1 saltado.
- E2E: 32/32 (31 actuales + 1 nuevo), con `E2E_PG_PORT=55433`.

## Entrega
- Rama `feat/mix-anual-barras` creada desde `main`; el spec, el plan y la implementación viven en la rama, así que `main` local no se adelanta a `origin/main`.
- PR contra `main` con CI en verde y fusión con merge commit `título (#N)`, como los anteriores.
- Despliega el usuario en EasyPanel. Sin migración ni SQL.

## Fuera de alcance
- Barras agrupadas (una barra por categoría y año).
- Relleno sólido en lugar del tono actual.
- Total en el tooltip.
- Cambios en otros gráficos.
