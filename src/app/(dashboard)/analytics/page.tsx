"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, getYearRange, formatUSD, formatCompactUSD } from "@/lib/constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TechServiceAnalysis, TechServiceQuarterData } from "@/components/charts/tech-service-analysis";
import { HistoricalSalesCategory } from "@/components/charts/premium/historical-sales-category";
import { GroupingAnalysisCard } from "@/components/charts/premium/grouping-analysis-card";
import { GroupEvolutionCard } from "@/components/charts/premium/group-evolution-card";
import { MeshBackground } from "@/components/ui/mesh-background";
import type { Category, CategoryGroup } from "@/types/database";

const ST_CATEGORIES = [
  'Alquileres', 'CAL CO', 'CAL NOx', 'CAL O3', 'CAL PM', 'CAL SO2', 'ST', 
  'ST APMA', 'ST APNA', 'ST APOA', 'ST APSA', 'ST EDM 180'
];

const CR_CATEGORIES = [
  'C&R AP Series', 'C&R APMA-370', 'C&R APNA-370', 'C&R APOA-370', 'C&R APSA-370', 
  'C&R D-R 290', 'C&R EDM 180', 'C&R ENDA Series', 'C&R Enviro', 'C&R OCMA-500', 
  'C&R PG Series', 'C&R Series 6103', 'C&R Series 7000', 'C&R Shelter', 'C&R U-50 Series'
];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [yearA, setYearA] = useState(new Date().getFullYear());
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("SALES_ORDER");
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [techServiceData, setTechServiceData] = useState<TechServiceQuarterData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedGroups, setSavedGroups] = useState<CategoryGroup[]>([]);

  const supabase = createClient();

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
        };
      });
      setMonthlyData(parsedMonthlyData);

      // 2. Datos para Análisis de Servicio Técnico (Trimestral)
      // Función helper para procesar un año específico
      const processYearData = (records: any[]) => {
        let qs = [
          { st: 0, cr: 0 }, // Q1
          { st: 0, cr: 0 }, // Q2
          { st: 0, cr: 0 }, // Q3
          { st: 0, cr: 0 }  // Q4
        ];

        records.filter((r: any) => r.record_type === recordType).forEach((r: any) => {
          const categoryName = catMap.get(r.category_id);
          const amount = Number(r.amount_usd);
          const month = Number(r.record_month);
          
          if (!categoryName) return;

          let qIndex = -1;
          if (month >= 1 && month <= 3) qIndex = 0;
          else if (month >= 4 && month <= 6) qIndex = 1;
          else if (month >= 7 && month <= 9) qIndex = 2;
          else if (month >= 10 && month <= 12) qIndex = 3;

          if (qIndex === -1) return;

          if (ST_CATEGORIES.includes(categoryName)) {
            qs[qIndex].st += amount;
          } else if (CR_CATEGORIES.includes(categoryName)) {
            qs[qIndex].cr += amount;
          }
        });
        return qs;
      };

      const qsA = processYearData(dataA);
      const qsB = processYearData(dataB);

      let acumA = 0;
      let acumB = 0;

      const techData: TechServiceQuarterData[] = qsA.map((qA, idx) => {
        const qB = qsB[idx];
        const totalA = qA.st + qA.cr;
        const totalB = qB.st + qB.cr;
        
        acumA += totalA;
        acumB += totalB;

        return {
          quarter: `T${idx + 1}`,
          st: qA.st,
          cr: qA.cr,
          total: totalA,
          acum: acumA,
          st_prev: qB.st,
          cr_prev: qB.cr,
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
  }, [yearA, yearB, recordType, supabase]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Análisis</h1>
          <p className="text-muted-foreground mt-1">Comparativas interanuales e inteligencia de negocios.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Tabs 
            value={recordType} 
            onValueChange={(v) => setRecordType(v as any)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-white/10 h-10">
              <TabsTrigger value="SALES_ORDER" className="text-xs font-bold">Reserva (OV)</TabsTrigger>
              <TabsTrigger value="INVOICE" className="text-xs font-bold">Venta (Factura)</TabsTrigger>
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
                contentStyle={{
                  backgroundColor: "oklch(0.18 0.025 255 / 0.8)",
                  border: "1px solid oklch(0.28 0.03 255)",
                  borderRadius: "12px",
                  color: "oklch(0.95 0.005 250)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.1)",
                }}
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

      {/* Fase 9: Technical Service Analysis */}
      <TechServiceAnalysis data={techServiceData} yearA={yearA} yearB={yearB} />

      {/* Fase 10: Historical Annual Sales by Category */}
      <HistoricalSalesCategory />

      {/* Fase 11: Custom Category Groupings Analysis */}
      <GroupingAnalysisCard categories={categories} recordType={recordType} />

      {/* Fase 12: Historical Annual Sales by Custom Group */}
      <GroupEvolutionCard savedGroups={savedGroups} recordType={recordType} />
      </div>
    </div>
  );
}
