"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByItem } from "@/actions/margin-actions";
import { buildMarginItems, deriveMargin } from "@/lib/analytics-margin";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginItemPoint } from "@/lib/analytics-margin";

function ScatterTooltip({ active, payload }: ChartTooltipProps<MarginItemPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{p?.label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginScatterCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-item", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByItem({ tipo: recordType, anio: year }),
  });
  const { points, overallPct } = useMemo(() => {
    const pts = buildMarginItems(data ?? []);
    const totV = pts.reduce((s, p) => s + p.ventas, 0);
    const totC = pts.reduce((s, p) => s + p.costo, 0);
    return { points: pts, overallPct: deriveMargin(totV, totC).margenPct };
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Importe vs margen % {year}</CardTitle>
        <p className="text-xs text-muted-foreground">Cada punto es un artículo (bienes). Línea = margen % global.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" />
              <XAxis type="number" dataKey="ventas" name="Ventas" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} />
              <YAxis type="number" dataKey="margenPct" name="Margen %" domain={[0, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <ZAxis range={[40, 40]} />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine y={overallPct} stroke="#f59e0b" strokeDasharray="4 4" />
              <Scatter data={points} fill="#6366f1" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
