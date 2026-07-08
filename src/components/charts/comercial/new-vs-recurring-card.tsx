"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { buildNewVsRecurring } from "@/lib/analytics-comercial";
import type { NewVsRecurringRow } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const FIRST_YEAR = 2021;

function NvrTooltip({ active, payload, label }: ChartTooltipProps<NewVsRecurringRow>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span style={{ color: "#10b981" }}>Nuevos</span><span className="font-mono">{formatUSD(p?.nuevos ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span style={{ color: "#6366f1" }}>Recurrentes</span><span className="font-mono">{formatUSD(p?.recurrentes ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span style={{ color: "#f59e0b" }}>Altas nuevas</span><span className="font-mono">{p?.countNuevos ?? 0}</span></div>
    </div>
  );
}

export function NewVsRecurringCard({ recordType }: { recordType: "SALES_ORDER" | "INVOICE" }) {
  const thisYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const chart = useMemo(() => buildNewVsRecurring(data ?? []), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Nuevos vs recurrentes</CardTitle>
        <p className="text-xs text-muted-foreground">Importe por año según año de primera venta. {FIRST_YEAR} es 100% nuevos por definición.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[380px] w-full" />
        ) : chart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chart} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
              <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<NvrTooltip />} />
              <Legend />
              <Bar yAxisId="left" dataKey="nuevos" name="Nuevos" stackId="1" fill="#10b981" />
              <Bar yAxisId="left" dataKey="recurrentes" name="Recurrentes" stackId="1" fill="#6366f1" />
              <Line yAxisId="right" type="monotone" dataKey="countNuevos" name="Altas nuevas" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
