"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MONTHS, formatCompactUSD, formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { cumulativeSeries, type InsightRecord } from "@/lib/dashboard-insights";
import type { ChartTooltipProps } from "@/lib/chart-types";

type CumPoint = { month: string; actual: number; anterior: number };

function CumTooltip({ active, payload, label }: ChartTooltipProps<CumPoint>) {
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

export function CumulativeYoYChart({
  current, previous, yearActual, yearPrev,
}: {
  current: InsightRecord[];
  previous: InsightRecord[];
  yearActual: number;
  yearPrev: number;
}) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const data = useMemo<CumPoint[]>(() => {
    const cur = cumulativeSeries(current, tipo);
    const prev = cumulativeSeries(previous, tipo);
    return MONTHS.map((m, i) => ({ month: m.label, actual: cur[i], anterior: prev[i] }));
  }, [current, previous, tipo]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">Acumulado {yearActual} vs {yearPrev}</CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
            <XAxis dataKey="month" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
            <Tooltip content={<CumTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="actual" name={String(yearActual)} stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="anterior" name={String(yearPrev)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
