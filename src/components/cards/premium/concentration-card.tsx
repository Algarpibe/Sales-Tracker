"use client";

import { cn } from "@/lib/utils";
import { Folder, AlertCircle } from "lucide-react";
import { formatCompactUSD } from "@/lib/constants";

export interface CategoryConcentration {
  categoryName: string;
  amount: number;
  percentage: number;
}

interface ConcentrationCardProps {
  data: CategoryConcentration[];
  className?: string;
}

export function ConcentrationCard({ data, className }: ConcentrationCardProps) {
  // Encontrar el valor más alto para relocalizar el Badge de "Focus"
  const highestValue = Math.max(...data.map(d => d.amount), 0);
  const total = data.reduce((acc, curr) => acc + curr.amount, 0);

  // Ordenamos para que las barras más altas no estropéen el flujo visual si hay muchas
  // O simplemente mostramos el top 5
  const displayData = [...data].sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/20 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500",
        "border-t border-t-indigo-500/30 hover:border-t-indigo-500/50 min-h-[360px]",
        className
      )}
    >
      {/* Internal Glow Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Concentración de Backlog
          </h3>
          <p className="text-xs font-medium text-muted-foreground">
            Top 5 categorías por volumen retenido
          </p>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex items-end justify-between gap-2 mt-8 md:mt-12 h-64 relative">
        {displayData.map((item, index) => {
          const isHighest = item.amount === highestValue && item.amount > 0;
          // Escalamos la altura visualmente. El 100% de la altura de la caja (h-full) = highestValue.
          const heightPercentage = highestValue > 0 ? (item.amount / highestValue) * 100 : 0;

          return (
            <div key={index} className="relative flex flex-col items-center justify-end w-full group h-full">
              {/* Tooltip / Valor Compacto Arriba */}
              <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs font-semibold text-foreground">
                {formatCompactUSD(item.amount)}
              </div>

              {/* Focus Badge */}
              {isHighest && (
                <div className="absolute -top-8 h-6 w-auto px-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-[10px] font-bold text-indigo-400 backdrop-blur shadow-[0_0_10px_rgba(99,102,241,0.2)] flex items-center gap-1 z-10 whitespace-nowrap animate-bounce">
                  <AlertCircle className="w-3 h-3" /> Focus
                </div>
              )}

              {/* Barra (Pill) */}
              <div 
                className="w-full max-w-[48px] rounded-t-xl rounded-b-sm bg-gradient-to-t transition-all duration-1000 ease-out flex items-end justify-center pb-2 relative overflow-hidden"
                style={{
                  height: `${heightPercentage}%`,
                  minHeight: heightPercentage > 0 ? '1.5rem' : '0',
                }}
              >
                {/* Degradado sofisticado Slate -> Indigo -> Violet */}
                <div className={cn(
                  "absolute inset-0 opacity-80",
                  isHighest ? "bg-gradient-to-t from-slate-600 via-indigo-500 to-violet-500" : "bg-gradient-to-t from-slate-700 via-slate-600 to-indigo-900"
                )} />
                
                {/* Texto interno (si hay espacio) */}
                <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-md">
                  {item.percentage.toFixed(0)}%
                </span>
              </div>

              {/* Header debajo de la barra */}
              <div className="mt-3 flex flex-col items-center gap-1 text-center">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate w-14 overflow-hidden">
                  {item.categoryName}
                </span>
              </div>
            </div>
          );
        })}
        
        {/* Empty State */}
        {displayData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No hay datos de retención en estas categorías.
          </div>
        )}
      </div>

      {/* Efecto Glow Global */}
      <div className="pointer-events-none absolute -top-20 -left-20 z-[-1] h-64 w-64 rounded-full bg-violet-500/5 blur-3xl opacity-50" />
    </div>
  );
}
