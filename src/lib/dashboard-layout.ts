export interface DashboardItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Ids canónicos del catálogo. El registro (widget-registry.tsx) debe cubrir exactamente estos.
export const WIDGET_IDS = [
  "kpi-ov", "kpi-fac", "kpi-ticket", "kpi-ejecucion",
  "ventas-mensuales", "acumulado-yoy", "ejecucion-mensual", "top-clientes-pareto", "mix-categoria",
  "pareto-clientes", "top-articulos", "pareto-skus", "mix-marca", "bucket-cliente",
  "heatmap-mes", "nuevos-recurrentes", "estacionalidad", "mix-anual",
  "margen-kpi", "margen-cliente", "margen-articulo", "margen-scatter",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

const IDS = new Set<string>(WIDGET_IDS);

// Replica el Dashboard General actual (12 columnas, rowHeight 40).
export const DEFAULT_LAYOUT: DashboardItem[] = [
  { id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 },
  { id: "kpi-fac", x: 3, y: 0, w: 3, h: 3 },
  { id: "kpi-ticket", x: 6, y: 0, w: 3, h: 3 },
  { id: "kpi-ejecucion", x: 9, y: 0, w: 3, h: 3 },
  { id: "ventas-mensuales", x: 0, y: 3, w: 12, h: 11 },
  { id: "acumulado-yoy", x: 0, y: 14, w: 7, h: 10 },
  { id: "ejecucion-mensual", x: 7, y: 14, w: 5, h: 10 },
  { id: "top-clientes-pareto", x: 0, y: 24, w: 7, h: 11 },
  { id: "mix-categoria", x: 7, y: 24, w: 5, h: 11 },
];

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Devuelve los items válidos, descartando ids desconocidos (catálogo cambiante).
// null si la forma es inválida → el llamante usa DEFAULT_LAYOUT.
export function parseDashboardLayout(raw: unknown): DashboardItem[] | null {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!arr) return null;

  const out: DashboardItem[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    if (typeof o.id !== "string") return null;
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.w) || !isNum(o.h)) return null;
    if (!IDS.has(o.id)) continue; // id retirado del catálogo: se ignora
    out.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h });
  }
  return out;
}
