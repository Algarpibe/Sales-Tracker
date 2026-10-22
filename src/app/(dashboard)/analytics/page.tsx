"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getSalesData } from "@/actions/sales-actions";
import { getCategories, getTechServiceCategories } from "@/actions/category-actions";
import { getYearRange } from "@/lib/constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { MeshBackground } from "@/components/ui/mesh-background";
import { computeForecast, historyYears } from "@/lib/forecast";
import { monthlyTotals, historicalMatrix } from "@/lib/forecast-widget-data";
import { buildTechServiceData, gruposServicioTecnico, TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { PeriodBar } from "@/components/common/period-bar";
import type { Category } from "@/types/database";
import { Sparkles, BarChart3, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { SalesRecord } from "@/types/database";
import { usePeriod } from "@/components/providers/period-provider";
import { CHART_HELP } from "@/lib/chart-help";

// Lazy-load de los charts pesados (recharts/framer) con next/dynamic (F3-02):
// cada uno es su propio chunk y se carga en cliente bajo demanda, aligerando el
// bundle inicial de /analytics. Skeleton mientras carga.
const chartSkeleton = () => <Skeleton className="h-[400px] w-full rounded-xl" />;
const TechServiceAnalysis = dynamic(
  () => import("@/components/charts/tech-service-analysis").then((m) => m.TechServiceAnalysis),
  { ssr: false, loading: chartSkeleton }
);
const MonthlyComparisonChart = dynamic(
  () => import("@/components/charts/dashboard/monthly-comparison-chart").then((m) => m.MonthlyComparisonChart),
  { ssr: false, loading: chartSkeleton }
);
const SeasonalForecastChart = dynamic(
  () => import("@/components/charts/dashboard/seasonal-forecast-chart").then((m) => m.SeasonalForecastChart),
  { ssr: false, loading: chartSkeleton }
);
const HistoricalSalesCategory = dynamic(
  () => import("@/components/charts/premium/historical-sales-category").then((m) => m.HistoricalSalesCategory),
  { ssr: false, loading: chartSkeleton }
);
const GroupingAnalysisCard = dynamic(
  () => import("@/components/charts/premium/grouping-analysis-card").then((m) => m.GroupingAnalysisCard),
  { ssr: false, loading: chartSkeleton }
);
const GroupEvolutionCard = dynamic(
  () => import("@/components/charts/premium/group-evolution-card").then((m) => m.GroupEvolutionCard),
  { ssr: false, loading: chartSkeleton }
);
const MacroEvolutionCard = dynamic(
  () => import("@/components/charts/premium/macro-evolution-card").then((m) => m.MacroEvolutionCard),
  { ssr: false, loading: chartSkeleton }
);
const GroupForecastCard = dynamic(
  () => import("@/components/charts/premium/group-forecast-card").then((m) => m.GroupForecastCard),
  { ssr: false, loading: chartSkeleton }
);
const ForecastSalesCategory = dynamic(
  () => import("@/components/charts/premium/forecast-sales-category").then((m) => m.ForecastSalesCategory),
  { ssr: false, loading: chartSkeleton }
);
const PredictiveRunRateCard = dynamic(
  () => import("@/components/charts/premium/predictive-run-rate").then((m) => m.PredictiveRunRateCard),
  { ssr: false, loading: chartSkeleton }
);
const CommercialKpiTable = dynamic(
  () => import("@/components/charts/comercial/commercial-kpi-table").then((m) => m.CommercialKpiTable),
  { ssr: false, loading: chartSkeleton }
);
const BucketMixCard = dynamic(
  () => import("@/components/charts/comercial/bucket-mix-card").then((m) => m.BucketMixCard),
  { ssr: false, loading: chartSkeleton }
);
const ClientParetoCard = dynamic(
  () => import("@/components/charts/comercial/client-pareto-card").then((m) => m.ClientParetoCard),
  { ssr: false, loading: chartSkeleton }
);
const TopItemsCard = dynamic(
  () => import("@/components/charts/comercial/top-items-card").then((m) => m.TopItemsCard),
  { ssr: false, loading: chartSkeleton }
);
const SkuParetoCard = dynamic(
  () => import("@/components/charts/comercial/sku-pareto-card").then((m) => m.SkuParetoCard),
  { ssr: false, loading: chartSkeleton }
);
const BucketByClientCard = dynamic(
  () => import("@/components/charts/comercial/bucket-by-client-card").then((m) => m.BucketByClientCard),
  { ssr: false, loading: chartSkeleton }
);
const BrandMixCard = dynamic(
  () => import("@/components/charts/comercial/brand-mix-card").then((m) => m.BrandMixCard),
  { ssr: false, loading: chartSkeleton }
);
const NewVsRecurringCard = dynamic(
  () => import("@/components/charts/comercial/new-vs-recurring-card").then((m) => m.NewVsRecurringCard),
  { ssr: false, loading: chartSkeleton }
);
const MonthHeatmapCard = dynamic(
  () => import("@/components/charts/comercial/month-heatmap-card").then((m) => m.MonthHeatmapCard),
  { ssr: false, loading: chartSkeleton }
);
const SeasonByBucketCard = dynamic(
  () => import("@/components/charts/comercial/season-by-bucket-card").then((m) => m.SeasonByBucketCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginKpiCard = dynamic(
  () => import("@/components/charts/margin/margin-kpi-card").then((m) => m.MarginKpiCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginByItemCard = dynamic(
  () => import("@/components/charts/margin/margin-by-item-card").then((m) => m.MarginByItemCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginScatterCard = dynamic(
  () => import("@/components/charts/margin/margin-scatter-card").then((m) => m.MarginScatterCard),
  { ssr: false, loading: chartSkeleton }
);
const MarginByCustomerCard = dynamic(
  () => import("@/components/charts/margin/margin-by-customer-card").then((m) => m.MarginByCustomerCard),
  { ssr: false, loading: chartSkeleton }
);

function AnalyticsContent() {
  const [activeTab, setActiveTab] = useState("exploration");
  const { tipo: recordType, setTipo: setRecordType, year: yearA, setYear: setYearA } = usePeriod();
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
  const [techServiceViewMode, setTechServiceViewMode] = useState<"MONTHLY" | "QUARTERLY" | "ANNUAL">("QUARTERLY");
  // Tipo de registro PROPIO de Análisis de Servicio Técnico: deliberadamente
  // independiente del tipo global de usePeriod(), que gobierna el resto de la pestaña.
  const [techServiceRecordType, setTechServiceRecordType] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");

  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "forecast") {
      setActiveTab("forecast");
      // Forzamos el año actual para el Forecast por petición del usuario
      setYearA(new Date().getFullYear());
    } else {
      setActiveTab("exploration");
    }
  }, [searchParams, setYearA]);

  // react-query: 3 fuentes cacheadas. ["sales", {}] = todas las ventas (histórico).
  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", {}],
    queryFn: () => getSalesData({}),
  });
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  // Clasificación ST / C&R guardada, incluidas las categorías inactivas: la misma
  // consulta que usan el widget del dashboard y el KPI de la tabla comercial.
  const { data: techCatsData, isLoading: l3 } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
  });
  const loading = l1 || l2 || l3;

  const allRecords: SalesRecord[] = useMemo(() => recordsData ?? [], [recordsData]);
  const categories = useMemo<Category[]>(() => (catsData as Category[]) ?? [], [catsData]);

  // 1. Forecast del año A: alimenta las dos tarjetas de proyección de cierre.
  // Las series salen de los helpers compartidos con los widgets del dashboard.
  const forecast = useMemo(() => {
    const now = new Date();
    return computeForecast({
      currentYearMonthly: monthlyTotals(allRecords, yearA, recordType),
      lastYearMonthly: monthlyTotals(allRecords, yearB, recordType),
      historicalMatrix: historicalMatrix(allRecords, historyYears(yearA), recordType),
      weights: [3, 2, 1], // A-1 / A-2 / A-3
      now: {
        monthIdx: now.getMonth(),
        day: now.getDate(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      },
      isCurrentActualYear: yearA === now.getFullYear(),
    });
  }, [allRecords, yearA, yearB, recordType]);

  // 2. Análisis de Servicio Técnico ST vs C&R: mismo lib puro y misma clasificación
  // guardada que el widget del dashboard y el KPI de la tabla comercial.
  const gruposST = useMemo(() => gruposServicioTecnico(techCatsData ?? []), [techCatsData]);
  const techServiceData = useMemo(() => {
    const dataA = allRecords.filter((r: SalesRecord) => r.record_year === yearA);
    const dataB = allRecords.filter((r: SalesRecord) => r.record_year === yearB);
    return buildTechServiceData(dataA, dataB, gruposST, techServiceRecordType, techServiceViewMode);
  }, [allRecords, gruposST, yearA, yearB, techServiceRecordType, techServiceViewMode]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <MeshBackground />
      <div className="space-y-10 max-w-full px-4 mx-auto relative z-10 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/50">
                Análisis Inteligente
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" /> Análisis comercial y proyecciones.
              </p>
            </div>

            <TabsList className="bg-white/5 border border-white/10 p-1.5 rounded-2xl backdrop-blur-md h-auto">
              <TabsTrigger value="exploration" className="rounded-xl px-6 h-9 font-bold data-active:bg-primary data-active:text-white flex gap-2">
                <BarChart3 className="size-4" /> Exploración
              </TabsTrigger>
              <TabsTrigger value="forecast" className="rounded-xl px-6 h-9 font-bold data-active:bg-indigo-600 data-active:text-white flex gap-2">
                <Sparkles className="size-4" /> Forecast
              </TabsTrigger>
              <TabsTrigger value="comercial" className="rounded-xl px-6 h-9 font-bold data-active:bg-emerald-600 data-active:text-white flex gap-2">
                Comercial
              </TabsTrigger>
              <TabsTrigger value="margen" className="rounded-xl px-6 h-9 font-bold data-active:bg-amber-600 data-active:text-white flex gap-2">
                Margen
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="exploration" className="outline-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div />

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <RecordTypeToggle
                    value={recordType}
                    onValueChange={(v) => setRecordType(v)}
                  />

                  <div className="flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
                    <Select value={String(yearA)} onValueChange={v => setYearA(Number(v))}>
                      <SelectTrigger aria-label="Año A" className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getYearRange().map(y => <SelectItem key={y} value={String(y)}>A: {y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="w-px h-4 bg-white/10" />
                    <Select value={String(yearB)} onValueChange={v => setYearB(Number(v))}>
                      <SelectTrigger aria-label="Año B" className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getYearRange().map(y => <SelectItem key={y} value={String(y)}>B: {y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="h-[480px]">
                <MonthlyComparisonChart
                  recordType={recordType}
                  yearA={yearA}
                  yearB={yearB}
                  records={allRecords}
                  prevRecords={allRecords}
                />
              </div>

              <TechServiceAnalysis
                data={techServiceData}
                yearA={yearA}
                yearB={yearB}
                viewMode={techServiceViewMode}
                onViewModeChange={setTechServiceViewMode}
                recordType={techServiceRecordType}
                onRecordTypeChange={setTechServiceRecordType}
              />

              <HistoricalSalesCategory />
              <GroupingAnalysisCard categories={categories} recordType={recordType} />
              <GroupEvolutionCard recordType={recordType} />
              <MacroEvolutionCard recordType={recordType} />
            </motion.div>
          </TabsContent>

          <TabsContent value="forecast" className="outline-none">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                    <TrendingUp className="size-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-foreground">
                      Análisis Predictivo de {recordType === "SALES_ORDER" ? "Órdenes" : "Facturas"}
                    </h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                       <Sparkles className="size-3.5 text-indigo-400" /> Historial y Proyección de Cierre {yearA}.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <RecordTypeToggle
                    value={recordType}
                    onValueChange={(v) => setRecordType(v)}
                  />
                </div>
              </div>

              <div className="space-y-8">
                {/* Task 1 & 1.5: Projection Cards in a full-width 2-column grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                  <PredictiveRunRateCard
                    currentTotal={forecast.month.actual}
                    lastYearMonthTotal={forecast.month.reference}
                    projectedTotal={forecast.month.value}
                    low={forecast.month.low}
                    high={forecast.month.high}
                    deltaPct={forecast.month.deltaPct}
                    deltaLabel="mismo mes año anterior"
                    info={CHART_HELP.forecastMes}
                  />

                  <PredictiveRunRateCard
                    title={`Proyección de Cierre Año ${yearA}`}
                    currentLabel="Ventas Acum. (YTD)"
                    targetLabel={`Total Año ${yearB}`}
                    currentTotal={forecast.year.actual}
                    lastYearMonthTotal={forecast.year.reference}
                    projectedTotal={forecast.year.value}
                    low={forecast.year.low}
                    high={forecast.year.high}
                    deltaPct={forecast.year.deltaPct}
                    deltaLabel="mismo periodo año anterior"
                    info={CHART_HELP.forecastAnio}
                  />
                </div>

                {/* Task 2: Trend Chart in its own row */}
                <div className="h-[560px]">
                  <SeasonalForecastChart recordType={recordType} year={yearA} />
                </div>
              </div>

              {/* Task 3: Group Forecast Card */}
              <GroupForecastCard recordType={recordType} baseYear={yearA} />
              <ForecastSalesCategory baseYear={yearA} />
            </motion.div>
          </TabsContent>
          <TabsContent value="comercial" className="outline-none">
            <div className="space-y-6">
              <PeriodBar
                recordType={recordType}
                onRecordTypeChange={setRecordType}
                year={yearA}
                onYearChange={setYearA}
              />

              <CommercialKpiTable recordType={recordType} year={yearA} />

              <BucketMixCard recordType={recordType} />
              <div className="grid gap-6 lg:grid-cols-2">
                <ClientParetoCard recordType={recordType} year={yearA} />
                <TopItemsCard recordType={recordType} year={yearA} />
              </div>
              <SkuParetoCard recordType={recordType} year={yearA} />
              <div className="grid gap-6 lg:grid-cols-2">
                <BucketByClientCard recordType={recordType} year={yearA} />
                <BrandMixCard recordType={recordType} year={yearA} />
              </div>
              <NewVsRecurringCard recordType={recordType} />
              <MonthHeatmapCard recordType={recordType} year={yearA} />
              <SeasonByBucketCard recordType={recordType} year={yearA} />
            </div>
          </TabsContent>
          <TabsContent value="margen" className="outline-none">
            <div className="space-y-6">
              <PeriodBar
                recordType={recordType}
                onRecordTypeChange={setRecordType}
                year={yearA}
                onYearChange={setYearA}
              />
              <MarginKpiCard recordType={recordType} />
              <div className="grid gap-6 lg:grid-cols-2">
                <MarginByItemCard recordType={recordType} year={yearA} />
                <MarginScatterCard recordType={recordType} year={yearA} />
              </div>
              <MarginByCustomerCard recordType={recordType} year={yearA} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Skeleton className="h-[600px] w-full" /></div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
