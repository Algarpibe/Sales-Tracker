"use client";

import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { formatUSD } from "@/lib/constants";

interface AgingData {
  lowRisk: number;    // 0-30 días
  mediumRisk: number; // 31-90 días
  highRisk: number;   // >90 días
  total: number;
}

interface AgingCardProps {
  data: AgingData;
  className?: string;
}

export function AgingCard({ data, className }: AgingCardProps) {
  // Manejo de división por cero
  const total = data.total > 0 ? data.total : 1;
  
  const pLow = (data.lowRisk / total) * 100;
  const pMed = (data.mediumRisk / total) * 100;
  const pHigh = (data.highRisk / total) * 100;

  // Calculamos el índice de "Aging" como el porcentaje que NO es de bajo riesgo
  const agingIndex = ((data.mediumRisk + data.highRisk) / total) * 100;

  // Funciones de dibujo SVG para anillos puros
  const radius = { outer: 65, middle: 50, inner: 35 };
  const circumference = (r: number) => 2 * Math.PI * r;
  
  const getStrokeDashoffset = (r: number, percentage: number) => {
    const c = circumference(r);
    return c - (percentage / 100) * c;
  };

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/20 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500",
        "border-t border-t-rose-500/30 hover:border-t-rose-500/50",
        className
      )}
    >
      {/* Internal Glow Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight leading-none text-foreground flex items-center gap-2">
            Aging del Backlog
            <History className="h-4 w-4 text-rose-400 animate-pulse" />
          </h3>
          <p className="text-xs font-medium text-muted-foreground">
            Antigüedad del pendiente de facturación
          </p>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center gap-8 md:gap-12">
        {/* Gráfico de Anillos SVG Concéntricos */}
        <div className="relative flex shrink-0 items-center justify-center h-40 w-40 drop-shadow-[0_0_15px_rgba(0,0,0,0.2)]">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            {/* Background Rings */}
            <circle cx="80" cy="80" r={radius.outer} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-rose-500/10" />
            <circle cx="80" cy="80" r={radius.middle} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-amber-500/10" />
            <circle cx="80" cy="80" r={radius.inner} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-emerald-500/10" />

            {/* Progress Rings */}
            <circle
              cx="80" cy="80" r={radius.outer} fill="transparent" stroke="currentColor" strokeWidth="8"
              className="text-rose-500 transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]"
              strokeDasharray={circumference(radius.outer)}
              strokeDashoffset={getStrokeDashoffset(radius.outer, pHigh)}
              strokeLinecap="round"
            />
            <circle
              cx="80" cy="80" r={radius.middle} fill="transparent" stroke="currentColor" strokeWidth="8"
              className="text-amber-500 transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              strokeDasharray={circumference(radius.middle)}
              strokeDashoffset={getStrokeDashoffset(radius.middle, pMed)}
              strokeLinecap="round"
            />
            <circle
              cx="80" cy="80" r={radius.inner} fill="transparent" stroke="currentColor" strokeWidth="8"
              className="text-emerald-500 transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              strokeDasharray={circumference(radius.inner)}
              strokeDashoffset={getStrokeDashoffset(radius.inner, pLow)}
              strokeLinecap="round"
            />
          </svg>
          
          {/* Texto Central */}
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold tracking-tighter text-foreground">
              {data.total > 0 ? agingIndex.toFixed(0) : 0}%
            </span>
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              En Riesgo
            </span>
          </div>
        </div>

        {/* Leyenda y Datos Monetarios */}
        <div className="flex flex-col justify-center space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-muted-foreground">0-30 días</span>
            </div>
            <p className="pl-5 text-base font-semibold text-foreground tracking-tight">
              {formatUSD(data.lowRisk)}
            </p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              <span className="text-muted-foreground">31-90 días</span>
            </div>
            <p className="pl-5 text-base font-semibold text-foreground tracking-tight">
              {formatUSD(data.mediumRisk)}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              <span className="text-muted-foreground">&gt;90 días</span>
            </div>
            <p className="pl-5 text-base font-semibold text-foreground tracking-tight">
              {formatUSD(data.highRisk)}
            </p>
          </div>
        </div>
      </div>

      {/* Efecto de fondo global para la tarjeta */}
      <div className="pointer-events-none absolute -bottom-20 -right-20 z-[-1] h-64 w-64 rounded-full bg-rose-500/5 blur-3xl opacity-50" />
    </div>
  );
}
