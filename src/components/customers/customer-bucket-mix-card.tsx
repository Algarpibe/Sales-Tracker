"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerItemSales, fetchMacroCategorias } from "@/lib/data-client";
import { customerBuckets } from "@/lib/customer-detail";
import { BUCKET_COLORS, BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { formatPct, formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: BUCKET_COLORS.mano_obra },
  { key: "cr", label: BUCKET_LABELS.cr, color: BUCKET_COLORS.cr },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: BUCKET_COLORS.equipos },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: BUCKET_COLORS.operacion },
] as const;

type Slice = { name: string; value: number; color: string };

function BucketTooltip({ active, payload, total }: ChartTooltipProps<Slice> & { total: number }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  const v = p?.value ?? 0;
  return (
    <div className="bg-background/95 border border-white/10 p-3 rounded-lg shadow-xl text-sm">
      <div className="font-bold mb-1">{p?.name}</div>
      <div className="flex justify-between gap-4"><span>Importe</span><span className="font-mono">{formatUSD(v)}</span></div>
      <div className="flex justify-between gap-4"><span>% del total</span><span className="font-mono">{total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%</span></div>
    </div>
  );
}

export function CustomerBucketMixCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo: recordType, anio: year, customer }],
    queryFn: () => fetchCustomerItemSales({ tipo: recordType, anio: year, customer }),
  });
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => fetchMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const { slices, total } = useMemo(() => {
    const b = customerBuckets(data ?? [], customer, mapa);
    return {
      slices: SERIES.map((s) => ({ name: s.label, value: b[s.key], color: s.color })).filter((s) => s.value > 0),
      total: b.total,
    };
  }, [data, customer, mapa]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader><CardTitle className="text-base font-semibold">Mezcla por macro-categoría {year}</CardTitle></CardHeader>
      <CardContent>
        {isLoading || macro === undefined ? (
          <Skeleton className="h-[360px] w-full" />
        ) : slices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ChartFigure
            label={`Mezcla por macro-categoría ${year}`}
            summary={{
              data: slices,
              categoryLabel: "Macro-categoría",
              category: (s) => s.name,
              series: [
                { label: "Importe", value: (s) => s.value, format: formatUSD },
                { label: "% del total", value: (s) => (total > 0 ? (s.value / total) * 100 : 0), format: (v) => formatPct(v) },
              ],
            }}
          >
            <ResponsiveContainer width="100%" height={360}>
              <PieChart accessibilityLayer>
                <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                  {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip content={<BucketTooltip total={total} />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartFigure>
        )}
      </CardContent>
    </Card>
  );
}
