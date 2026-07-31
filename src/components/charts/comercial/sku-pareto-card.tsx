"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { buildItemPareto } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { ItemParetoRow } from "@/lib/analytics-comercial";

function ParetoTooltip({ active, payload, label }: ChartTooltipProps<ItemParetoRow>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.importe ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{(p?.cumPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function SkuParetoCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["top-items", { recordType, year }],
    queryFn: () => getItemSales({ tipo: recordType, desde: `${year}-01-01`, hasta: `${year}-12-31` }),
  });
  const top = useMemo(() => buildItemPareto(data ?? []).slice(0, 30), [data]);

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Pareto de SKUs {year} (top 30)</CardTitle>
          <InfoTooltip text={CHART_HELP.skuPareto} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[400px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={400}>
            <ComposedChart data={top} margin={{ top: 10, right: 10, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="label" className="text-[9px] fill-muted-foreground" interval={0} angle={-45} textAnchor="end" height={90} tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="importe" name="Importe" fill="oklch(0.65 0.2 255)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
