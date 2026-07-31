# Dashboard configurable (v1) — Diseño

**Contexto:** El Dashboard General es fijo. Se quiere poder **elegir, incluir, dimensionar y ubicar** tarjetas tomadas de Análisis (Exploración, Forecast, Comercial, Margen). El spike (`/spike-grid`, commit d14b9a8) validó `react-grid-layout` v2.2.4 con React 19 + Next 16: sin `findDOMNode`, tipos propios, build OK y drag/resize confirmados por el operador.

**Goal:** Dashboard personalizable por usuario: modo edición con añadir/quitar, arrastrar y redimensionar widgets, persistido en BD.

**Arquitectura:** Registro de widgets con interfaz uniforme (`render(ctx)`) + rejilla RGL v2 + persistencia en la tabla genérica `saved_views` (**sin migración**) + provider de datos comunes.

**Tech:** Next 16, React 19, react-grid-layout v2, react-query, vitest.

---

## Decisiones (aprobadas)
- Drag & drop libre + resize (RGL v2, ya validado).
- **Todo** el dashboard configurable (KPIs incluidos, como widgets independientes).
- Catálogo v1: **22 widgets** (4 KPIs + 5 del dashboard + 9 Comercial + 4 Margen). Exploración y Forecast quedan para el lote siguiente (requieren refactor a autónomos).

## 1. Registro de widgets — `src/lib/widget-registry.tsx`
```tsx
export type WidgetSection = "KPIs" | "Dashboard" | "Comercial" | "Margen";

export interface WidgetContext {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
  records: SalesRecord[];        // año actual
  prevRecords: SalesRecord[];    // año anterior
  catMap: Map<string, string>;
  metrics: DashboardMetrics;
  metricsPrev: DashboardMetrics;
}

export interface WidgetDef {
  id: string;                    // estable; es la clave persistida
  title: string;
  section: WidgetSection;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  render: (ctx: WidgetContext) => React.ReactNode;
}

export const WIDGETS: WidgetDef[] = [ /* 22 entradas */ ];
export const WIDGET_MAP: Map<string, WidgetDef>;
```
`render(ctx)` resuelve las props de cada componente (unos necesitan `{recordType, year}`, otros datos del contexto), que es lo que uniforma lo que hoy no lo es.

**Widgets** (id → componente):
- **KPIs**: `kpi-ov`, `kpi-fac`, `kpi-ticket`, `kpi-ejecucion` → `KPICard` (con su `change` YoY e `info`).
- **Dashboard**: `ventas-mensuales` (wrapper con checkboxes OV/FAC propios), `acumulado-yoy`, `ejecucion-mensual`, `top-clientes-pareto`, `mix-categoria`.
- **Comercial**: `pareto-clientes`, `top-articulos`, `pareto-skus`, `mix-marca`, `bucket-cliente`, `heatmap-mes`, `nuevos-recurrentes`, `estacionalidad`, `mix-anual`.
- **Margen**: `margen-kpi`, `margen-cliente`, `margen-articulo`, `margen-scatter`.

## 2. Layout y persistencia
```ts
// src/lib/dashboard-layout.ts
export interface DashboardItem { id: string; x: number; y: number; w: number; h: number }
export const DEFAULT_LAYOUT: DashboardItem[];              // replica el dashboard actual
export function parseDashboardLayout(raw: unknown): DashboardItem[] | null;  // valida; descarta ids desconocidos
export function layoutToRGL(items): Layout;                 // añade minW/minH del registro
```
- `parseDashboardLayout` ignora ids que ya no existan en el registro (robusto ante cambios de catálogo) y devuelve `null` si el estado es inválido → se usa `DEFAULT_LAYOUT`.
- **Persistencia (sin migración):** `saved_views` con `view_key="dashboard"`, `name="layout"`, `state={items:[...]}`.
- Actions `src/actions/dashboard-layout-actions.ts`: `getDashboardLayout()`, `saveDashboardLayout(items)`, `resetDashboardLayout()`. Todas con `requireApproved` y `profile.id`; `getDashboardLayout` degrada a `[]`/default si la tabla o la fila no existen.

## 3. Datos comunes — `src/components/dashboard/dashboard-data-provider.tsx`
Carga una vez (react-query) `getSalesData({year})`, `getSalesData({year:year-1})`, `getCategories()`; deriva `metrics`, `metricsPrev`, `catMap`; expone `useDashboardData()`. Evita refactorizar los gráficos actuales que reciben datos por props. Los widgets de Comercial/Margen siguen haciendo su propia consulta (cacheada por react-query).

## 4. Rejilla y modo edición — `src/components/dashboard/dashboard-grid.tsx`
- `ReactGridLayout` con `useContainerWidth`, `gridConfig={{cols:12, rowHeight:40, margin:[16,16]}}`.
- **Fuera de edición**: `dragConfig={{enable:false}}`, `resizeConfig={{enable:false}}`; sin cabeceras → visualmente igual que hoy.
- **En edición**: cabecera `⠿` como `handle`, tirador de resize, ✕ para quitar; barra superior con **"+ Añadir tarjeta"**, **Guardar**, **Cancelar**, **Restablecer**.
- `WidgetFrame`: tarjeta contenedora (`h-full overflow-auto`) con la cabecera de edición.
- `WidgetPicker`: diálogo con los widgets agrupados por sección, ocultando los ya presentes.
- **Fix recharts**: al terminar drag/resize (`onResizeStop`/`onDragStop`) disparar `window.dispatchEvent(new Event("resize"))` para que los `ResponsiveContainer` se remidan.
- Guardado explícito: "Guardar" persiste; "Cancelar" restaura el layout previo.

## 5. Página — `src/app/(dashboard)/home/page.tsx`
Se reescribe: envuelve en `DashboardDataProvider`, mantiene cabecera + selector de año, y delega todo el cuerpo en `DashboardGrid`. Botón **"Personalizar"** en la cabecera.

## Testing — `src/lib/__tests__/dashboard-layout.test.ts`
`parseDashboardLayout`: estado válido → items; ids desconocidos → se descartan; item con campos no numéricos → null; no-objeto/null → null; array vacío → []. (El resto es UI.)

## Limitaciones conocidas (v1, aceptadas)
- Los gráficos tienen **altura interna fija** (340-440px): si se agranda mucho un widget queda espacio libre; si se reduce, aparece scroll. Ajustar cada gráfico a `height="100%"` es un lote posterior.
- Sin responsive por breakpoints (un solo layout de 12 columnas); en móvil RGL apila por su cuenta.

## Fuera de alcance
- Widgets de Exploración y Forecast (lote siguiente, requieren refactor a autónomos).
- Varios dashboards/pestañas por usuario; compartir layouts.
- Eliminar `/spike-grid` (se hará al cerrar el lote siguiente).
