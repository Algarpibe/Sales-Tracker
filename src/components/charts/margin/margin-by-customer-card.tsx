"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchMarginByCustomer } from "@/lib/data-client";
import { buildMarginCustomers } from "@/lib/analytics-margin";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { AmountModeToggle, type AmountMode } from "@/components/common/amount-mode-toggle";
import { CHART_HELP } from "@/lib/chart-help";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { MarginCustomerPoint } from "@/lib/analytics-margin";

function CustTooltip({ active, payload, label }: ChartTooltipProps<MarginCustomerPoint>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm max-w-[280px]">
      <div className="font-bold mb-1 break-words">{label}</div>
      <div className="flex justify-between gap-4"><span>Ventas</span><span className="font-mono">{formatUSD(p?.ventas ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Costo</span><span className="font-mono">{formatUSD(p?.costo ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen</span><span className="font-mono">{formatUSD(p?.margen ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span>Margen %</span><span className="font-mono">{(p?.margenPct ?? 0).toFixed(1)}%</span></div>
    </div>
  );
}

export function MarginByCustomerCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const [mode, setMode] = useState<AmountMode>("money");
  const { data, isLoading } = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => fetchMarginByCustomer({ tipo: recordType, anio: year }),
  });
  const top = useMemo(() => {
    const items = buildMarginCustomers(data ?? []);
    const sorted = mode === "pct"
      ? [...items].sort((a, b) => b.margenPct - a.margenPct || a.customer.localeCompare(b.customer))
      : items;
    return sorted.slice(0, 15);
  }, [data, mode]);
  const router = useRouter();
  const goCustomer = (d: { customer?: string; payload?: { customer?: string } }) => {
    const name = d?.payload?.customer ?? d?.customer;
    if (name) router.push(customerHref(name));
  };

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold"><span className="inline-flex items-center gap-1.5">Margen por cliente {year} (top 15)<InfoTooltip text={CHART_HELP.margenPorCliente} /></span></CardTitle>
          <p className="text-xs text-muted-foreground">{mode === "pct" ? "Margen % estimado; solo bienes con costo. Clic en un cliente para ver su detalle." : "Margen $ estimado; solo bienes con costo. Clic en un cliente para ver su detalle."}</p>
        </div>
        <AmountModeToggle value={mode} onChange={setMode} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={440} className="cursor-pointer">
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={mode === "pct" ? (v) => `${Math.round(v)}%` : formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<CustTooltip />} />
              <Bar dataKey={mode === "pct" ? "margenPct" : "margen"} name="Margen" fill="#10b981" radius={[0, 4, 4, 0]} onClick={(d) => goCustomer(d as { customer?: string; payload?: { customer?: string } })} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
