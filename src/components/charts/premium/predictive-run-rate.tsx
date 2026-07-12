"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { formatUSD } from "@/lib/constants";
import { calculateRunRate } from "@/lib/math-utils";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/common/info-tooltip";

interface PredictiveRunRateCardProps {
  currentTotal: number;
  lastYearMonthTotal: number;
  projectedTotal?: number;
  low?: number;
  high?: number;
  deltaPct?: number | null;
  deltaLabel?: string;
  title?: string;
  currentLabel?: string;
  targetLabel?: string;
  className?: string;
  info?: string;
}

const money0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function PredictiveRunRateCard({
  currentTotal,
  lastYearMonthTotal,
  projectedTotal: externalProjectedTotal,
  low,
  high,
  deltaPct,
  deltaLabel = "año anterior",
  title = "Proyección de Cierre (Mes Actual)",
  currentLabel = "Ventas Actuales",
  targetLabel = "Objetivo (Año Prev.)",
  className,
  info,
}: PredictiveRunRateCardProps) {
  const now = new Date();
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const projectedTotal = externalProjectedTotal ?? calculateRunRate(currentTotal, currentDay, totalDays);
  const progressPercent = projectedTotal > 0 ? Math.min(100, (currentTotal / projectedTotal) * 100) : 0;

  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const isOnTrack = hasDelta ? (deltaPct as number) >= 0 : projectedTotal >= lastYearMonthTotal;
  const hasBand = low !== undefined && high !== undefined && high > low;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("relative group", className)}
    >
      <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-50 pointer-events-none" />

        <CardContent className="p-6 relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{title}</h3>
                {info && <InfoTooltip text={info} />}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                  {money0(projectedTotal)}
                </span>
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Forecast
                </span>
              </div>
              {hasBand && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Rango estimado: {money0(low!)} – {money0(high!)}
                </p>
              )}
            </div>

            <div className={cn(
              "p-3 rounded-2xl border backdrop-blur-md transition-all duration-500 group-hover:scale-110",
              isOnTrack
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                : "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            )}>
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end text-sm">
              <div className="space-y-1">
                <span className="text-muted-foreground">{currentLabel}</span>
                <p className="font-bold tabular-nums">{formatUSD(currentTotal)}</p>
              </div>
              <div className="text-right space-y-1">
                <span className="text-muted-foreground">{targetLabel}</span>
                <p className="font-bold tabular-nums text-muted-foreground/80">{formatUSD(lastYearMonthTotal)}</p>
              </div>
            </div>

            <div className="relative h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_15px_rgba(99,102,241,0.5)] z-20"
              />
              <div className="absolute inset-y-0 left-0 w-full bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,rgba(99,102,241,0.2)_4px,rgba(99,102,241,0.2)_8px)] z-10" />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", isOnTrack ? "bg-emerald-500" : "bg-amber-500")} />
              <span className={cn("text-xs font-bold uppercase tracking-wider", isOnTrack ? "text-emerald-500" : "text-amber-500")}>
                {isOnTrack ? "En Trayectoria (On Track)" : "En Riesgo (At Risk)"}
              </span>
              {hasDelta && (
                <span className="text-xs font-medium text-muted-foreground normal-case tracking-normal">
                  · {(deltaPct as number) >= 0 ? "+" : ""}{((deltaPct as number) * 100).toFixed(1)}% vs {deltaLabel}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
