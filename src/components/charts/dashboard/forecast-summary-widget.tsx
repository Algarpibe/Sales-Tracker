"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSalesData } from "@/lib/data-client";
import { forecastClock, forecastRecords } from "@/lib/forecast-breakdown";
import { PredictiveRunRateCard } from "@/components/charts/premium/predictive-run-rate";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_HELP } from "@/lib/chart-help";
import type { SalesRecord } from "@/types/database";

/**
 * Proyección de cierre como widget autónomo. Una sola pieza sirve para la
 * tarjeta del mes en curso (`scope="month"`) y la del año (`scope="year"`).
 */
export function ForecastSummaryWidget({
  recordType, year, scope,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
  scope: "month" | "year";
}) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => fetchSalesData({}) });
  // Reloj del forecast, fijado al montar (el dashboard solo pinta widgets en cliente).
  const [now] = useState(() => new Date());

  const forecast = useMemo(() => {
    const records = (data ?? []) as SalesRecord[];
    return forecastRecords(records, year, recordType, forecastClock(now));
  }, [data, year, recordType, now]);

  if (isLoading) return <Skeleton className="h-full min-h-[200px] w-full" />;

  const s = scope === "month" ? forecast.month : forecast.year;
  return (
    <PredictiveRunRateCard
      title={scope === "month" ? "Proyección de Cierre (Mes Actual)" : `Proyección de Cierre Año ${year}`}
      currentLabel={scope === "month" ? "Ventas Actuales" : "Ventas Acum. (YTD)"}
      targetLabel={scope === "month" ? "Mismo mes año anterior" : `Total Año ${year - 1}`}
      currentTotal={s.actual}
      lastYearMonthTotal={s.reference}
      projectedTotal={s.value}
      low={s.low}
      high={s.high}
      deltaPct={s.deltaPct}
      deltaLabel={scope === "month" ? "mismo mes año anterior" : "mismo periodo año anterior"}
      info={scope === "month" ? CHART_HELP.forecastMes : CHART_HELP.forecastAnio}
    />
  );
}
