"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalesData } from "@/actions/sales-actions";
import { computeForecast } from "@/lib/forecast";
import { monthlyTotals, historicalMatrix } from "@/lib/forecast-widget-data";
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
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });

  const forecast = useMemo(() => {
    const records = (data ?? []) as SalesRecord[];
    const now = new Date();
    return computeForecast({
      currentYearMonthly: monthlyTotals(records, year, recordType),
      lastYearMonthly: monthlyTotals(records, year - 1, recordType),
      historicalMatrix: historicalMatrix(records, [2025, 2024, 2023], recordType),
      weights: [3, 2, 1],
      now: {
        monthIdx: now.getMonth(),
        day: now.getDate(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      },
      isCurrentActualYear: year === now.getFullYear(),
    });
  }, [data, year, recordType]);

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
