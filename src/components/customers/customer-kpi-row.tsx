"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getMarginByCustomer } from "@/actions/margin-actions";
import { customerYearSeries, customerSinceYear, customerTotalVentas, customerMarginKpi } from "@/lib/customer-detail";
import { HISTORY_FIRST_YEAR, formatUSD } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// La ficha incluye el histórico previo al hub (HISTORY_FIRST_YEAR), igual que /clientes:
// pidiendo desde 2021, "Cliente desde" nunca podría mostrar un año anterior.

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
  // Se cargan los dos tipos siempre: "Cliente desde" mira facturas y órdenes a
  // la vez, así que no cambia al pulsar el conmutador. Misma forma de clave que
  // /clientes, para compartir la caché de react-query.
  const invoicesQ = useQuery({
    queryKey: ["customer-sales", { tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
  });
  const ordersQ = useQuery({
    queryKey: ["customer-sales", { tipo: "SALES_ORDER", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: "SALES_ORDER", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
  });
  const marginQ = useQuery({
    queryKey: ["margin-customer", { tipo: recordType, anio: year }],
    queryFn: () => getMarginByCustomer({ tipo: recordType, anio: year }),
  });

  const kpis = useMemo(() => {
    const invoices = invoicesQ.data ?? [];
    const orders = ordersQ.data ?? [];
    // El tipo elegido gobierna los importes; "Cliente desde" no.
    const current = recordType === "INVOICE" ? invoices : orders;
    const series = customerYearSeries(current, customer);
    return {
      ventasAnio: series.find((s) => s.year === year)?.ventas ?? 0,
      total: customerTotalVentas(current, customer),
      since: customerSinceYear(invoices, orders, customer),
      margenPct: customerMarginKpi(marginQ.data ?? [], customer).margenPct,
    };
  }, [invoicesQ.data, ordersQ.data, marginQ.data, customer, recordType, year]);

  if (invoicesQ.isLoading || ordersQ.isLoading || marginQ.isLoading) return <Skeleton className="h-[92px] w-full" />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label={`Ventas ${year}`} value={formatUSD(kpis.ventasAnio)} />
      <Tile label={`Margen % ${year} (bienes)`} value={`${kpis.margenPct.toFixed(1)}%`} />
      <Tile label="Ventas histórico" value={formatUSD(kpis.total)} />
      <Tile label="Cliente desde" value={kpis.since ? String(kpis.since) : "—"} />
    </div>
  );
}
