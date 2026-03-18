"use client";

import { useEffect, useState, useMemo } from "react";
import { KPICard } from "@/components/cards/kpi-card";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, formatUSD, getYearRange } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KPIDashboardSection } from "@/components/dashboard/kpi-dashboard-section";
import { Separator } from "@/components/ui/separator";

export default function HomePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["SALES_ORDER", "INVOICE"]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [data, setData] = useState<{
    monthly: any[];
    totals: {
      sales_orders: number;
      invoices: number;
      avg_ticket: number;
      conversion: number;
      backlog: number;
      execution_rate: number;
      aging: { lowRisk: number; mediumRisk: number; highRisk: number; total: number };
      concentration: { categoryName: string; amount: number; percentage: number }[];
    };
  }>({
    monthly: [],
    totals: { 
      sales_orders: 0, 
      invoices: 0, 
      avg_ticket: 0, 
      conversion: 0,
      backlog: 0,
      execution_rate: 0,
      aging: { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0 },
      concentration: []
    }
  });

  const supabase = createClient();

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type) 
        : [...prev, type]
    );
  };

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [recordsResponse, categoriesResponse] = await Promise.all([
          supabase.from("sales_records").select("*").eq("record_year", year),
          supabase.from("categories").select("id, name")
        ]);

        if (recordsResponse.error) throw recordsResponse.error;
        if (categoriesResponse.error) throw categoriesResponse.error;

        const records = recordsResponse.data || [];
        const categories = categoriesResponse.data || [];
        const catMap = new Map(categories.map((c: any) => [c.id, c.name]));

        // --- Monthly Trend Data ---
        const monthlyMap = new Map();
        MONTHS.forEach(m => monthlyMap.set(m.label, { month: m.label, sales_orders: 0, invoices: 0 }));

        let totalSales = 0;
        let totalInvoices = 0;
        let salesCount = 0;

        // Estructura para cruzar meses y categorías: category_id -> month -> { sales, invoices }
        const dataMap = new Map<string, Map<number, { sales: number; invoices: number }>>();

        records.forEach((r: any) => {
          const amount = Number(r.amount_usd);
          const mLabel = MONTHS.find(m => m.value === r.record_month)?.label;
          const month = r.record_month || 1;
          const catId = r.category_id || "unassigned";

          // Monthly trends
          if (mLabel && monthlyMap.has(mLabel)) {
            const entry = monthlyMap.get(mLabel);
            if (r.record_type === "SALES_ORDER") {
              entry.sales_orders += amount;
              totalSales += amount;
              salesCount++;
            } else if (r.record_type === "INVOICE") {
              entry.invoices += amount;
              totalInvoices += amount;
            }
          }

          // KPI Aggregation logic (as in KPIsPage)
          if (!dataMap.has(catId)) dataMap.set(catId, new Map());
          const monthMap = dataMap.get(catId)!;
          if (!monthMap.has(month)) monthMap.set(month, { sales: 0, invoices: 0 });

          if (r.record_type === "SALES_ORDER") monthMap.get(month)!.sales += amount;
          else if (r.record_type === "INVOICE") monthMap.get(month)!.invoices += amount;
        });

        // --- KPI Calculations ---
        const backlog = Math.max(0, totalSales - totalInvoices);
        const execution_rate = totalSales > 0 ? (totalInvoices / totalSales) * 100 : 0;

        // Aging and Concentration
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

        setData({
          monthly: Array.from(monthlyMap.values()),
          totals: {
            sales_orders: totalSales,
            invoices: totalInvoices,
            avg_ticket: totalSales / (salesCount || 1),
            conversion: (totalInvoices / (totalSales || 1)) * 100,
            backlog,
            execution_rate,
            aging: { lowRisk, mediumRisk, highRisk, total: totalAgingBacklog },
            concentration: concentrationData
          }
        });
      } catch (error) {
        console.error("Error fetching home data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [year, supabase]);

  // Filtrar los datos que se pasan al gráfico basándose en la selección
  const chartData = useMemo(() => {
    return data.monthly.map(m => ({
      month: m.month,
      sales_orders: selectedTypes.includes("SALES_ORDER") ? m.sales_orders : 0,
      invoices: selectedTypes.includes("INVOICE") ? m.invoices : 0,
    }));
  }, [data.monthly, selectedTypes]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 pb-20">
      {/* Cabecera Principal */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard General</h1>
          <p className="text-muted-foreground mt-1">Vista centralizada de métricas y rendimiento para el año {year}.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-6 bg-card/50 px-4 py-2 rounded-lg border border-border/50 backdrop-blur-sm shadow-sm">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 font-semibold bg-transparent">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {getYearRange().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  Año {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sección 1: Análisis Mensual (Tendencias) */}
      <section className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Análisis de Tendencias</h2>
            <p className="text-sm text-muted-foreground">Evolución mensual de ventas y facturación.</p>
          </div>

          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-md">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="type-ov-home" 
                checked={selectedTypes.includes("SALES_ORDER")}
                onCheckedChange={() => handleTypeToggle("SALES_ORDER")}
              />
              <Label htmlFor="type-ov-home" className="text-sm font-medium cursor-pointer">Órdenes (OV)</Label>
            </div>
            <div className="flex items-center space-x-2 border-l pl-4 border-border/50">
              <Checkbox 
                id="type-fac-home" 
                checked={selectedTypes.includes("INVOICE")}
                onCheckedChange={() => handleTypeToggle("INVOICE")}
              />
              <Label htmlFor="type-fac-home" className="text-sm font-medium cursor-pointer">Facturas (FAC)</Label>
            </div>
          </div>
        </div>

        {/* Mini Grilla de métricas adicionales si están habilitadas */}
        <div className="grid gap-4 md:grid-cols-2">
          {selectedTypes.includes("SALES_ORDER") && (
            <KPICard
              title="Ticket Promedio (OV)"
              value={formatUSD(data.totals.avg_ticket)}
              icon={DollarSign}
              variant="premium"
            />
          )}
          {(selectedTypes.includes("SALES_ORDER") && selectedTypes.includes("INVOICE")) && (
            <KPICard
              title="Tasa de Conversión (OV a FAC)"
              value={`${data.totals.conversion.toFixed(1)}%`}
              icon={TrendingUp}
              variant="premium"
            />
          )}
        </div>

        <div className="w-full">
          <BarChartMonthly data={chartData} />
        </div>
      </section>

      <Separator className="opacity-50" />

      {/* Sección 2: KPIs de Ejecución (Ventas & Riesgo) */}
      <section>
        <KPIDashboardSection metrics={data.totals} />
      </section>
    </div>
  );
}

