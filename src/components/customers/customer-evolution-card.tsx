"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { customerYearSeries } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { CustomerYearPoint } from "@/lib/customer-detail";

const FIRST_YEAR = 2021;

function EvoTooltip({ active, payload, label }: ChartTooltipProps<CustomerYearPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(payload[0]?.value ?? 0)}</span></div>
    </div>
  );
}

export function CustomerEvolutionCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const thisYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const series = useMemo(() => customerYearSeries(data ?? [], customer), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Evolución anual</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={series} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="year" className="text-xs fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<EvoTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                {series.map((s) => (
                  <Cell key={s.year} fill={s.year === year ? "#6366f1" : "#6366f180"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
