"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";

// Componentes Premium (Antigravity)
import { MeshBackground } from "@/components/ui/mesh-background";
import { KPIDashboardSection } from "@/components/dashboard/kpi-dashboard-section";

export default function KPIsPage() {
  const [year, setYear] = useState(new Date().getFullYear());

  // react-query: misma queryKey ["sales", {year}] que Home → navegación instantánea.
  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", { year }],
    queryFn: () => getSalesData({ year }),
  });
  const { data: catsData, isLoading: l2 } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const isLoading = l1 || l2;

  // Métricas (lógica compartida con Home — ver src/lib/dashboard-metrics.ts).
  const metrics = useMemo(
    () => computeDashboardMetrics(recordsData ?? [], catsData ?? []),
    [recordsData, catsData]
  );

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

        {/* Dashboard Section */}
        <KPIDashboardSection metrics={metrics} />
      </div>
    </div>
  );
}

