"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { customerTopItems } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { CustomerItemPoint } from "@/lib/customer-detail";

function ItemTooltip({ active, payload, label }: ChartTooltipProps<CustomerItemPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(p?.importe ?? 0)}</span></div>
    </div>
  );
}

export function CustomerTopItemsCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => customerTopItems(data ?? [], customer, 15), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Top artículos {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ItemTooltip />} />
              <Bar dataKey="importe" name="Importe" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
