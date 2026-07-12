# Dashboard General — nuevas visualizaciones — Diseño

**Contexto:** La sección "Análisis Detallado de Backlog" (donut de aging + concentración por categoría) aporta poco valor: el aging usa una aproximación cruda (`meses×30`), la concentración del backlog es de nicho, y ningún KPI del panel tiene comparación temporal. Se **elimina** esa sección y se sustituye por visualizaciones de nivel ejecutivo.

**Goal:** Transformar el Dashboard General en un panel con contexto temporal (YoY), concentración de ingresos y composición del negocio.

**Arquitectura:** Todo client-side sobre datos del hub que ya cargamos + 2 queries nuevas (año anterior y clientes del año). Funciones puras en un lib nuevo (testeadas) + componentes de gráfico recharts. Sin tablas ni migraciones.

**Tech:** Next 16, react-query, recharts, vitest.

---

## Datos
- `getSalesData({ year })` — ya se carga. Registros `{category_id, record_type, record_month, record_year, amount_usd}` (OV/FAC/BACKLOG).
- **NUEVO** `getSalesData({ year: year - 1 })` — para YoY (KPIs + curva acumulada).
- **NUEVO** `getCustomerSales({ tipo, desdeAnio: year, hastaAnio: year })` — para Top clientes. Devuelve `CustomerYearRow {customer, year, ventas}`.
- `getCategories()` — ya se carga (id→nombre, para bucketizar).

## Layout (`home/page.tsx`, reescrito)
```
Dashboard General — Año {year}                          [Año ▾]

KPIs (con Δ interanual):
[ Ventas OV ▲% ] [ Facturado ▲% ] [ Ticket medio ▼% ] [ % Ejecución ▲pp ]

Evolución:
[ Barras mensuales OV vs FAC (existente BarChartMonthly + checkboxes) ]  (full)
[ Curva acumulada YoY (lg:col-3) ]     [ % Ejecución mensual (lg:col-2) ]

Composición y concentración:
[ Top 10 clientes · Pareto (lg:col-3) ]   [ Mix macro-categoría · donut (lg:col-2) ]
```
Se elimina el `<section>` de backlog y el uso de `KPIDashboardSection` (con sus Backlog/Execution/Aging/Concentration cards). `computeDashboardMetrics` se mantiene (da `monthly`, totales, `avg_ticket`, `execution_rate`).

## Lib nuevo — `src/lib/dashboard-insights.ts` (puro, testeado)
```ts
type Rec = { category_id: string; record_type: string; record_month: number; amount_usd: number | string };

// Serie acumulada mensual (running total) de un record_type dado, alineada a los 12 meses.
export function cumulativeSeries(records: Rec[], recordType: string): number[]; // length 12

// % ejecución por mes = facturado/comprometido del mes (0 si OV=0).
export function executionByMonth(monthly: { month: string; sales_orders: number; invoices: number }[]): { month: string; pct: number }[];

// Mix por macro-bucket para un record_type. catMap: id→nombre. Usa bucketForCategory.
export function bucketMix(records: Rec[], catMap: Map<string,string>, recordType: string):
  { bucket: Bucket; label: string; amount: number; pct: number }[]; // 4 entradas, orden fijo

// Top N clientes por ventas (año) + % acumulado (Pareto). Ordena desc, agrega por cliente.
export function topCustomers(rows: { customer: string; ventas: number }[], n: number):
  { customer: string; amount: number; cumPct: number }[];

// Δ interanual en % (a=actual, b=anterior). null si b<=0. (reutiliza compare.ts si encaja)
export function yoyChange(a: number, b: number): number | null;
```

## Componentes — `src/components/charts/dashboard/`
Cada tarjeta con toggle OV/FAC propio vía `RecordTypeSelect` en su cabecera (salvo ejecución mensual, que es intrínsecamente OV→FAC).

1. **`cumulative-yoy-chart.tsx`** — `LineChart` recharts, 2 series (año actual vs anterior) del acumulado mensual del `tipo` seleccionado. Props: `current: Rec[]`, `previous: Rec[]`, `yearActual`, `yearPrev`. Estado local `tipo` (default FAC). Filtra client-side con `cumulativeSeries`.
2. **`execution-monthly-chart.tsx`** — `LineChart` del `% ejecución` por mes (`executionByMonth`). Props: `monthly`. Sin toggle. Y-axis `%` con `tickFormatter`.
3. **`top-customers-pareto.tsx`** — `ComposedChart`: barras (importe por cliente) + línea (% acumulado, eje derecho 0–100). Estado local `tipo` (default FAC) → `useQuery(["customer-sales-top",{tipo,year}])` → `topCustomers(rows,10)`. Props: `year`.
4. **`category-mix-donut.tsx`** — `PieChart` donut de los 4 buckets (`bucketMix`), con leyenda y % . Colores de bucket existentes (`#6366f1 #10b981 #f59e0b #ef4444`). Props: `records: Rec[]`, `catMap`. Estado local `tipo` (default FAC).

## KPIs con Δ
`KPICard` ya soporta `change?: number` (flecha ▲▼ + "vs. periodo anterior"). Calcular `metricsPrev = computeDashboardMetrics(prevRecords, cats)` y pasar:
- Ventas OV: `change = yoyChange(cur.sales_orders, prev.sales_orders)`
- Facturado: `yoyChange(cur.invoices, prev.invoices)`
- Ticket medio: `yoyChange(cur.avg_ticket, prev.avg_ticket)`
- % Ejecución: `change` = diferencia en puntos (`cur.execution_rate - prev.execution_rate`) — nota: la card lo rotula como "%", aceptable.

## Testing — `src/lib/__tests__/dashboard-insights.test.ts`
- `cumulativeSeries`: running total correcto; filtra por record_type; meses sin datos mantienen el acumulado previo.
- `executionByMonth`: pct = inv/ov*100; OV=0 → 0; longitud 12.
- `bucketMix`: agrega por bucket; % suma 100 (con datos); 4 entradas orden fijo; categoría desconocida → bucket por defecto de `bucketForCategory`.
- `topCustomers`: ordena desc, agrega duplicados, top N, `cumPct` monótona creciente hasta 100.
- `yoyChange`: `(a-b)/b*100`; b=0 → null.

## Fuera de alcance
Objetivos/metas y proyección de cierre de año; drill-down desde los gráficos; guardar el tipo elegido; nuevos endpoints de BD.

## Notas
- Estados de carga: `Skeleton` mientras cargan las queries (incluida la del año anterior).
- Degradación: si el año anterior no tiene datos, los Δ salen neutros/null (sin romper).
- El mix y la curva reutilizan registros ya en caché (filtrado client-side por tipo); solo Top clientes consulta por tipo (cacheado por react-query).
