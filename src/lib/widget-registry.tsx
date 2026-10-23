import dynamic from "next/dynamic";
import { ShoppingCart, FileText, Receipt, Activity } from "lucide-react";
import { KPICard } from "@/components/cards/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUSD } from "@/lib/constants";
import { CHART_HELP } from "@/lib/chart-help";
import { yoyChange, type InsightRecord } from "@/lib/dashboard-insights";
import type { WidgetId } from "@/lib/dashboard-layout";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";
import type { Category, SalesRecord } from "@/types/database";

const widgetSkeleton = () => <Skeleton className="h-full w-full" />;

// FE-055: cada gráfico (recharts / framer-motion) es su propio chunk y se descarga solo
// cuando el layout lo pinta. El layout por defecto usa 9 de los 32 widgets: antes,
// /home cargaba todos en el primer JS. Mientras llega el chunk, el esqueleto de siempre.
// Sin ssr:false: la rejilla solo pinta widgets en cliente (tras medir el ancho), así
// que nunca se renderizan en servidor.
const MonthlySalesWidget = dynamic(
  () => import("@/components/dashboard/monthly-sales-widget").then((m) => m.MonthlySalesWidget),
  { loading: widgetSkeleton }
);
const CumulativeYoYChart = dynamic(
  () => import("@/components/charts/dashboard/cumulative-yoy-chart").then((m) => m.CumulativeYoYChart),
  { loading: widgetSkeleton }
);
const ExecutionMonthlyChart = dynamic(
  () => import("@/components/charts/dashboard/execution-monthly-chart").then((m) => m.ExecutionMonthlyChart),
  { loading: widgetSkeleton }
);
const TopCustomersPareto = dynamic(
  () => import("@/components/charts/dashboard/top-customers-pareto").then((m) => m.TopCustomersPareto),
  { loading: widgetSkeleton }
);
const CategoryMixDonut = dynamic(
  () => import("@/components/charts/dashboard/category-mix-donut").then((m) => m.CategoryMixDonut),
  { loading: widgetSkeleton }
);
const MonthlyComparisonChart = dynamic(
  () => import("@/components/charts/dashboard/monthly-comparison-chart").then((m) => m.MonthlyComparisonChart),
  { loading: widgetSkeleton }
);
const TechServiceWidget = dynamic(
  () => import("@/components/charts/dashboard/tech-service-widget").then((m) => m.TechServiceWidget),
  { loading: widgetSkeleton }
);
const SeasonalForecastChart = dynamic(
  () => import("@/components/charts/dashboard/seasonal-forecast-chart").then((m) => m.SeasonalForecastChart),
  { loading: widgetSkeleton }
);
const ForecastSummaryWidget = dynamic(
  () => import("@/components/charts/dashboard/forecast-summary-widget").then((m) => m.ForecastSummaryWidget),
  { loading: widgetSkeleton }
);

const HistoricalSalesCategory = dynamic(
  () => import("@/components/charts/premium/historical-sales-category").then((m) => m.HistoricalSalesCategory),
  { loading: widgetSkeleton }
);
const GroupingAnalysisCard = dynamic(
  () => import("@/components/charts/premium/grouping-analysis-card").then((m) => m.GroupingAnalysisCard),
  { loading: widgetSkeleton }
);
const GroupEvolutionCard = dynamic(
  () => import("@/components/charts/premium/group-evolution-card").then((m) => m.GroupEvolutionCard),
  { loading: widgetSkeleton }
);
const GroupForecastCard = dynamic(
  () => import("@/components/charts/premium/group-forecast-card").then((m) => m.GroupForecastCard),
  { loading: widgetSkeleton }
);
const ForecastSalesCategory = dynamic(
  () => import("@/components/charts/premium/forecast-sales-category").then((m) => m.ForecastSalesCategory),
  { loading: widgetSkeleton }
);

