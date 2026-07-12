"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCustomerMonthSales } from "@/actions/customer-month-actions";
import { buildMonthHeatmap } from "@/lib/analytics-comercial";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD, formatCompactUSD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function MonthHeatmapCard({ recordType, year }: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-month", { tipo: recordType, anio: year }],
    queryFn: () => getCustomerMonthSales({ tipo: recordType, anio: year }),
  });

  const { rows, max } = useMemo(() => {
    const top = buildMonthHeatmap(data ?? []).slice(0, 15);
    let m = 0;
    for (const r of top) for (const v of r.months) if (v > m) m = v;
    return { rows: top, max: m };
  }, [data]);

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader>
        <span className="inline-flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold">Heatmap cliente × mes {year} (top 15)</CardTitle>
          <InfoTooltip text={CHART_HELP.monthHeatmap} />
        </span>
        <p className="text-xs text-muted-foreground">Importe neto por mes; intensidad absoluta (misma escala para toda la tabla).</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[480px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground min-w-[160px]">Cliente</th>
                  {MESES.map((m) => (
                    <th key={m} className="text-center font-medium text-muted-foreground min-w-[52px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer}>
                    <td className="sticky left-0 z-10 bg-card truncate max-w-[160px] pr-2" title={r.customer}>
                      <Link href={customerHref(r.customer)} className="hover:text-primary hover:underline">{r.customer}</Link>
                    </td>
                    {r.months.map((v, i) => {
                      const alpha = max > 0 && v > 0 ? 0.08 + 0.92 * (v / max) : 0;
                      return (
                        <td
                          key={`${r.customer}-${i}`}
                          className="text-center rounded tabular-nums"
                          style={{ backgroundColor: alpha > 0 ? `rgba(16,185,129,${alpha})` : "transparent" }}
                          title={v > 0 ? `${r.customer} · ${MESES[i]} ${year}: ${formatUSD(v)}` : ""}
                        >
                          {v > 0 ? formatCompactUSD(v) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
