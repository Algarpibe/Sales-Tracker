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

export interface TechServiceDataPoint {
  label: string; // T1, Ene, 2024, etc.
  st: number;
  cr: number;
  total: number;
  acum: number;
  st_prev: number;
  cr_prev: number;
  total_prev: number;
  acum_prev: number;
}

export type TechServiceViewMode = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

interface TechServiceAnalysisProps {
  data: TechServiceDataPoint[];
  yearA?: number;
  yearB?: number;
  viewMode: TechServiceViewMode;
  onViewModeChange: (mode: TechServiceViewMode) => void;
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

export function TechServiceAnalysis({ data, yearA, yearB, viewMode, onViewModeChange }: TechServiceAnalysisProps) {
  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const qData = data.find(d => d.label === label);
      if (!qData) return null;

      const yoyAcum = getYoY(qData.acum, qData.acum_prev);

      return (
        <div className="rounded-xl border border-black/10 bg-white/80 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 min-w-[280px]">
          <p className="mb-2 font-bold text-slate-800 border-b border-black/5 pb-2 text-base">{label} - Comparativa</p>
          
          <div className="space-y-4">
            {/* Año Principal */}
            <div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{yearA}</p>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between gap-6">
                  <span className="text-slate-500 font-medium">Servicio Técnico (ST):</span>
                  <span className="font-mono font-bold text-slate-700">{formatUSD(qData.st)}</span>
                </p>
                <p className="flex justify-between gap-6">
                  <span className="text-slate-500 font-medium">Consumibles (C&R):</span>
                  <span className="font-mono font-bold text-slate-700">{formatUSD(qData.cr)}</span>
                </p>
              </div>
            </div>

            {/* Año Previo */}
            <div className="pt-2 border-t border-black/5">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">{yearB}</p>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between gap-6">
                  <span className="text-orange-600/70 font-medium">Servicio Técnico (ST):</span>
                  <span className="font-mono font-bold text-orange-700">{formatUSD(qData.st_prev)}</span>
                </p>
                <p className="flex justify-between gap-6">
                  <span className="text-amber-600/70 font-medium">Consumibles (C&R):</span>
                  <span className="font-mono font-bold text-amber-600">{formatUSD(qData.cr_prev)}</span>
                </p>
              </div>
            </div>

            {/* Métricas Acumuladas */}
            <div className="pt-3 border-t border-black/5">
              <p className="flex justify-between gap-6 font-bold text-sm">
                <span className="text-emerald-600">Acumulado {yearA}:</span>
                <span className="font-mono text-emerald-500">{formatUSD(qData.acum)}</span>
              </p>
              <p className="flex justify-between gap-6 font-bold text-sm pt-1">
                <span className="text-orange-600">Acumulado {yearB}:</span>
                <span className="font-mono text-orange-500">{formatUSD(qData.acum_prev)}</span>
              </p>
              <p className="flex justify-between gap-6 pt-1 text-xs">
                <span className="text-slate-500 font-medium">Variación (Acum):</span>
                <span className="font-mono font-bold">{formatYoY(yoyAcum)}</span>
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

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
      <div className="border-b border-black/5 dark:border-white/5 p-8 bg-black/5 dark:bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Análisis Financiero
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Business Intelligence • ST & Consumibles
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* RESOLUTION FILTER */}
            <div className="bg-black/10 dark:bg-white/10 p-1 rounded-xl flex gap-1">
              {[
                { id: 'MONTHLY', label: 'Mensual' },
                { id: 'QUARTERLY', label: 'Trimestral' },
                { id: 'ANNUAL', label: 'Anual' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => onViewModeChange(m.id as TechServiceViewMode)}
                  className={cn(
                    "px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all",
                    viewMode === m.id 
                      ? "bg-white dark:bg-black/50 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="hidden sm:block text-right">
              <span className="text-base font-bold text-indigo-500 dark:text-indigo-400 px-3 py-1 bg-indigo-500/10 rounded-lg">
                {yearA} vs {yearB}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-12">
        {/* PARTE 1: Visual Analytics (Gráfico) */}
        <div className="h-[380px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(0,0,0,0.05)" className="dark:stroke-white/5" />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 12, fontWeight: 700 }} 
                dy={10}
                interval={viewMode === 'MONTHLY' ? 0 : "preserveStart"}
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
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ fill: "rgba(147, 197, 253, 0.15)", radius: 10 }} 
              />
              <Legend verticalAlign="top" height={60} iconType="circle" wrapperStyle={{ paddingBottom: '30px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }} />
              
              {/* Año A */}
              <Bar 
                yAxisId="left" 
                dataKey="st" 
                name={`ST (${yearA})`} 
                stackId="yearA" 
                fill="oklch(0.55 0.18 255)" 
                radius={[0, 0, 0, 0]} 
                barSize={viewMode === 'MONTHLY' ? 14 : 32}
              />
              <Bar 
                yAxisId="left" 
                dataKey="cr" 
                name={`C&R (${yearA})`} 
                stackId="yearA" 
                fill="oklch(0.6 0.2 300)" 
                radius={[4, 4, 0, 0]} 
                barSize={viewMode === 'MONTHLY' ? 14 : 32}
              />

              {/* Año B (Previo) - NARANJA / DORADO */}
              <Bar 
                yAxisId="left" 
                dataKey="st_prev" 
                name={`ST (${yearB})`} 
                stackId="yearB" 
                fill="oklch(0.7 0.15 60)" 
                radius={[0, 0, 0, 0]} 
                barSize={viewMode === 'MONTHLY' ? 14 : 32}
              />
              <Bar 
                yAxisId="left" 
                dataKey="cr_prev" 
                name={`C&R (${yearB})`} 
                stackId="yearB" 
                fill="oklch(0.75 0.15 85)" 
                radius={[4, 4, 0, 0]} 
                barSize={viewMode === 'MONTHLY' ? 14 : 32}
              />
              
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="acum" 
                name={`Acum. (${yearA})`} 
                stroke="oklch(0.65 0.19 155)" 
                strokeWidth={4}
                dot={{ r: 5, fill: "oklch(0.65 0.19 155)", strokeWidth: 2, stroke: "white" }}
                activeDot={{ r: 7, fill: "white", stroke: "oklch(0.65 0.19 155)", strokeWidth: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* PARTE 2: Financial Matrix (Tabla) */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/30 dark:bg-black/10 dark:border-white/5 shadow-sm">
          <table className="w-full text-left text-base border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-black/5 dark:border-white/10 uppercase tracking-tight text-[13px] font-bold text-slate-500">
                <th className="px-8 py-6 border-r border-black/5 dark:border-white/5">Estructura de Ingresos</th>
                {data.map((q) => (
                  <th key={q.label} className="px-4 py-6 text-right font-black">{q.label}</th>
                ))}
                <th className="px-8 py-6 text-right bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 font-black">YTD Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 font-sans leading-relaxed">
              {/* Bloque ST */}
              <tr className="group hover:bg-white/40 transition-colors">
                <td className="px-8 py-6 font-bold text-slate-700 dark:text-slate-200 border-r border-black/5 dark:border-white/5">
                  Servicio Técnico (Mano de Obra)
                </td>
                {data.map((q) => (
                  <td key={`st-${q.label}`} className="px-4 py-6 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatUSD(q.st)}
                  </td>
                ))}
                <td className="px-8 py-6 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                  {formatUSD(totals.st)}
                </td>
              </tr>
              <tr className="text-[12.5px] bg-slate-50/20">
                <td className="px-8 py-3 text-slate-400 border-r border-black/5 dark:border-white/5 pl-12 font-medium">
                  Crecimiento YoY
                </td>
                {data.map((q) => (
                  <td key={`yoy-st-${q.label}`} className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatYoY(getYoY(q.st, q.st_prev))}
                  </td>
                ))}
                <td className="px-8 py-3 text-right font-mono tabular-nums bg-indigo-500/5">
                  {formatYoY(getYoY(totals.st, totals.st_prev))}
                </td>
              </tr>

              {/* Bloque C&R */}
              <tr className="group hover:bg-white/40 transition-colors border-t border-black/5 dark:border-white/5">
                <td className="px-8 py-6 font-bold text-slate-700 dark:text-slate-200 border-r border-black/5 dark:border-white/5">
                  Consumibles y Repuestos
                </td>
                {data.map((q) => (
                  <td key={`cr-${q.label}`} className="px-4 py-6 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatUSD(q.cr)}
                  </td>
                ))}
                <td className="px-8 py-6 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                  {formatUSD(totals.cr)}
                </td>
              </tr>
              <tr className="text-[12.5px] bg-slate-50/20">
                <td className="px-8 py-3 text-slate-400 border-r border-black/5 dark:border-white/5 pl-12 font-medium">
                  Crecimiento YoY
                </td>
                {data.map((q) => (
                  <td key={`yoy-cr-${q.label}`} className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatYoY(getYoY(q.cr, q.cr_prev))}
                  </td>
                ))}
                <td className="px-8 py-3 text-right font-mono tabular-nums bg-indigo-500/5">
                  {formatYoY(getYoY(totals.cr, totals.cr_prev))}
                </td>
              </tr>

              {/* Totales Brutos */}
              <tr className="bg-slate-900/[0.03] dark:bg-white/[0.05] border-t-2 border-black/10 dark:border-white/10">
                <td className="px-8 py-7 font-black text-slate-900 dark:text-white border-r border-black/5 dark:border-white/5 text-lg">
                  TOTAL SERVICIO TÉCNICO
                </td>
                {data.map((q) => (
                  <td key={`total-${q.label}`} className="px-4 py-7 text-right font-black font-mono tabular-nums text-slate-900 dark:text-white text-lg">
                    {formatUSD(q.total)}
                  </td>
                ))}
                <td className="px-8 py-7 text-right font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 text-lg">
                  {formatUSD(totals.total)}
                </td>
              </tr>
              
              {/* Fila Acumulado YTD */}
              <tr className="bg-emerald-500/[0.02] dark:bg-emerald-500/[0.05] border-t border-emerald-500/20">
                <td className="px-8 py-7 font-black text-emerald-700 dark:text-emerald-400 border-r border-black/5 dark:border-white/5 flex items-center gap-2 text-lg">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                  ACUMULADO ANUAL (YTD)
                </td>
                {data.map((q) => (
                  <td key={`acum-${q.label}`} className="px-4 py-7 text-right font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 text-lg">
                    {formatUSD(q.acum)}
                  </td>
                ))}
                <td className="px-8 py-7 text-right font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 text-lg">
                  {formatUSD(totals.total)}
                </td>
              </tr>

              {/* Crecimiento Acumulado */}
              <tr className="text-sm bg-emerald-500/[0.05] border-t border-emerald-500/10">
                <td className="px-8 py-4 text-emerald-600/70 dark:text-emerald-400/60 border-r border-black/5 dark:border-white/5 pl-12 font-bold italic">
                  VAR. ACUMULADA VS AÑO ANTERIOR
                </td>
                {data.map((q) => (
                  <td key={`yoy-acum-${q.label}`} className="px-4 py-4 text-right font-black tabular-nums">
                    {formatYoY(getYoY(q.acum, q.acum_prev))}
                  </td>
                ))}
                <td className="px-8 py-4 text-right font-black font-mono tabular-nums border-l border-emerald-500/10">
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
