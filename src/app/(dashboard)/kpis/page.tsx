"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import { getCategories } from "@/actions/category-actions";
import { getYearRange } from "@/lib/constants";
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

  // Cálculo idéntico al anterior, ahora memorizado a partir de los datos cacheados.
  const metrics = useMemo(() => {
    const records = recordsData ?? [];
    const categories = catsData ?? [];
    const catMap = new Map(categories.map((c: any) => [c.id, c.name]));

    let totalSales = 0;
    let totalInvoices = 0;
    records.forEach((r: any) => {
      const amount = Number(r.amount_usd);
      if (r.record_type === "SALES_ORDER") totalSales += amount;
      else if (r.record_type === "INVOICE") totalInvoices += amount;
    });

    const execution_rate = totalSales > 0 ? (totalInvoices / totalSales) * 100 : 0;

    // Backlog REAL: filas record_type='BACKLOG' (pendiente de facturar por orden,
    // calculado en el transform vía invoiced_status de Zoho). Sustituye al antiguo
    // OV−Factura del año, que era engañoso por el desfase temporal entre orden y factura.
    const backlogRecords = records.filter((r: any) => r.record_type === "BACKLOG");
    const backlog = backlogRecords.reduce((s: number, r: any) => s + Number(r.amount_usd), 0);

    // Antigüedad (Aging) del backlog según el mes/año de la orden
    const currentYearDB = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let lowRisk = 0;
    let mediumRisk = 0;
    let highRisk = 0;
    for (const r of backlogRecords) {
      const amount = Number(r.amount_usd);
      const ageMonths = (currentYearDB - r.record_year) * 12 + (currentMonth - r.record_month);
      const ageDays = Math.max(0, ageMonths * 30);
      if (ageDays <= 30) lowRisk += amount;
      else if (ageDays <= 90) mediumRisk += amount;
      else highRisk += amount;
    }

    // Concentración del backlog por categoría
    const concentrationMap = new Map<string, number>();
    for (const r of backlogRecords) {
      const catId = r.category_id || "unassigned";
      concentrationMap.set(catId, (concentrationMap.get(catId) || 0) + Number(r.amount_usd));
    }
    const concentrationData = Array.from(concentrationMap.entries()).map(([catId, amount]) => ({
      categoryName: String(catId === "unassigned" ? "Sin Asignar" : (catMap.get(catId) || "Desconocida")),
      amount,
      percentage: backlog > 0 ? (amount / backlog) * 100 : 0
    }));

    return {
      sales_orders: totalSales,
      invoices: totalInvoices,
      backlog,
      execution_rate,
      aging: { lowRisk, mediumRisk, highRisk, total: backlog },
      concentration: concentrationData
    };
  }, [recordsData, catsData, year]);

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

