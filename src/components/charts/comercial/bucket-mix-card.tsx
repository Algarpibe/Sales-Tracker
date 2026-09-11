"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import type { SalesRecord } from "@/types/database";
import { buildBucketMixByYear } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

type MixPoint = { year: number; mano_obra: number; cr: number; equipos: number; operacion: number };

function MixTooltip({ active, payload, label }: ChartTooltipProps<MixPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketMixCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  const rows = useMemo(
    () => buildBucketMixByYear((data ?? []) as SalesRecord[], recordType),
    [data, recordType]
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Mix por macro-categoría (evolución anual)</CardTitle>
          <InfoTooltip text={CHART_HELP.bucketMixAnual} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[340px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={340}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <Tooltip content={<MixTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend />
              {/* fillOpacity 0.5: tono suave de la paleta.
                  maxBarSize: con pocos años a ancho completo, sin límite cada barra sería un bloque enorme. */}
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} fillOpacity={0.5} maxBarSize={64} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
