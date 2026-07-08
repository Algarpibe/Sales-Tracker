"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { buildBucketByClient, type BucketClientRow } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: "Mano de Obra / Cal", color: "#6366f1" },
  { key: "cr", label: "C&R", color: "#10b981" },
  { key: "equipos", label: "Equipos", color: "#f59e0b" },
  { key: "operacion", label: "Operación", color: "#ef4444" },
] as const;

function BClientTooltip({ active, payload, label }: ChartTooltipProps<BucketClientRow>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function BucketByClientCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => buildBucketByClient(data ?? []).slice(0, 15), [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Macro-categoría × cliente {year} (top 15)</CardTitle>
      </CardHeader>
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
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<BClientTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
