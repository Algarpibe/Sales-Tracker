"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { CHART_HELP } from "@/lib/chart-help";
import { formatCompactUSD, formatUSD } from "@/lib/constants";
import type { ChartTooltipProps } from "@/lib/chart-types";

interface BarChartMonthlyProps {
  data: Array<{
    month: string;
    sales_orders: number;
    invoices: number;
  }>;
  title?: string;
}

type MonthlyPoint = { cum_sales_orders?: number; cum_invoices?: number };

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps<MonthlyPoint>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[220px]">
        <h3 className="text-lg font-bold mb-3 text-white border-b border-white/10 pb-2">
          Mes: {label}
        </h3>
        <div className="space-y-4">
          {payload.map((entry, index) => {
            const isSales = entry.dataKey === "sales_orders";
            const cumValue = isSales ? entry.payload?.cum_sales_orders : entry.payload?.cum_invoices;
            return (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" 
                      style={{ backgroundColor: entry.color || entry.fill }} 
                    />
                    <span className="text-sm font-medium text-slate-300">
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-white font-mono">
                    {formatUSD(entry.value ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between pl-5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    Acumulado:
                  </span>
                  <span className="text-[11px] font-bold text-primary font-mono opacity-90">
                    {formatUSD(cumValue || 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export function BarChartMonthly({ data, title = "Ventas Mensuales" }: BarChartMonthlyProps) {
  // Capa opcional: acumulado corriente de ambas series.
  const [showCumulative, setShowCumulative] = useState(false);

  const chartData = useMemo(() => {
    // Bucle en vez de map con acumuladores capturados (FE-008, react-hooks/immutability).
    const out: (BarChartMonthlyProps["data"][number] & { cum_sales_orders: number; cum_invoices: number })[] = [];
    for (const item of data) {
      const prev = out[out.length - 1];
      out.push({
        ...item,
        cum_sales_orders: (prev?.cum_sales_orders ?? 0) + (item.sales_orders || 0),
        cum_invoices: (prev?.cum_invoices ?? 0) + (item.invoices || 0),
      });
    }
    return out;
  }, [data]);

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            {title}
            <InfoTooltip text={CHART_HELP.barMensual} />
          </span>
        </CardTitle>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox checked={showCumulative} onCheckedChange={() => setShowCumulative((v) => !v)} />
          Línea de acumulado
        </label>
      </CardHeader>
      {/* flex-1 + min-h-0: el gráfico toma la altura que le dé el contenedor (el
          widget es redimensionable). minHeight evita que colapse si no hay altura. */}
      <CardContent className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
            <XAxis
              dataKey="month"
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              yAxisId="left"
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactUSD}
              dx={-5}
            />
            {/* Eje propio: el acumulado es de otra magnitud que el importe mensual. */}
            {showCumulative && (
              <YAxis
                yAxisId="right"
                orientation="right"
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactUSD}
              />
            )}
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(147, 197, 253, 0.05)" }}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              height={40}
              iconType="circle"
              className="text-xs"
            />
            <Bar
              yAxisId="left"
              dataKey="sales_orders"
              name="Órdenes de Venta"
              fill="oklch(0.65 0.2 255)"
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
            <Bar
              yAxisId="left"
              dataKey="invoices"
              name="Facturas"
              fill="oklch(0.7 0.18 190)"
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
            {/* Acumulado: continua para OV, discontinua para facturación. */}
            {showCumulative && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cum_sales_orders"
                name="Acum. Órdenes"
                stroke="oklch(0.65 0.2 255)"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            )}
            {showCumulative && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cum_invoices"
                name="Acum. Facturas"
                stroke="oklch(0.7 0.18 190)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
