"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import { executionByMonth } from "@/lib/dashboard-insights";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ExecPoint = { month: string; pct: number };

function ExecTooltip({ active, payload, label }: ChartTooltipProps<ExecPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="font-mono">{Math.round(payload[0].value ?? 0)}% ejecución</div>
    </div>
  );
}

export function ExecutionMonthlyChart({
  monthly,
}: {
  monthly: { month: string; sales_orders: number; invoices: number }[];
}) {
  const data = useMemo(() => executionByMonth(monthly), [monthly]);
  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            % Ejecución mensual (OV→FAC)
            <InfoTooltip text={CHART_HELP.executionMensual} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ChartFigure
          label="% Ejecución mensual (OV→FAC)"
          summary={{
            data,
            categoryLabel: "Mes",
            category: (p) => p.month,
            series: [{ label: "Ejecución", value: (p) => p.pct, format: (v) => `${Math.round(v)}%` }],
          }}
        >
          <ResponsiveContainer width="100%" height="100%" minHeight={320}>
            <LineChart accessibilityLayer data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="month" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 25) * 25)]}
                tickFormatter={(v) => `${Math.round(v)}%`}
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ExecTooltip />} />
              <Line type="monotone" dataKey="pct" name="Ejecución" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFigure>
      </CardContent>
    </Card>
  );
}
