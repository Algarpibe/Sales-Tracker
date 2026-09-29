"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryMonthSales } from "@/actions/category-month-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { buildBucketSeason } from "@/lib/analytics-comercial";
import { BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: "#6366f1" },
  { key: "cr", label: BUCKET_LABELS.cr, color: "#10b981" },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: "#f59e0b" },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: "#ef4444" },
] as const;

type SeasonPoint = { mesLabel: string; mano_obra: number; cr: number; equipos: number; operacion: number };

function SeasonTooltip({ active, payload, label }: ChartTooltipProps<SeasonPoint>) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((e) => (
        <div key={String(e.name)} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="font-mono">{formatUSD(e.value ?? 0)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-white/10 mt-1 pt-1 font-semibold">
        <span>Total</span>
        <span className="font-mono">{formatUSD(total)}</span>
      </div>
    </div>
  );
}

export function SeasonByBucketCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["category-month", { tipo: recordType, anio: year }],
    queryFn: () => getCategoryMonthSales({ tipo: recordType, anio: year }),
  });
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const rows = useMemo(
    () => buildBucketSeason(data ?? [], mapa).map((r) => ({
      mesLabel: MESES[r.mes - 1], mano_obra: r.mano_obra, cr: r.cr, equipos: r.equipos, operacion: r.operacion,
    })),
    [data, mapa]
  );
  const hasData = useMemo(() => rows.some((r) => r.mano_obra || r.cr || r.equipos || r.operacion), [rows]);

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Estacionalidad por categoría {year}</CardTitle>
          <InfoTooltip text={CHART_HELP.estacionalidadCategoria} />
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading || macro === undefined ? (
          <Skeleton className="h-full min-h-[380px] w-full" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={380}>
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" vertical={false} />
              <XAxis dataKey="mesLabel" className="text-[10px] fill-muted-foreground" tickLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <Tooltip content={<SeasonTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
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
