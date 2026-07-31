"use client";

import { useMemo, useState } from "react";
import { BarChartMonthly } from "@/components/charts/bar-chart-monthly";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";

export function MonthlySalesWidget({ metrics }: { metrics: DashboardMetrics }) {
  const [showOV, setShowOV] = useState(true);
  const [showFAC, setShowFAC] = useState(true);

  const data = useMemo(
    () => metrics.monthly.map((m) => ({
      month: m.month,
      sales_orders: showOV ? m.sales_orders : 0,
      invoices: showFAC ? m.invoices : 0,
    })),
    [metrics.monthly, showOV, showFAC]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox id="w-ov" checked={showOV} onCheckedChange={() => setShowOV((v) => !v)} />
          <Label htmlFor="w-ov" className="text-xs font-medium cursor-pointer">Órdenes (OV)</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="w-fac" checked={showFAC} onCheckedChange={() => setShowFAC((v) => !v)} />
          <Label htmlFor="w-fac" className="text-xs font-medium cursor-pointer">Facturas (FAC)</Label>
        </div>
      </div>
      <BarChartMonthly data={data} />
    </div>
  );
}
