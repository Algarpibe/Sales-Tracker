"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerYearSeries, customerFirstYear, customerTotalVentas, customerMarginKpi } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FIRST_YEAR = 2021;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

export function CustomerKpiRow({ customer, recordType, year }: { customer: string; recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const thisYear = new Date().getFullYear();
  const salesQ = useQuery({
    queryKey: ["customer-sales", { tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }],
    queryFn: () => getCustomerSales({ tipo: recordType, desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
  });
  const marginQ = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });

  const kpis = useMemo(() => {
    const series = customerYearSeries(salesQ.data ?? [], customer);
    return {
      ventasAnio: series.find((s) => s.year === year)?.ventas ?? 0,
      total: customerTotalVentas(salesQ.data ?? [], customer),
      first: customerFirstYear(salesQ.data ?? [], customer),
      margenPct: customerMarginKpi(marginQ.data ?? [], customer).margenPct,
    };
  }, [salesQ.data, marginQ.data, customer, year]);

  if (salesQ.isLoading || marginQ.isLoading) return <Skeleton className="h-[92px] w-full" />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label={`Ventas ${year}`} value={formatUSD(kpis.ventasAnio)} />
      <Tile label={`Margen % ${year} (bienes)`} value={`${kpis.margenPct.toFixed(1)}%`} />
      <Tile label="Ventas histórico" value={formatUSD(kpis.total)} />
      <Tile label="Cliente desde" value={kpis.first ? String(kpis.first) : "—"} />
    </div>
  );
}
