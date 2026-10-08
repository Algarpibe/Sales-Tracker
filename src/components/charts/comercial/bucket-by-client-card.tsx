"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getMacroCategorias } from "@/actions/category-actions";
import { buildBucketByClient, type BucketClientRow } from "@/lib/analytics-comercial";
import { BUCKET_COLORS, BUCKET_LABELS, MACRO_CATEGORIAS_KEY, mapaMacroCategorias } from "@/lib/customer-item";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartTooltipProps } from "@/lib/chart-types";

const SERIES = [
  { key: "mano_obra", label: BUCKET_LABELS.mano_obra, color: BUCKET_COLORS.mano_obra },
  { key: "cr", label: BUCKET_LABELS.cr, color: BUCKET_COLORS.cr },
  { key: "equipos", label: BUCKET_LABELS.equipos, color: BUCKET_COLORS.equipos },
  { key: "operacion", label: BUCKET_LABELS.operacion, color: BUCKET_COLORS.operacion },
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
  // Clasificación guardada en Configuración. Hasta que llega se ve el esqueleto, nunca
  // un reparto con el mapa vacío (todo en Equipos). Si la consulta falla, el esqueleto
  // se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const top = useMemo(() => buildBucketByClient(data ?? [], mapa).slice(0, 15), [data, mapa]);
  const router = useRouter();
  const goCustomer = (d: { customer?: string; payload?: { customer?: string } }) => {
    const name = d?.payload?.customer ?? d?.customer;
    if (name) router.push(customerHref(name));
  };

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Macro-categoría × cliente {year} (top 15)</CardTitle>
          <InfoTooltip text={CHART_HELP.bucketByClient} />
        </span>
        <p className="text-xs text-muted-foreground">Clic en un cliente para ver su detalle.</p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {isLoading || macro === undefined ? (
          <Skeleton className="h-full min-h-[440px] w-full" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={440} className="cursor-pointer">
            <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-white/5" horizontal={false} />
              <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={formatCompactUSD} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="customer" width={160} className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip content={<BClientTooltip />} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} onClick={(d) => goCustomer(d as { customer?: string; payload?: { customer?: string } })} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
