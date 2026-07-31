"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { buildBrandMix, type BrandMixRow } from "@/lib/analytics-comercial";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];
const OTROS_COLOR = "#94a3b8";

function BrandTooltip({ active, payload, total }: ChartTooltipProps<BrandMixRow> & { total: number }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  const v = p?.importe ?? 0;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{p?.marca}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(v)}</span></div>
      <div className="flex justify-between gap-4"><span>% del total</span><span className="font-mono">{total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</span></div>
    </div>
  );
}

export function BrandMixCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerItemSales({ tipo: recordType, anio: year }),
  });
  const { slices, total } = useMemo(() => {
    const all = buildBrandMix(data ?? []);
    const top = all.slice(0, 8);
    const restSum = all.slice(8).reduce((s, r) => s + r.importe, 0);
    return {
      slices: restSum > 0 ? [...top, { marca: "Otros", importe: restSum }] : top,
      total: all.reduce((s, r) => s + r.importe, 0),
    };
  }, [data]);

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Mix por marca {year}</CardTitle>
          <InfoTooltip text={CHART_HELP.brandMix} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[440px] w-full" />
        ) : slices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={440}>
            <PieChart>
              <Pie data={slices} dataKey="importe" nameKey="marca" cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={2}>
                {slices.map((s, i) => (
                  <Cell key={s.marca} fill={s.marca === "Otros" ? OTROS_COLOR : PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<BrandTooltip total={total} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
