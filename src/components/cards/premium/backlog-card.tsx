"use client";

import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";

interface BacklogCardProps {
  value: string;
  percentageGoal: number; // Porcentaje respecto a una meta u otra métrica
  className?: string;
}

export function BacklogCard({ value, percentageGoal, className }: BacklogCardProps) {
  // Asegurar que el porcentaje visual esté entre 0 y 100
  const visualPercentage = Math.min(Math.max(percentageGoal, 0), 100);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/10 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500",
        // Tope iluminado (Antigravity subtlety)
        "border-t border-t-primary/30 hover:border-t-primary/50",
        className
      )}
    >
      {/* Internal Glow Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground tracking-tight">
            Backlog (Pendiente de Facturar)
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold tracking-tighter text-foreground drop-shadow-sm">
              {value}
            </h3>
          </div>
          <p className="text-xs font-medium text-muted-foreground/80 mt-1">
            Ingresos comprometidos en tránsito
          </p>
        </div>
        
        {/* Ícono con Glow */}
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md" />
          <Coins className="relative h-6 w-6 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
        </div>
      </div>

      <div className="relative z-10 mt-8 space-y-2">
        <div className="flex justify-between text-xs font-medium text-muted-foreground">
          <span>Progreso de cobertura</span>
          <span>{percentageGoal.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-out"
            style={{ width: `${visualPercentage}%` }}
          />
        </div>
      </div>
      
      {/* Efecto de brillo de fondo */}
      <div className="pointer-events-none absolute -right-20 -top-20 z-[-1] h-64 w-64 rounded-full bg-primary/5 blur-3xl opacity-50" />
    </div>
  );
}
