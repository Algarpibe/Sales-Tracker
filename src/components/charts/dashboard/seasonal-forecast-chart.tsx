"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSalesData } from "@/actions/sales-actions";
import { MONTHS, formatUSD, formatCompactUSD } from "@/lib/constants";
import { computeForecast, historyYears } from "@/lib/forecast";
import { monthlyTotals, historicalMatrix } from "@/lib/forecast-widget-data";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { CHART_HELP } from "@/lib/chart-help";
import type { SalesRecord } from "@/types/database";

/**
 * "Histórico con Proyección Estacional": barras con los importes reales del año
 * y línea con la proyección (estacionalidad ponderada por recencia + ritmo
 * interanual). Autónomo: carga el histórico completo de ventas por su cuenta.
 */
export function SeasonalForecastChart({
  recordType, year,
}: { recordType: "SALES_ORDER" | "INVOICE"; year: number }) {
  const { data, isLoading } = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });

  const forecastMonthlyData = useMemo(() => {
    const records = (data ?? []) as SalesRecord[];
    const real = monthlyTotals(records, year, recordType);
    const now = new Date();
    const forecast = computeForecast({
      currentYearMonthly: real,
      lastYearMonthly: monthlyTotals(records, year - 1, recordType),
      historicalMatrix: historicalMatrix(records, historyYears(year), recordType),
      weights: [3, 2, 1], // año-1 / año-2 / año-3
      now: {
        monthIdx: now.getMonth(),
        day: now.getDate(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      },
      isCurrentActualYear: year === now.getFullYear(),
    });
    return MONTHS.map((m, i) => ({
      month: m.label,
      [`Año ${year}`]: real[i],
      tendencia: Math.round(forecast.monthlyForecast[i] * 100) / 100,
    }));
  }, [data, year, recordType]);

  return (
    <Card className="flex h-full flex-col shadow-2xl border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
      <CardHeader className="relative z-10 p-6 border-b border-white/5 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-indigo-400" /> Histórico con Proyección Estacional ({recordType === "SALES_ORDER" ? "Órdenes" : "Facturas"})
            <InfoTooltip text={CHART_HELP.forecastEstacional} />
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Datos reales {year} + proyección: estacionalidad ponderada por recencia y ritmo interanual.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-sm bg-primary" />
            <span className="text-xs font-medium text-muted-foreground">Ventas Reales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 border-t border-dashed border-cyan-400" />
            <span className="text-xs font-medium text-muted-foreground">Proyección Estacional</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-6">
        {isLoading ? (
          <Skeleton className="h-full min-h-[400px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={400}>
            <ComposedChart data={forecastMonthlyData}>
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis
                tickFormatter={formatCompactUSD}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl space-y-2">
                        <p className="font-bold text-white mb-2">{label}</p>
                        {payload.map((entry, index: number) => (
                          <div key={index} className="flex items-center justify-between gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-white/60">{entry.name}</span>
                            </div>
                            <span className="font-mono font-bold text-white">
                              {formatUSD(Number(entry.value ?? 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                name="Ventas Reales"
                dataKey={`Año ${year}`}
                fill="oklch(0.65 0.2 255)"
                radius={[6, 6, 0, 0]}
                barSize={35}
              />
              <Line
                name="Proyección Estacional"
                type="monotone"
                dataKey="tendencia"
                stroke="#22d3ee"
                strokeWidth={3}
                strokeDasharray="8 5"
                dot={false}
                activeDot={{ r: 6, fill: "#22d3ee", strokeWidth: 0 }}
                filter="url(#glow)"
                animationDuration={2000}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
