import { ShoppingCart, FileText, Receipt, Activity } from "lucide-react";
import { KPICard } from "@/components/cards/kpi-card";
import { formatUSD } from "@/lib/constants";
import { CHART_HELP } from "@/lib/chart-help";
import { yoyChange, type InsightRecord } from "@/lib/dashboard-insights";
import { WIDGET_IDS, type WidgetId } from "@/lib/dashboard-layout";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";
import type { Category, SalesRecord } from "@/types/database";

import { MonthlySalesWidget } from "@/components/dashboard/monthly-sales-widget";
import { CumulativeYoYChart } from "@/components/charts/dashboard/cumulative-yoy-chart";
import { ExecutionMonthlyChart } from "@/components/charts/dashboard/execution-monthly-chart";
import { TopCustomersPareto } from "@/components/charts/dashboard/top-customers-pareto";
import { CategoryMixDonut } from "@/components/charts/dashboard/category-mix-donut";
import { MonthlyComparisonChart } from "@/components/charts/dashboard/monthly-comparison-chart";
import { TechServiceWidget } from "@/components/charts/dashboard/tech-service-widget";
import { SeasonalForecastChart } from "@/components/charts/dashboard/seasonal-forecast-chart";
import { ForecastSummaryWidget } from "@/components/charts/dashboard/forecast-summary-widget";

import { HistoricalSalesCategory } from "@/components/charts/premium/historical-sales-category";
import { GroupingAnalysisCard } from "@/components/charts/premium/grouping-analysis-card";
import { GroupEvolutionCard } from "@/components/charts/premium/group-evolution-card";
import { GroupForecastCard } from "@/components/charts/premium/group-forecast-card";
import { ForecastSalesCategory } from "@/components/charts/premium/forecast-sales-category";

import { ClientParetoCard } from "@/components/charts/comercial/client-pareto-card";
import { TopItemsCard } from "@/components/charts/comercial/top-items-card";
import { SkuParetoCard } from "@/components/charts/comercial/sku-pareto-card";
import { BrandMixCard } from "@/components/charts/comercial/brand-mix-card";
import { BucketByClientCard } from "@/components/charts/comercial/bucket-by-client-card";
import { MonthHeatmapCard } from "@/components/charts/comercial/month-heatmap-card";
import { NewVsRecurringCard } from "@/components/charts/comercial/new-vs-recurring-card";
import { SeasonByBucketCard } from "@/components/charts/comercial/season-by-bucket-card";
import { BucketMixCard } from "@/components/charts/comercial/bucket-mix-card";

import { MarginKpiCard } from "@/components/charts/margin/margin-kpi-card";
import { MarginByCustomerCard } from "@/components/charts/margin/margin-by-customer-card";
import { MarginByItemCard } from "@/components/charts/margin/margin-by-item-card";
import { MarginScatterCard } from "@/components/charts/margin/margin-scatter-card";

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
        records={c.records} prevRecords={c.prevRecords} catMap={c.catMap} />
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

// Salvaguarda: el registro debe cubrir exactamente los ids canónicos.
export const MISSING_WIDGETS = WIDGET_IDS.filter((id) => !WIDGET_MAP.has(id));
