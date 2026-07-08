"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerMarginKpi } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

export function CustomerMarginCard({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });
  const m = useMemo(() => customerMarginKpi(data ?? [], customer), [data, customer]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Margen {year}</CardTitle>
        <p className="text-xs text-muted-foreground">Estimado, solo bienes con costo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : m.ventas === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin bienes con costo.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Ventas (bienes)" value={formatUSD(m.ventas)} />
            <Tile label="Costo" value={formatUSD(m.costo)} />
            <Tile label="Margen" value={formatUSD(m.margen)} />
            <Tile label="Margen %" value={`${m.margenPct.toFixed(1)}%`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
