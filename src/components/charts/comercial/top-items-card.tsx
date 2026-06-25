"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { topItems } from "@/lib/analytics-comercial";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { ItemSalesRow } from "@/types/database";

function ItemsTooltip({ active, payload, metric }: ChartTooltipProps<ItemSalesRow> & { metric: "importe" | "cantidad" }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[300px]">
      <div className="font-bold mb-1 break-words">{p?.nombre}</div>
      <div className="text-xs text-muted-foreground mb-1">{p?.sku ?? "—"}</div>
      <div className="flex justify-between gap-4">
        <span>{metric === "importe" ? "Importe" : "Cantidad"}</span>
        <span className="font-mono">{metric === "importe" ? formatUSD(p?.importe ?? 0) : (p?.cantidad ?? 0)}</span>
      </div>
    </div>
  );
}

export function TopItemsCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const [metric, setMetric] = useState<"importe" | "cantidad">("importe");
  const { data, isLoading } = useQuery({
    queryKey: ["top-items", { recordType, year }],
    queryFn: () => getItemSales({ tipo: recordType, desde: `${year}-01-01`, hasta: `${year}-12-31` }),
  });
  const top = useMemo(() => topItems(data ?? [], metric, 15), [data, metric]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Top 15 artículos {year}</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={metric === "importe" ? "default" : "outline"} onClick={() => setMetric("importe")}>$</Button>
          <Button size="sm" variant={metric === "cantidad" ? "default" : "outline"} onClick={() => setMetric("cantidad")}>Uds</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[420px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => (metric === "importe" ? formatCompactUSD(v) : String(v))} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="nombre" width={180} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<ItemsTooltip metric={metric} />} />
              <Bar dataKey={metric} fill="oklch(0.7 0.18 190)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
