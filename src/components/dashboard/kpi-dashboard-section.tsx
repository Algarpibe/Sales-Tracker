"use client";

import { KPICard } from "@/components/cards/kpi-card";
import { ShoppingCart, FileText } from "lucide-react";
import { BacklogCard } from "@/components/cards/premium/backlog-card";
import { ExecutionCard } from "@/components/cards/premium/execution-card";
import { AgingCard } from "@/components/cards/premium/aging-card";
import { ConcentrationCard } from "@/components/cards/premium/concentration-card";
import { formatUSD } from "@/lib/constants";

interface KPIDashboardSectionProps {
  metrics: {
    sales_orders: number;
    invoices: number;
    backlog: number;
    execution_rate: number;
    aging: { lowRisk: number; mediumRisk: number; highRisk: number; total: number };
    concentration: { categoryName: string; amount: number; percentage: number }[];
  };
  showGrid?: boolean;
  showCharts?: boolean;
}

export function KPIDashboardSection({ 
  metrics, 
  showGrid = true, 
  showCharts = true 
}: KPIDashboardSectionProps) {
  const backlogPercentageOfSales = metrics.sales_orders > 0 
    ? (metrics.backlog / metrics.sales_orders) * 100 
    : 0;

  return (
    <div className="space-y-8">
      {showGrid && (
        <>
          {/* Cabecera Sección */}
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Ventas & Riesgo (KPIs)</h2>
            <p className="text-sm text-muted-foreground">
              Indicadores ejecutivos y análisis de liquidez pendiente.
            </p>
          </div>

          {/* Grid de KPIs - Fila 1 */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
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
        </>
      )}

      {/* Grid de Gráficos - Fila 2 */}
      {showCharts && (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3 h-full">
            <AgingCard data={metrics.aging} className="h-full" />
          </div>
          <div className="lg:col-span-2 h-full">
            <ConcentrationCard data={metrics.concentration} className="h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
