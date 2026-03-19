"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, getYearRange, formatUSD, formatCompactUSD } from "@/lib/constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TechServiceAnalysis, TechServiceDataPoint, TechServiceViewMode } from "@/components/charts/tech-service-analysis";
import { HistoricalSalesCategory } from "@/components/charts/premium/historical-sales-category";
import { GroupingAnalysisCard } from "@/components/charts/premium/grouping-analysis-card";
import { GroupEvolutionCard } from "@/components/charts/premium/group-evolution-card";
import { PredictiveRunRateCard } from "@/components/charts/premium/predictive-run-rate";
import { MeshBackground } from "@/components/ui/mesh-background";
import { getTrendPoints } from "@/lib/math-utils";
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Category, CategoryGroup } from "@/types/database";
import { Sparkles, BarChart3, TrendingUp, Activity, FileText, Receipt } from "lucide-react";
import { motion } from "framer-motion";

const ST_CATEGORIES = [
  'Alquileres', 'CAL CO', 'CAL NOx', 'CAL O3', 'CAL PM', 'CAL SO2', 'ST', 
  'ST APMA', 'ST APNA', 'ST APOA', 'ST APSA', 'ST EDM 180'
];

const CR_CATEGORIES = [
  'C&R AP Series', 'C&R APMA-370', 'C&R APNA-370', 'C&R APOA-370', 'C&R APSA-370', 
  'C&R D-R 290', 'C&R EDM 180', 'C&R ENDA Series', 'C&R Enviro', 'C&R OCMA-500', 
  'C&R PG Series', 'C&R Series 6103', 'C&R Series 7000', 'C&R Shelter', 'C&R U-50 Series'
];

