"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { getSalesData } from "@/actions/sales-actions";
import { getCategories } from "@/actions/category-actions";
import { getYearRange } from "@/lib/constants";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { KPIDashboardSection } from "@/components/dashboard/kpi-dashboard-section";
import { Separator } from "@/components/ui/separator";

export default function HomePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["SALES_ORDER", "INVOICE"]);

  // react-query: comparte la caché de ventas por año con KPIs/Análisis. Mismo action.
  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", { year }],
    queryFn: () => getSalesData({ year }),
  });
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const isLoading = l1 || l2;

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // Métricas (lógica compartida con KPIs — ver src/lib/dashboard-metrics.ts).
  const metrics = useMemo(
    () => computeDashboardMetrics(recordsData ?? [], catsData ?? []),
    [recordsData, catsData]
  );

  // Filtrar los datos que se pasan al gráfico basándose en la selección
  const chartData = useMemo(() => {
    return metrics.monthly.map(m => ({
      month: m.month,
      sales_orders: selectedTypes.includes("SALES_ORDER") ? m.sales_orders : 0,
      invoices: selectedTypes.includes("INVOICE") ? m.invoices : 0,
    }));
  }, [metrics.monthly, selectedTypes]);

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

      {/* Sección 1: KPIs de Ejecución (Principal) */}
      <section>
        <KPIDashboardSection metrics={metrics} showCharts={false} />
      </section>

      <Separator className="opacity-50" />

      {/* Sección 2: Análisis Mensual (Tendencias) */}
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

        <div className="w-full">
          <BarChartMonthly data={chartData} />
        </div>
      </section>

      <Separator className="opacity-50" />

      {/* Sección 3: Análisis de Backlog (Aging & Concentración) */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Análisis Detallado de Backlog</h2>
          <p className="text-sm text-muted-foreground">Distribución por antigüedad y categorías de riesgo.</p>
        </div>
        <KPIDashboardSection metrics={metrics} showGrid={false} />
      </section>
    </div>
  );
}

