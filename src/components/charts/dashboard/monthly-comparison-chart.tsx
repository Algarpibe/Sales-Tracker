"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { MONTHS, formatUSD, formatCompactUSD } from "@/lib/constants";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { CHART_HELP } from "@/lib/chart-help";
import { monthlyTotals } from "@/lib/forecast-widget-data";
import type { ChartTooltipProps } from "@/lib/chart-types";
import type { SalesRecord } from "@/types/database";

// Punto de la serie mensual: month + claves dinámicas `Año X` + acumulados.
type MonthlyPoint = {
  month: string;
  acumA: number;
  acumB: number;
  [key: string]: string | number;
};

// Acumulado corriente. Helper de módulo y sin acumulador mutable: el React
// Compiler marca como error reasignar variables dentro del render (react-hooks/immutability).
const cumulative = (arr: number[]): number[] =>
  arr.map((_, i) => arr.slice(0, i + 1).reduce((s, v) => s + v, 0));

// Componente de módulo (no creado en render) para que recharts lo clone con
// active/payload/label; los años llegan como props explícitas.
function CustomMonthlyTooltip({
  active, payload, label, yearA, yearB,
}: ChartTooltipProps<MonthlyPoint> & { yearA: number; yearB: number }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-xl space-y-3">
        <p className="text-sm font-bold text-zinc-950 border-b border-zinc-100 pb-2">{label}</p>
        <div className="space-y-2">
          {/* Valores Mensuales */}
          <div className="flex items-center justify-between gap-8">
            <span className="text-xs font-semibold text-primary">Año {yearA}:</span>
            <span className="text-xs font-bold text-zinc-900">{formatUSD(Number(data?.[`Año ${yearA}`] ?? 0))}</span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <span className="text-xs font-semibold text-rose-500">Año {yearB}:</span>
            <span className="text-xs font-bold text-zinc-900">{formatUSD(Number(data?.[`Año ${yearB}`] ?? 0))}</span>
          </div>
          {/* Valores Acumulados */}
          <div className="pt-2 mt-2 border-t border-zinc-100 space-y-2">
            <div className="flex items-center justify-between gap-8">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Acumulado {yearA}:</span>
              <span className="text-xs font-bold text-primary">{formatUSD(data?.acumA ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Acumulado {yearB}:</span>
              <span className="text-xs font-bold text-rose-500">{formatUSD(data?.acumB ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * "Global Mensual": importe por mes del año A frente al año B, para el tipo de
 * registro elegido. `records`/`prevRecords` pueden traer varios años: la serie
 * se filtra por año dentro (monthlyTotals).
 */
export function MonthlyComparisonChart({
  recordType, yearA, yearB, records, prevRecords,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
}) {
  // Acumulado desactivado por defecto: es una capa opcional sobre las barras.
  const [showCumulative, setShowCumulative] = useState(false);

  const monthlyData = useMemo<MonthlyPoint[]>(() => {
    const a = monthlyTotals(records, yearA, recordType);
    const b = monthlyTotals(prevRecords, yearB, recordType);
    const acumA = cumulative(a);
    const acumB = cumulative(b);
    return MONTHS.map((m, i) => ({
      month: m.label,
      [`Año ${yearA}`]: a[i],
      [`Año ${yearB}`]: b[i],
      acumA: acumA[i],
      acumB: acumB[i],
    }));
  }, [records, prevRecords, yearA, yearB, recordType]);

  return (
    <Card className="flex h-full flex-col shadow-2xl border-white/5 bg-white/5 backdrop-blur-xl dark:bg-black/20 overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent pointer-events-none" />
      <CardHeader className="relative z-10 flex flex-row items-center justify-between gap-4 space-y-0 border-b border-white/5 py-4">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <div className="w-1 h-4 bg-indigo-500 rounded-full" />
          {recordType === "SALES_ORDER" ? "Órdenes de Venta (Reserva)" : "Facturación (Ventas)"}
          <span className="text-muted-foreground font-normal text-sm ml-2">Global Mensual</span>
          <InfoTooltip text={CHART_HELP.explorationGlobalMensual} />
        </CardTitle>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox checked={showCumulative} onCheckedChange={() => setShowCumulative((v) => !v)} />
          Línea de acumulado
        </label>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ChartFigure
          label={`${recordType === "SALES_ORDER" ? "Órdenes de Venta (Reserva)" : "Facturación (Ventas)"} · Global Mensual`}
          summary={{
            data: monthlyData,
            categoryLabel: "Mes",
            category: (p) => p.month,
            series: [
              { label: `Año ${yearA}`, value: (p) => Number(p[`Año ${yearA}`] ?? 0), format: formatUSD },
              { label: `Año ${yearB}`, value: (p) => Number(p[`Año ${yearB}`] ?? 0), format: formatUSD },
              // Las columnas de acumulado solo si sus líneas están a la vista.
              ...(showCumulative
                ? [
                    { label: `Acum. ${yearA}`, value: (p: MonthlyPoint) => p.acumA, format: formatUSD },
                    { label: `Acum. ${yearB}`, value: (p: MonthlyPoint) => p.acumB, format: formatUSD },
                  ]
                : []),
            ],
          }}
        >
          <ResponsiveContainer width="100%" height="100%" minHeight={350}>
            <ComposedChart accessibilityLayer data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.91 0.01 250 / 0.1)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} dy={10} />
              <YAxis yAxisId="left" tickFormatter={formatCompactUSD} axisLine={false} tickLine={false} />
              {/* Eje propio: el acumulado es de otra magnitud que el importe mensual. */}
              {showCumulative && (
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatCompactUSD} axisLine={false} tickLine={false} />
              )}
              <RechartsTooltip
                content={<CustomMonthlyTooltip yearA={yearA} yearB={yearB} />}
                cursor={{ fill: "rgba(147, 197, 253, 0.15)" }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar
                yAxisId="left"
                dataKey={`Año ${yearA}`}
                fill="oklch(0.65 0.2 255)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey={`Año ${yearB}`}
                fill="oklch(0.65 0.25 20)"
                radius={[4, 4, 0, 0]}
              />
              {/* Acumulado: continua el año A, discontinua el de comparación. */}
              {showCumulative && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="acumA"
                  name={`Acum. ${yearA}`}
                  stroke="oklch(0.65 0.2 255)"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              )}
              {showCumulative && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="acumB"
                  name={`Acum. ${yearB}`}
                  stroke="oklch(0.65 0.25 20)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 3 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFigure>
      </CardContent>
    </Card>
  );
}