function AnalyticsContent() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("exploration");
  const [yearA, setYearA] = useState(new Date().getFullYear());
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("SALES_ORDER");
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [forecastMonthlyData, setForecastMonthlyData] = useState<any[]>([]);
  const [techServiceViewMode, setTechServiceViewMode] = useState<"MONTHLY" | "QUARTERLY" | "ANNUAL">("QUARTERLY");
  const [techServiceData, setTechServiceData] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedGroups, setSavedGroups] = useState<CategoryGroup[]>([]);

  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "forecast") {
      setActiveTab("forecast");
    } else {
      setActiveTab("exploration");
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resA, resB, catRes, groupRes] = await Promise.all([
        supabase.from("sales_records").select("*").eq("record_year", yearA),
        supabase.from("sales_records").select("*").eq("record_year", yearB),
        supabase.from("categories").select("*"),
        supabase.from("category_groups").select("*, category_group_mappings(*)")
      ]);

      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;
      if (catRes.error) throw catRes.error;
      if (groupRes.error) throw groupRes.error;

      const dataA = resA.data || [];
      const dataB = resB.data || [];
      const allCategories = (catRes.data as any[]) || [];
      const allGroups = (groupRes.data as any[]).map(g => ({
        ...g,
        mappings: g.category_group_mappings || []
      })) || [];

      setCategories(allCategories);
      setSavedGroups(allGroups);
      
      const catMap = new Map<string, string>(
        allCategories.map((c: any) => [String(c.id), String(c.name)])
      );

      // 1. Datos para la comparativa anual (Mensual Genérico)
      const parsedMonthlyData = MONTHS.map(m => {
        const totalA = dataA.filter((r: any) => r.record_month === m.value && r.record_type === recordType)
          .reduce((acc: number, r: any) => acc + Number(r.amount_usd), 0) || 0;
        
        const totalB = dataB.filter((r: any) => r.record_month === m.value && r.record_type === recordType)
          .reduce((acc: number, r: any) => acc + Number(r.amount_usd), 0) || 0;

        return {
          month: m.label,
          [`Año ${yearA}`]: totalA,
          [`Año ${yearB}`]: totalB,
          rawA: totalA, // To calculate trend
        };
      });
      setMonthlyData(parsedMonthlyData);

      // --- Calcular tendencia para Forecast ---
      const historicalValues = parsedMonthlyData.map(d => d.rawA);
      const trendPoints = getTrendPoints(historicalValues, 12);
      
      const forecastWithTrend = parsedMonthlyData.map((d, i) => ({
        ...d,
        tendencia: Math.round(trendPoints[i] * 100) / 100
      }));
      setForecastMonthlyData(forecastWithTrend);

      // 2. Datos para Análisis Financiero (Dinamizado por viewMode)
      let timeSlots: { label: string; months: number[] }[] = [];

      if (techServiceViewMode === "MONTHLY") {
        timeSlots = MONTHS.map(m => ({ label: m.label, months: [m.value] }));
      } else if (techServiceViewMode === "QUARTERLY") {
        timeSlots = [
          { label: "T1", months: [1, 2, 3] },
          { label: "T2", months: [4, 5, 6] },
          { label: "T3", months: [7, 8, 9] },
          { label: "T4", months: [10, 11, 12] },
        ];
      } else {
        // ANNUAL
        timeSlots = [{ label: "Anual", months: [1,2,3,4,5,6,7,8,9,10,11,12] }];
      }

      let acumA = 0;
      let acumB = 0;

      const techData = timeSlots.map(slot => {
        const recordsA = dataA.filter((r: any) => slot.months.includes(Number(r.record_month)) && r.record_type === recordType);
        const recordsB = dataB.filter((r: any) => slot.months.includes(Number(r.record_month)) && r.record_type === recordType);

        let stA = 0, crA = 0, stB = 0, crB = 0;

        recordsA.forEach((r: any) => {
          const catName = catMap.get(r.category_id);
          const amt = Number(r.amount_usd);
          if (catName && ST_CATEGORIES.includes(catName)) stA += amt;
          else if (catName && CR_CATEGORIES.includes(catName)) crA += amt;
        });

        recordsB.forEach((r: any) => {
          const catName = catMap.get(r.category_id);
          const amt = Number(r.amount_usd);
          if (catName && ST_CATEGORIES.includes(catName)) stB += amt;
          else if (catName && CR_CATEGORIES.includes(catName)) crB += amt;
        });

        const totalA = stA + crA;
        const totalB = stB + crB;
        acumA += totalA;
        acumB += totalB;

        return {
          label: slot.label,
          st: stA,
          cr: crA,
          total: totalA,
          acum: acumA,
          st_prev: stB,
          cr_prev: crB,
          total_prev: totalB,
          acum_prev: acumB,
        };
      });

      setTechServiceData(techData);

    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(false);
    }
  }, [yearA, yearB, recordType, techServiceViewMode, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
                <Sparkles className="h-4 w-4 text-primary animate-pulse" /> IA-Driven Business Intelligence para SalesTracker Pro.
              </p>
            </div>

            <TabsList className="bg-white/5 border border-white/10 p-1.5 rounded-2xl backdrop-blur-md h-auto">
              <TabsTrigger value="exploration" className="rounded-xl px-6 h-9 font-bold data-active:bg-primary data-active:text-white flex gap-2">
                <BarChart3 className="size-4" /> Exploración
              </TabsTrigger>
              <TabsTrigger value="forecast" className="rounded-xl px-6 h-9 font-bold data-active:bg-indigo-600 data-active:text-white flex gap-2">
                <Sparkles className="size-4" /> Forecast
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
                  <Tabs 
                    value={recordType} 
                    onValueChange={(v) => setRecordType(v as any)}
                    className="w-full sm:w-auto"
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-white/10 h-10 p-1">
                      <TabsTrigger 
                        value="SALES_ORDER" 
                        className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-active:bg-primary data-active:text-primary-foreground transition-all"
                      >
                        <FileText className="size-3.5" /> ÓRDENES (OV)
                      </TabsTrigger>
                      <TabsTrigger 
                        value="INVOICE" 
                        className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-active:bg-emerald-500 data-active:text-white transition-all"
                      >
                        <Receipt className="size-3.5" /> FACTURAS (FAC)
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
                    <Select value={String(yearA)} onValueChange={v => setYearA(Number(v))}>
                      <SelectTrigger className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getYearRange().map(y => <SelectItem key={y} value={String(y)}>A: {y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="w-px h-4 bg-white/10" />
                    <Select value={String(yearB)} onValueChange={v => setYearB(Number(v))}>
                      <SelectTrigger className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getYearRange().map(y => <SelectItem key={y} value={String(y)}>B: {y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Card className="shadow-2xl border-white/5 bg-white/5 backdrop-blur-xl dark:bg-black/20 overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent pointer-events-none" />
                <CardHeader className="relative z-10 border-b border-white/5 py-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                    {recordType === "SALES_ORDER" ? "Órdenes de Venta (Reserva)" : "Facturación (Ventas)"} 
                    <span className="text-muted-foreground font-normal text-sm ml-2">Global Mensual</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.91 0.01 250 / 0.1)" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} dy={10} />
                      <YAxis tickFormatter={formatCompactUSD} axisLine={false} tickLine={false} />
                      <RechartsTooltip 
                        formatter={(value: number) => formatUSD(value)} 
                        cursor={{ fill: "rgba(147, 197, 253, 0.15)" }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar 
                        dataKey={`Año ${yearA}`} 
                        fill="oklch(0.65 0.2 255)" 
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey={`Año ${yearB}`} 
                        fill="oklch(0.65 0.25 20)" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <TechServiceAnalysis 
                data={techServiceData} 
                yearA={yearA} 
                yearB={yearB} 
                viewMode={techServiceViewMode}
                onViewModeChange={setTechServiceViewMode}
              />

              <HistoricalSalesCategory />
              <GroupingAnalysisCard categories={categories} recordType={recordType} />
              <GroupEvolutionCard savedGroups={savedGroups} recordType={recordType} />
            </motion.div>
          </TabsContent>

          <TabsContent value="forecast" className="outline-none">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Task 1: Run-Rate Card */}
                <PredictiveRunRateCard 
                  className="lg:col-span-1"
                  currentTotal={monthlyData[new Date().getMonth()]?.[`Año ${new Date().getFullYear()}`] || 0}
                  lastYearMonthTotal={monthlyData[new Date().getMonth()]?.[`Año ${new Date().getFullYear() - 1}`] || 0}
                />

                {/* Task 2: Trend Chart */}
                <Card className="lg:col-span-2 shadow-2xl border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
                  <CardHeader className="relative z-10 p-6 border-b border-white/5 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-3">
                        <TrendingUp className="h-5 w-5 text-indigo-400" /> Histórico con Tendencia Linear
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Visualización de datos reales {yearA} proyectados mediante regresión matemática.
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                          <div className="size-3 rounded-sm bg-primary" />
                          <span className="text-xs font-medium text-muted-foreground">Ventas Reales</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <div className="w-3 h-0.5 border-t border-dashed border-cyan-400" />
                          <span className="text-xs font-medium text-muted-foreground">Tendencia Calculada</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={forecastMonthlyData}>
                          <defs>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="4" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis 
                            dataKey="month" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 500 }}
                            dy={10} 
                          />
                          <YAxis 
                            tickFormatter={formatCompactUSD} 
                            axisLine={false} 
                            tickLine={false}
                            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }} 
                          />
                          <RechartsTooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl space-y-2">
                                    <p className="font-bold text-white mb-2">{label}</p>
                                    {payload.map((entry: any, index: number) => (
                                      <div key={index} className="flex items-center justify-between gap-6 text-sm">
                                        <div className="flex items-center gap-2">
                                          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                          <span className="text-white/60">{entry.name}</span>
                                        </div>
                                        <span className="font-mono font-bold text-white">
                                          {formatUSD(entry.value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            name="Ventas Reales"
                            dataKey={`Año ${yearA}`} 
                            fill="oklch(0.65 0.2 255)" 
                            radius={[6, 6, 0, 0]}
                            barSize={35}
                          />
                          <Line 
                            name="Tendencia Calculada"
                            type="monotone" 
                            dataKey="tendencia" 
                            stroke="#22d3ee" 
                            strokeWidth={3}
                            strokeDasharray="8 5"
                            dot={false}
                            activeDot={{ r: 6, fill: "#22d3ee", strokeWidth: 0 }}
                            filter="url(#glow)"
                            animationDuration={2000}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Additional info section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
                <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-primary">
                      <Activity className="size-5" /> ¿Cómo calculamos el Forecast?
                    </h4>
                    <p className="text-muted-foreground leading-relaxed">
                      Nuestro sistema utiliza un algoritmo de <strong>Regresión Lineal Simple</strong> para analizar la trayectoria histórica del año actual. La línea de tendencia suavizada proyecta el comportamiento matemático más probable basado en la pendiente acumulada, ayudando a identificar si el ritmo de ventas se está acelerando o ralentizando.
                    </p>
                </div>
                <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400">
                      <TrendingUp className="size-5" /> Estimación de Cierre (Run-Rate)
                    </h4>
                    <p className="text-muted-foreground leading-relaxed">
                      El Run-Rate mensual calcula el promedio de ventas diarias del mes en curso y lo proyecta para el resto de días restantes. Para que esta métrica sea precisa, comparamos la proyección contra el cierre del mismo mes del año anterior, marcándolo automáticamente como <strong>"On Track"</strong> o <strong>"At Risk"</strong>.
                    </p>
                </div>
              </div>
            </motion.div>
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
