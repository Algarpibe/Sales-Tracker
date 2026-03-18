"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getYearRange, formatUSD } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Componentes Estándar
import { KPICard } from "@/components/cards/kpi-card";
import { ShoppingCart, FileText } from "lucide-react";

// Componentes Premium (Antigravity)
import { BacklogCard } from "@/components/cards/premium/backlog-card";
import { ExecutionCard } from "@/components/cards/premium/execution-card";
import { AgingCard } from "@/components/cards/premium/aging-card";
import { ConcentrationCard } from "@/components/cards/premium/concentration-card";
import { MeshBackground } from "@/components/ui/mesh-background";

export default function KPIsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    sales_orders: 0,
    invoices: 0,
    backlog: 0,
    execution_rate: 0,
    aging: { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0 },
    concentration: [] as { categoryName: string; amount: number; percentage: number }[]
  });

  const supabase = createClient();

  useEffect(() => {
    async function fetchKPIData() {
      setIsLoading(true);
      try {
        const [recordsResponse, categoriesResponse] = await Promise.all([
          supabase.from("sales_records").select("record_month, record_type, amount_usd, category_id").eq("record_year", year),
          supabase.from("categories").select("id, name")
        ]);

        if (recordsResponse.error) throw recordsResponse.error;
        if (categoriesResponse.error) throw categoriesResponse.error;

        const records = recordsResponse.data || [];
        const categories = categoriesResponse.data || [];
        const catMap = new Map(categories.map((c: any) => [c.id, c.name]));

        let totalSales = 0;
        let totalInvoices = 0;

        // Estructura para cruzar meses y categorías: category_id -> month -> { sales, invoices }
        const dataMap = new Map<string, Map<number, { sales: number; invoices: number }>>();

        records.forEach((r: any) => {
          const amount = Number(r.amount_usd);
          if (r.record_type === "SALES_ORDER") totalSales += amount;
          else if (r.record_type === "INVOICE") totalInvoices += amount;

          // Agrupación
          const catId = r.category_id || "unassigned";
          const month = r.record_month || 1;

          if (!dataMap.has(catId)) dataMap.set(catId, new Map());
          const monthMap = dataMap.get(catId)!;
          if (!monthMap.has(month)) monthMap.set(month, { sales: 0, invoices: 0 });

          if (r.record_type === "SALES_ORDER") monthMap.get(month)!.sales += amount;
          else if (r.record_type === "INVOICE") monthMap.get(month)!.invoices += amount;
        });

        const backlog = Math.max(0, totalSales - totalInvoices);
        const execution_rate = totalSales > 0 ? (totalInvoices / totalSales) * 100 : 0;

        // Evaluar Antigüedad (Aging) y Concentración
        const currentYearDB = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        let lowRisk = 0;
        let mediumRisk = 0;
        let highRisk = 0;
        let totalAgingBacklog = 0;

        const concentrationMap = new Map<string, number>();

        dataMap.forEach((monthMap, catId) => {
          let catBacklog = 0;
          monthMap.forEach((vals, m) => {
            const netBacklog = Math.max(0, vals.sales - vals.invoices);
            if (netBacklog > 0) {
              catBacklog += netBacklog;
              totalAgingBacklog += netBacklog;

              // Cálculo estimado de días de antigüedad
              const ageMonths = (currentYearDB - year) * 12 + (currentMonth - m);
              const ageDays = Math.max(0, ageMonths * 30);

              if (ageDays <= 30) lowRisk += netBacklog;
              else if (ageDays <= 90) mediumRisk += netBacklog;
              else highRisk += netBacklog;
            }
          });
          
          if (catBacklog > 0) {
            concentrationMap.set(catId, catBacklog);
          }
        });

        const concentrationData = Array.from(concentrationMap.entries()).map(([catId, amount]) => ({
          categoryName: String(catId === "unassigned" ? "Sin Asignar" : (catMap.get(catId) || "Desconocida")),
          amount,
          percentage: totalAgingBacklog > 0 ? (amount / totalAgingBacklog) * 100 : 0
        }));

        setMetrics({
          sales_orders: totalSales,
          invoices: totalInvoices,
          backlog,
          execution_rate,
          aging: { lowRisk, mediumRisk, highRisk, total: totalAgingBacklog },
          concentration: concentrationData
        });

      } catch (error) {
        console.error("Error fetching KPI data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchKPIData();
  }, [year, supabase]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const backlogPercentageOfSales = metrics.sales_orders > 0 
    ? (metrics.backlog / metrics.sales_orders) * 100 
    : 0;

  return (
    <div className="relative min-h-screen">
      <MeshBackground />
      <div className="space-y-8 max-w-full px-4 mx-auto relative z-10 pb-20">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Ventas &amp; Riesgo (KPIs)</h1>
          <p className="text-muted-foreground">
            Indicadores ejecutivos y análisis de liquidez pendiente para {year}.
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[160px] bg-card/50 backdrop-blur-sm">
            <SelectValue placeholder="Año fiscal" />
          </SelectTrigger>
          <SelectContent>
            {getYearRange().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fila 1: Resumen Ejecutivo */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {/* Usando tarjetas estándar para los totales base */}
        <KPICard 
          title="Ventas Comprometidas (OV)" 
          value={formatUSD(metrics.sales_orders)} 
          icon={ShoppingCart} 
          variant="premium"
        />
        <KPICard 
          title="Total Facturado" 
          value={formatUSD(metrics.invoices)} 
          icon={FileText} 
          variant="premium"
        />
        {/* Componentes Premium para los KPIs core */}
        <BacklogCard 
          value={formatUSD(metrics.backlog)} 
          percentageGoal={backlogPercentageOfSales} 
          className="lg:col-span-1"
        />
        <ExecutionCard 
          percentage={metrics.execution_rate} 
          className="lg:col-span-1"
        />
      </div>

      {/* Fila 2: Análisis de Riesgo y Origen */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 h-full">
          <AgingCard data={metrics.aging} className="h-full" />
        </div>
        <div className="lg:col-span-2 h-full">
          <ConcentrationCard data={metrics.concentration} className="h-full" />
        </div>
      </div>
      </div>
    </div>
  );
}
