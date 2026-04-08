"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactUSD, formatUSD } from "@/lib/constants";

interface BarChartMonthlyProps {
  data: Array<{
    month: string;
    sales_orders: number;
    invoices: number;
  }>;
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[220px]">
        <h3 className="text-lg font-bold mb-3 text-white border-b border-white/10 pb-2">
          Mes: {label}
        </h3>
        <div className="space-y-4">
          {payload.map((entry: any, index: number) => {
            const isSales = entry.dataKey === "sales_orders";
            const cumValue = isSales ? entry.payload.cum_sales_orders : entry.payload.cum_invoices;
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
                    {formatUSD(entry.value)}
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
  const chartData = useMemo(() => {
    let cumSales = 0;
    let cumInvoices = 0;
    return data.map(item => {
      cumSales += item.sales_orders || 0;
      cumInvoices += item.invoices || 0;
      return {
        ...item,
        cum_sales_orders: cumSales,
        cum_invoices: cumInvoices
      };
    });
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm shadow-xl">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
            <XAxis
              dataKey="month"
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactUSD}
              dx={-5}
            />
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
              dataKey="sales_orders"
              name="Órdenes de Venta"
              fill="oklch(0.65 0.2 255)"
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
            <Bar
              dataKey="invoices"
              name="Facturas"
              fill="oklch(0.7 0.18 190)"
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
