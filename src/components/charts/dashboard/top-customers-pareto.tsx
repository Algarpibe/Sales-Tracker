"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { topCustomers } from "@/lib/dashboard-insights";
import { formatCompactUSD, formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import type { ChartTooltipProps } from "@/lib/chart-types";

type ParetoPoint = { customer: string; amount: number; cumPct: number };

function ParetoTooltip({ active, payload, label }: ChartTooltipProps<ParetoPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.amount ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>% acumulado</span><span className="font-mono">{Math.round(p?.cumPct ?? 0)}%</span></div>
    </div>
  );
}

export function TopCustomersPareto({ year }: { year: number }) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales-top", { tipo, year }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio: year, hastaAnio: year }),
  });
  const rows = useMemo(
    () => topCustomers((data ?? []).map((r) => ({ customer: r.customer, ventas: r.ventas })), 10),
    [data]
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            Top 10 clientes · Pareto
            <InfoTooltip text={CHART_HELP.topClientesPareto} />
          </span>
        </CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[340px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={340}>
            <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="customer" className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatCompactUSD} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${Math.round(v)}%`} className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="amount" name="Importe" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
