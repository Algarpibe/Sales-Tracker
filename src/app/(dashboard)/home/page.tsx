"use client";

import { useEffect, useState, useMemo } from "react";
import { KPICard } from "@/components/cards/kpi-card";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, formatUSD, getYearRange, RECORD_TYPES } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DollarSign, FileText, ShoppingCart, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
    };
  }>({
    monthly: [],
    totals: { sales_orders: 0, invoices: 0, avg_ticket: 0, conversion: 0 }
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
        const { data: records, error } = await supabase
          .from("sales_records")
          .select("*")
          .eq("record_year", year);

        if (error) throw error;

        const monthlyMap = new Map();
        MONTHS.forEach(m => monthlyMap.set(m.label, { month: m.label, sales_orders: 0, invoices: 0 }));

        let totalSales = 0;
        let totalInvoices = 0;
        let salesCount = 0;

        const salesRecords = records || [];
        salesRecords.forEach((r: any) => {
          const mLabel = MONTHS.find(m => m.value === r.record_month)?.label;
          if (mLabel && monthlyMap.has(mLabel)) {
            const entry = monthlyMap.get(mLabel);
            
            // Only aggregate if the type is selected
            if (r.record_type === "SALES_ORDER") {
              const amount = Number(r.amount_usd);
              entry.sales_orders += amount;
              totalSales += amount;
              salesCount++;
            } else if (r.record_type === "INVOICE") {
              const amount = Number(r.amount_usd);
              entry.invoices += amount;
              totalInvoices += amount;
            }
          }
        });

        setData({
          monthly: Array.from(monthlyMap.values()),
          totals: {
            sales_orders: totalSales,
            invoices: totalInvoices,
            avg_ticket: totalSales / (salesCount || 1),
            conversion: (totalInvoices / (totalSales || 1)) * 100
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        
        <div className="flex flex-wrap items-center gap-6 bg-card/50 px-4 py-2 rounded-lg border border-border/50 backdrop-blur-sm">
          {/* Checklist de selección */}
          <div className="flex items-center gap-4 border-r pr-4 border-border/50">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="type-ov" 
                checked={selectedTypes.includes("SALES_ORDER")}
                onCheckedChange={() => handleTypeToggle("SALES_ORDER")}
              />
              <Label htmlFor="type-ov" className="text-sm font-medium cursor-pointer">Órdenes (OV)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="type-fac" 
                checked={selectedTypes.includes("INVOICE")}
                onCheckedChange={() => handleTypeToggle("INVOICE")}
              />
              <Label htmlFor="type-fac" className="text-sm font-medium cursor-pointer">Facturas (FAC)</Label>
            </div>
          </div>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0">
              <SelectValue placeholder="Año" />
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
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {selectedTypes.includes("SALES_ORDER") && (
          <KPICard
            title="Total Ventas (OV)"
            value={formatUSD(data.totals.sales_orders)}
            icon={ShoppingCart}
            change={12.5}
            variant="premium"
          />
        )}
        {selectedTypes.includes("INVOICE") && (
          <KPICard
            title="Total Facturado"
            value={formatUSD(data.totals.invoices)}
            icon={FileText}
            change={8.2}
            variant="premium"
          />
        )}
        {selectedTypes.includes("SALES_ORDER") && (
          <KPICard
            title="Ticket Promedio"
            value={formatUSD(data.totals.avg_ticket)}
            icon={DollarSign}
            change={2.4}
            variant="premium"
          />
        )}
        {(selectedTypes.includes("SALES_ORDER") && selectedTypes.includes("INVOICE")) && (
          <KPICard
            title="Tasa de Conversión"
            value={`${data.totals.conversion.toFixed(1)}%`}
            icon={TrendingUp}
            change={-1.2}
            variant="premium"
          />
        )}
      </div>

      <div className="w-full">
        <BarChartMonthly data={chartData} />
      </div>
    </div>
  );
}