const ClientParetoCard = dynamic(
  () => import("@/components/charts/comercial/client-pareto-card").then((m) => m.ClientParetoCard),
  { loading: widgetSkeleton }
);
const TopItemsCard = dynamic(
  () => import("@/components/charts/comercial/top-items-card").then((m) => m.TopItemsCard),
  { loading: widgetSkeleton }
);
const SkuParetoCard = dynamic(
  () => import("@/components/charts/comercial/sku-pareto-card").then((m) => m.SkuParetoCard),
  { loading: widgetSkeleton }
);
const BrandMixCard = dynamic(
  () => import("@/components/charts/comercial/brand-mix-card").then((m) => m.BrandMixCard),
  { loading: widgetSkeleton }
);
const BucketByClientCard = dynamic(
  () => import("@/components/charts/comercial/bucket-by-client-card").then((m) => m.BucketByClientCard),
  { loading: widgetSkeleton }
);
const MonthHeatmapCard = dynamic(
  () => import("@/components/charts/comercial/month-heatmap-card").then((m) => m.MonthHeatmapCard),
  { loading: widgetSkeleton }
);
const NewVsRecurringCard = dynamic(
  () => import("@/components/charts/comercial/new-vs-recurring-card").then((m) => m.NewVsRecurringCard),
  { loading: widgetSkeleton }
);
const SeasonByBucketCard = dynamic(
  () => import("@/components/charts/comercial/season-by-bucket-card").then((m) => m.SeasonByBucketCard),
  { loading: widgetSkeleton }
);
const BucketMixCard = dynamic(
  () => import("@/components/charts/comercial/bucket-mix-card").then((m) => m.BucketMixCard),
  { loading: widgetSkeleton }
);

const MarginKpiCard = dynamic(
  () => import("@/components/charts/margin/margin-kpi-card").then((m) => m.MarginKpiCard),
  { loading: widgetSkeleton }
);
const MarginByCustomerCard = dynamic(
  () => import("@/components/charts/margin/margin-by-customer-card").then((m) => m.MarginByCustomerCard),
  { loading: widgetSkeleton }
);
const MarginByItemCard = dynamic(
  () => import("@/components/charts/margin/margin-by-item-card").then((m) => m.MarginByItemCard),
  { loading: widgetSkeleton }
);
const MarginScatterCard = dynamic(
  () => import("@/components/charts/margin/margin-scatter-card").then((m) => m.MarginScatterCard),
  { loading: widgetSkeleton }
);

export type WidgetSection = "KPIs" | "Dashboard" | "Exploración" | "Forecast" | "Comercial" | "Margen";

export interface WidgetContext {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
  categories: Category[];
  metrics: DashboardMetrics;
  metricsPrev: DashboardMetrics;
}

export interface WidgetDef {
  // Tipado al catálogo canónico: un id sobrante o con typo falla en compilación,
  // en vez de renderizar un hueco vacío en silencio.
  id: WidgetId;
  title: string;
  section: WidgetSection;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  render: (ctx: WidgetContext) => React.ReactNode;
}

const KPI_SIZE = { w: 3, h: 3 };
const KPI_MIN = { w: 2, h: 3 };
const CHART_SIZE = { w: 6, h: 10 };
const CHART_MIN = { w: 3, h: 6 };

