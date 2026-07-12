"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bucketMix, type InsightRecord } from "@/lib/dashboard-insights";
import { formatUSD } from "@/lib/constants";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import type { ChartTooltipProps } from "@/lib/chart-types";

const COLORS: Record<string, string> = {
  mano_obra: "#6366f1", cr: "#10b981", equipos: "#f59e0b", operacion: "#ef4444",
};

type MixSlice = { bucket: string; label: string; amount: number; pct: number };

function MixTooltip({ active, payload }: ChartTooltipProps<MixSlice>) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold">{p.label}</div>
      <div className="font-mono">{formatUSD(p.amount)} · {Math.round(p.pct)}%</div>
    </div>
  );
}

export function CategoryMixDonut({
  records, catMap,
}: {
  records: InsightRecord[];
  catMap: Map<string, string>;
}) {
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const mix = useMemo(
    () => bucketMix(records, catMap, tipo).filter((m) => m.amount > 0),
    [records, catMap, tipo]
  );

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            Mix por macro-categoría
            <InfoTooltip text={CHART_HELP.mixCategoria} />
          </span>
        </CardTitle>
        <RecordTypeSelect value={tipo} onValueChange={setTipo} className="w-[190px]" />
      </CardHeader>
      <CardContent>
        {mix.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={mix} dataKey="amount" nameKey="label" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {mix.map((m) => <Cell key={m.bucket} fill={COLORS[m.bucket]} />)}
              </Pie>
              <Tooltip content={<MixTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
