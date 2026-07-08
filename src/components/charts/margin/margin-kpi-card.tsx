"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByYear } from "@/actions/margin-actions";
import { buildMarginByYear } from "@/lib/analytics-margin";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginYearPoint } from "@/lib/analytics-margin";

function PctTooltip({ active, payload, label }: ChartTooltipProps<MarginYearPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

export function MarginKpiCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-year", { tipo: recordType }],
    queryFn: () => getMarginByYear({ tipo: recordType }),
  });
  const { series, totals } = useMemo(() => buildMarginByYear(data ?? []), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen bruto estimado (solo bienes)</CardTitle>
        <p className="text-xs text-muted-foreground">Costo estándar del maestro; excluye servicios sin costo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Ventas (bienes)" value={formatUSD(totals.ventas)} />
              <Tile label="Costo" value={formatUSD(totals.costo)} />
              <Tile label="Margen" value={formatUSD(totals.margen)} />
              <Tile label="Margen %" value={`${totals.margenPct.toFixed(1)}%`} />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={series} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
                <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} className="text-xs fill-muted-foreground" tickFormatter={(v) => `${Math.round(v)}%`} tickLine={false} axisLine={false} />
                <Tooltip content={<PctTooltip />} />
                <Line type="monotone" dataKey="margenPct" name="Margen %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
