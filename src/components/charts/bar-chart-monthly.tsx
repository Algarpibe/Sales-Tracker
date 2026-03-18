"use client";

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
import { formatCompactUSD } from "@/lib/constants";

interface BarChartMonthlyProps {
  data: Array<{
    month: string;
    sales_orders: number;
    invoices: number;
  }>;
  title?: string;
}

export function BarChartMonthly({ data, title = "Ventas Mensuales" }: BarChartMonthlyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="month"
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactUSD}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.18 0.025 255 / 0.8)",
                border: "1px solid oklch(0.28 0.03 255)",
                borderRadius: "8px",
                color: "oklch(0.95 0.005 250)",
                backdropFilter: "blur(8px)",
              }}
              formatter={(value: number) => [formatCompactUSD(value)]}
            />
            <Legend />
            <Bar
              dataKey="sales_orders"
              name="Órdenes de Venta"
              fill="oklch(0.65 0.2 255)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="invoices"
              name="Facturas"
              fill="oklch(0.7 0.18 190)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
