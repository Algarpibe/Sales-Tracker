"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { buildMarginCustomers } from "@/lib/analytics-margin";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginCustomerPoint } from "@/lib/analytics-margin";

function CustTooltip({ active, payload, label }: ChartTooltipProps<MarginCustomerPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginByCustomerCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => buildMarginCustomers(data ?? []).slice(0, 15), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen por cliente {year} (top 15)</CardTitle>
        <p className="text-xs text-muted-foreground">Margen $ estimado; solo bienes con costo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<CustTooltip />} />
              <Bar dataKey="margen" name="Margen" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
