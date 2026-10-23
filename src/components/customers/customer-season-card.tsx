"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerMonthSales } from "@/lib/data-client";
import { customerMonths } from "@/lib/customer-detail";
import { MONTH_LABELS, formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const MESES = MONTH_LABELS;

type MonthPoint = { mes: string; importe: number };

function MonthTooltip({ active, payload, label }: ChartTooltipProps<MonthPoint>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(payload[0]?.value ?? 0)}</span></div>
    </div>
  );
}

export function CustomerSeasonCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-month", { tipo: recordType, anio: year, customer }],
    queryFn: () => fetchCustomerMonthSales({ tipo: recordType, anio: year, customer }),
  });
  const rows = useMemo(() => customerMonths(data ?? [], customer).map((importe, i) => ({ mes: MESES[i], importe })), [data, customer]);
  const hasData = useMemo(() => rows.some((r) => r.importe > 0), [rows]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Estacionalidad {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ChartFigure
            label={`Estacionalidad ${year}`}
            summary={{
              data: rows,
              categoryLabel: "Mes",
              category: (r) => r.mes,
              series: [{ label: "Importe", value: (r) => r.importe, format: formatUSD }],
            }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart accessibilityLayer data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
                <XAxis dataKey="mes" className="text-[10px] fill-muted-foreground" tickLine={false} />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
                <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="importe" name="Importe" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
        )}
      </CardContent>
    </Card>
  );
}
