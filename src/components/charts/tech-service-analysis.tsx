"use client";

import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/constants";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

export interface TechServiceQuarterData {
  quarter: string; // T1, T2, T3, T4
  st: number;
  cr: number;
  total: number;
  acum: number;
  st_prev: number;
  cr_prev: number;
  total_prev: number;
  acum_prev: number;
}

interface TechServiceAnalysisProps {
  data: TechServiceQuarterData[];
  yearA?: number;
  yearB?: number;
}

// Utilidad para calcular el YoY Growth percentage
function getYoY(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null;
  return ((current - prev) / prev) * 100;
}

// Función para formatear el %
function formatYoY(value: number | null): React.ReactNode {
  if (value === null) return <span className="text-muted-foreground">--</span>;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  return (
    <span
      className={cn(
        "font-medium",
        isPositive && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]",
        isNegative && "text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.4)]",
        isZero && "text-muted-foreground"
      )}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export function TechServiceAnalysis({ data, yearA, yearB }: TechServiceAnalysisProps) {
  // Custom Tooltip para el Gráfico
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const qData = data.find(d => d.quarter === label);
      if (!qData) return null;

      const yoyAcum = getYoY(qData.acum, qData.acum_prev);

      return (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4 shadow-xl backdrop-blur-md">
          <p className="mb-2 font-semibold text-foreground border-b border-white/10 pb-2">{label} {yearA ? `(${yearA})` : ''}</p>
          <div className="space-y-1 text-sm">
            <p className="flex justify-between gap-6">
              <span className="text-indigo-400">Servicio Técnico (ST):</span>
              <span className="font-mono font-medium">{formatUSD(qData.st)}</span>
            </p>
            <p className="flex justify-between gap-6">
              <span className="text-violet-400">Consumibles (C&R):</span>
              <span className="font-mono font-medium">{formatUSD(qData.cr)}</span>
            </p>
            <div className="my-1 h-px w-full bg-white/10" />
            <p className="flex justify-between gap-6 font-semibold">
              <span className="text-emerald-400">Acumulado Anual:</span>
              <span className="font-mono">{formatUSD(qData.acum)}</span>
            </p>
            <p className="flex justify-between gap-6 pt-1 text-xs">
              <span className="text-muted-foreground">Crecimiento YoY (Acum):</span>
              <span className="font-mono">{formatYoY(yoyAcum)}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calcular totales anuales para la última columna de la tabla
  const totals = data.reduce(
    (acc, curr) => ({
      st: acc.st + curr.st,
      cr: acc.cr + curr.cr,
      total: acc.total + curr.total,
      st_prev: acc.st_prev + curr.st_prev,
      cr_prev: acc.cr_prev + curr.cr_prev,
      total_prev: acc.total_prev + curr.total_prev,
    }),
    { st: 0, cr: 0, total: 0, st_prev: 0, cr_prev: 0, total_prev: 0 }
  );

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/40 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] dark:bg-black/40 dark:border-white/10">
      {/* Header */}
      <div className="border-b border-black/5 dark:border-white/5 p-8 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Análisis Financiero
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">
              Business Intelligence • ST & Consumibles
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full bg-indigo-500/5">
              Comparative Analysis {yearA} vs {yearB}
            </span>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-12">
        {/* PARTE 1: Visual Analytics (Gráfico) */}
        <div className="h-[380px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(0,0,0,0.05)" className="dark:stroke-white/5" />
              <XAxis 
                dataKey="quarter" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 13, fontWeight: 600 }} 
                dy={15}
              />
              <YAxis 
                yAxisId="left"
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 11 }}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "oklch(0.65 0.19 155)", fontSize: 11 }}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)', radius: 10 }} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '30px', fontSize: '13px', fontWeight: 500 }} />
              
              <Bar 
                yAxisId="left" 
                dataKey="st" 
                name="Servicio Técnico" 
                stackId="a" 
                fill="oklch(0.55 0.18 255)" 
                radius={[2, 2, 0, 0]} 
                barSize={45}
              />
              <Bar 
                yAxisId="left" 
                dataKey="cr" 
                name="Consumibles" 
                stackId="a" 
                fill="oklch(0.6 0.2 300)" 
                radius={[6, 6, 2, 2]} 
                barSize={45}
              />
              
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="acum" 
                name="Tendencia Acumulada" 
                stroke="oklch(0.65 0.19 155)" 
                strokeWidth={4}
                dot={{ r: 6, fill: "oklch(0.65 0.19 155)", strokeWidth: 3, stroke: "white" }}
                activeDot={{ r: 8, fill: "white", stroke: "oklch(0.65 0.19 155)", strokeWidth: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* PARTE 2: Financial Matrix (Tabla) */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/30 dark:bg-black/10 dark:border-white/5 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-black/5 dark:border-white/10 uppercase tracking-tighter text-[11px] font-bold text-slate-500">
                <th className="px-8 py-5 border-r border-black/5 dark:border-white/5">Estructura de Ingresos</th>
                {data.map((q) => (
                  <th key={q.quarter} className="px-6 py-5 text-right font-black">{q.quarter}</th>
                ))}
                <th className="px-8 py-5 text-right bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 font-black">YTD Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 font-sans">
              {/* Bloque ST */}
              <tr className="group hover:bg-white/40 transition-colors">
                <td className="px-8 py-5 font-bold text-slate-700 dark:text-slate-200 border-r border-black/5 dark:border-white/5">
                  Servicio Técnico (Mano de Obra)
                </td>
                {data.map((q) => (
                  <td key={`st-${q.quarter}`} className="px-6 py-5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatUSD(q.st)}
                  </td>
                ))}
                <td className="px-8 py-5 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                  {formatUSD(totals.st)}
                </td>
              </tr>
              <tr className="text-[11px] bg-slate-50/20">
                <td className="px-8 py-2 text-slate-400 border-r border-black/5 dark:border-white/5 pl-12 font-medium">
                  Crecimiento YoY
                </td>
                {data.map((q) => (
                  <td key={`yoy-st-${q.quarter}`} className="px-6 py-2 text-right font-mono tabular-nums">
                    {formatYoY(getYoY(q.st, q.st_prev))}
                  </td>
                ))}
                <td className="px-8 py-2 text-right font-mono tabular-nums bg-indigo-500/5">
                  {formatYoY(getYoY(totals.st, totals.st_prev))}
                </td>
              </tr>

              {/* Bloque C&R */}
              <tr className="group hover:bg-white/40 transition-colors border-t border-black/5 dark:border-white/5">
                <td className="px-8 py-5 font-bold text-slate-700 dark:text-slate-200 border-r border-black/5 dark:border-white/5">
                  Consumibles y Repuestos
                </td>
                {data.map((q) => (
                  <td key={`cr-${q.quarter}`} className="px-6 py-5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatUSD(q.cr)}
                  </td>
                ))}
                <td className="px-8 py-5 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                  {formatUSD(totals.cr)}
                </td>
              </tr>
              <tr className="text-[11px] bg-slate-50/20">
                <td className="px-8 py-2 text-slate-400 border-r border-black/5 dark:border-white/5 pl-12 font-medium">
                  Crecimiento YoY
                </td>
                {data.map((q) => (
                  <td key={`yoy-cr-${q.quarter}`} className="px-6 py-2 text-right font-mono tabular-nums">
                    {formatYoY(getYoY(q.cr, q.cr_prev))}
                  </td>
                ))}
                <td className="px-8 py-2 text-right font-mono tabular-nums bg-indigo-500/5">
                  {formatYoY(getYoY(totals.cr, totals.cr_prev))}
                </td>
              </tr>

              {/* Totales Brutos */}
              <tr className="bg-slate-900/[0.03] dark:bg-white/[0.05] border-t-2 border-black/10 dark:border-white/10">
                <td className="px-8 py-6 font-black text-slate-900 dark:text-white border-r border-black/5 dark:border-white/5">
                  TOTAL SERVICIO TÉCNICO
                </td>
                {data.map((q) => (
                  <td key={`total-${q.quarter}`} className="px-6 py-6 text-right font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatUSD(q.total)}
                  </td>
                ))}
                <td className="px-8 py-6 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                  {formatUSD(totals.total)}
                </td>
              </tr>
              
              {/* Fila Acumulado YTD */}
              <tr className="bg-emerald-500/[0.02] dark:bg-emerald-500/[0.05] border-t border-emerald-500/20">
                <td className="px-8 py-6 font-black text-emerald-700 dark:text-emerald-400 border-r border-black/5 dark:border-white/5 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  ACUMULADO ANUAL (YTD)
                </td>
                {data.map((q) => (
                  <td key={`acum-${q.quarter}`} className="px-6 py-6 text-right font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatUSD(q.acum)}
                  </td>
                ))}
                <td className="px-8 py-6 text-right font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                  {formatUSD(totals.total)}
                </td>
              </tr>

              {/* Crecimiento Acumulado */}
              <tr className="text-xs bg-emerald-500/[0.05] border-t border-emerald-500/10">
                <td className="px-8 py-3 text-emerald-600/70 dark:text-emerald-400/60 border-r border-black/5 dark:border-white/5 pl-12 font-bold italic">
                  VAR. ACUMULADA VS AÑO ANTERIOR
                </td>
                {data.map((q) => (
                  <td key={`yoy-acum-${q.quarter}`} className="px-6 py-3 text-right font-black tabular-nums">
                    {formatYoY(getYoY(q.acum, q.acum_prev))}
                  </td>
                ))}
                <td className="px-8 py-3 text-right font-black font-mono tabular-nums border-l border-emerald-500/10">
                  {formatYoY(getYoY(totals.total, totals.total_prev))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
