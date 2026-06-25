"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { buildClientPareto } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ParetoPoint = { customer: string; ventas: number; cumPct: number };

function ParetoTooltip({ active, payload, label }: ChartTooltipProps<ParetoPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{(p?.cumPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function ClientParetoCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-pareto", { recordType, year }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: year, hastaAnio: year }),
  });
  const top = useMemo(() => buildClientPareto(data ?? []).slice(0, 20), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Pareto de clientes {year} (top 20)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[380px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={top} margin={{ top: 10, right: 10, left: 10, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="customer" className="text-[10px] fill-muted-foreground" interval={0} angle={-40} textAnchor="end" height={80} tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="ventas" name="Ventas" fill="oklch(0.65 0.2 255)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