// Nota: las funciones `render` NO son componentes React: son factories que el
// grid invoca como `def.render(ctx)` para producir el árbol del widget con sus
// props ya resueltas (cada gráfico necesita props distintas).
export const WIDGETS: WidgetDef[] = [
  // --- KPIs ---
  {
    id: "kpi-ov", title: "Ventas Comprometidas (OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Ventas Comprometidas (OV)" value={formatUSD(c.metrics.sales_orders)}
        change={yoyChange(c.metrics.sales_orders, c.metricsPrev.sales_orders) ?? undefined}
        icon={ShoppingCart} variant="premium" info={CHART_HELP.kpiVentasOV} />
    ),
  },
  {
    id: "kpi-fac", title: "Total Facturado", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Total Facturado" value={formatUSD(c.metrics.invoices)}
        change={yoyChange(c.metrics.invoices, c.metricsPrev.invoices) ?? undefined}
        icon={FileText} variant="premium" info={CHART_HELP.kpiFacturado} />
    ),
  },
  {
    id: "kpi-ticket", title: "Ticket Medio (OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="Ticket Medio (OV)" value={formatUSD(c.metrics.avg_ticket)}
        change={yoyChange(c.metrics.avg_ticket, c.metricsPrev.avg_ticket) ?? undefined}
        icon={Receipt} variant="premium" info={CHART_HELP.kpiTicket} />
    ),
  },
  {
    id: "kpi-ejecucion", title: "% Ejecución (FAC/OV)", section: "KPIs",
    defaultSize: KPI_SIZE, minSize: KPI_MIN,
    render: (c) => (
      <KPICard title="% Ejecución (FAC/OV)" value={`${c.metrics.execution_rate.toFixed(1)}%`}
        change={c.metricsPrev.execution_rate > 0 ? c.metrics.execution_rate - c.metricsPrev.execution_rate : undefined}
        icon={Activity} variant="premium" info={CHART_HELP.kpiEjecucion} />
    ),
  },

  // --- Dashboard ---
  {
    id: "ventas-mensuales", title: "Ventas mensuales", section: "Dashboard",
    defaultSize: { w: 12, h: 11 }, minSize: { w: 4, h: 8 },
    render: (c) => <MonthlySalesWidget metrics={c.metrics} />,
  },
  {
    id: "acumulado-yoy", title: "Acumulado año actual vs anterior", section: "Dashboard",
    defaultSize: { w: 7, h: 10 }, minSize: CHART_MIN,
    render: (c) => (
      <CumulativeYoYChart
        current={c.records as InsightRecord[]}
        previous={c.prevRecords as InsightRecord[]}
        yearActual={c.year} yearPrev={c.year - 1}
      />
    ),
  },
  {
    id: "ejecucion-mensual", title: "% Ejecución mensual (OV→FAC)", section: "Dashboard",
    defaultSize: { w: 5, h: 10 }, minSize: CHART_MIN,
    render: (c) => <ExecutionMonthlyChart monthly={c.metrics.monthly} />,
  },
  {
    id: "top-clientes-pareto", title: "Top 10 clientes · Pareto", section: "Dashboard",
    defaultSize: { w: 7, h: 11 }, minSize: CHART_MIN,
    render: (c) => <TopCustomersPareto year={c.year} />,
  },
  {
    id: "mix-categoria", title: "Mix por macro-categoría", section: "Dashboard",
    defaultSize: { w: 5, h: 11 }, minSize: CHART_MIN,
    render: (c) => <CategoryMixDonut records={c.records as InsightRecord[]} catMap={c.catMap} />,
  },

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
    id: "analisis-financiero", title: "Análisis de Servicio Técnico (ST vs C&R)", section: "Exploración",
    defaultSize: { w: 12, h: 16 }, minSize: { w: 6, h: 10 },
    render: (c) => (
      <TechServiceWidget yearA={c.year} yearB={c.year - 1}
        records={c.records} prevRecords={c.prevRecords} />
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

  // --- Comercial ---
  {
    id: "pareto-clientes", title: "Pareto de clientes", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <ClientParetoCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "top-articulos", title: "Top 15 artículos", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <TopItemsCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "pareto-skus", title: "Pareto de SKUs", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <SkuParetoCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "mix-marca", title: "Mix por marca", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BrandMixCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "bucket-cliente", title: "Macro-categoría × cliente", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BucketByClientCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "heatmap-mes", title: "Heatmap cliente × mes", section: "Comercial",
    defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 6 },
    render: (c) => <MonthHeatmapCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "nuevos-recurrentes", title: "Nuevos vs recurrentes", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <NewVsRecurringCard recordType={c.recordType} />,
  },
  {
    id: "estacionalidad", title: "Estacionalidad por categoría", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <SeasonByBucketCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "mix-anual", title: "Mix por macro-categoría (evolución anual)", section: "Comercial",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <BucketMixCard recordType={c.recordType} />,
  },

  // --- Margen ---
  {
    id: "margen-kpi", title: "Margen bruto estimado", section: "Margen",
    defaultSize: { w: 12, h: 11 }, minSize: { w: 4, h: 8 },
    render: (c) => <MarginKpiCard recordType={c.recordType} />,
  },
  {
    id: "margen-cliente", title: "Margen por cliente", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginByCustomerCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "margen-articulo", title: "Margen por artículo", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginByItemCard recordType={c.recordType} year={c.year} />,
  },
  {
    id: "margen-scatter", title: "Importe vs margen", section: "Margen",
    defaultSize: CHART_SIZE, minSize: CHART_MIN,
    render: (c) => <MarginScatterCard recordType={c.recordType} year={c.year} />,
  },
];

// Clave `string`: los ids llegan desde el layout persistido (BD), donde no hay
// garantía de tipo. Un id desconocido devuelve undefined y el grid lo ignora.
export const WIDGET_MAP = new Map<string, WidgetDef>(WIDGETS.map((w) => [w.id, w]));
