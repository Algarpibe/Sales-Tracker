"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getMacroCategorias } from "@/actions/category-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bucketMix, nombresPorId, type InsightRecord } from "@/lib/dashboard-insights";
import { BUCKET_COLORS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD } from "@/lib/constants";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import type { ChartTooltipProps } from "@/lib/chart-types";

// MixSlice lleva la macro-categoría como string: por eso se indexa por string y no por Bucket.
const COLORS: Record<string, string> = BUCKET_COLORS;

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
  // La clasificación se carga aquí y no en el proveedor del dashboard: así solo la
  // espera este widget, y el resto del dashboard no se retrasa. Hasta que llega se ve el
  // esqueleto, nunca un reparto con el mapa vacío (todo en Equipos).
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  // Los nombres salen también de las categorías inactivas: catMap solo trae las activas.
  const nombres = useMemo(() => nombresPorId(macro ?? [], catMap), [macro, catMap]);
  const mix = useMemo(
    () => bucketMix(records, nombres, mapa, tipo).filter((m) => m.amount > 0),
    [records, nombres, mapa, tipo]
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      {/* flex-wrap: si el título no deja 260px al conmutador OV/FAC, este baja de
          línea en lugar de acortarse a "OV/FAC". */}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">
          <span className="inline-flex items-center gap-1.5">
            Mix por macro-categoría
            <InfoTooltip text={CHART_HELP.mixCategoria} />
          </span>
        </CardTitle>
        <RecordTypeToggle value={tipo} onValueChange={setTipo} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {macro === undefined ? (
          <Skeleton className="h-full min-h-[340px] w-full" />
        ) : mix.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos en el año.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={340}>
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
