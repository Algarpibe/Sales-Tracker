"use client";

import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface ExecutionCardProps {
  percentage: number;
  className?: string;
}

export function ExecutionCard({ percentage, className }: ExecutionCardProps) {
  // Asegurador de límites para el anillo radial
  const safePercentage = isNaN(percentage) || !isFinite(percentage) ? 0 : Math.min(Math.max(percentage, 0), 100);
  const remaining = 100 - safePercentage;

  // Datos para Recharts: el primer valor es el lleno, el segundo el vacío
  const data = [
    { name: "Ejecutado", value: safePercentage },
    { name: "Pendiente", value: remaining },
  ];

  // Evaluar estado para el badge
  const isOnTrack = safePercentage >= 75;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/20 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500",
        "border-t border-t-cyan-500/30 hover:border-t-cyan-500/50",
        className
      )}
    >
      {/* Internal Glow Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
      {/* Badge Flotante Superior */}
      <div className="absolute top-4 right-4">
        <div
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold shadow-lg backdrop-blur-md",
            isOnTrack
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : "bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          )}
        >
          {isOnTrack ? "On Track" : "At Risk"}
        </div>
      </div>

      <div className="relative h-48 w-48 shrink-0 drop-shadow-[0_0_15px_rgba(6,182,212,0.15)]">
        {/* Gráfico Radial de Recharts */}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {/* Gradiente Cyan */}
              <linearGradient id="cyanGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" /> {/* Azul Suave */}
                <stop offset="100%" stopColor="#06b6d4" /> {/* Cyan Vibrante */}
              </linearGradient>
            </defs>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
              cornerRadius={10}
            >
              {/* Celda Llena */}
              <Cell fill="url(#cyanGradient)" className="filter drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              {/* Celda Vacía (Fondo del anillo) */}
              <Cell fill="var(--muted)" className="opacity-20" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Texto central en el anillo */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tracking-tighter bg-gradient-to-br from-blue-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm">
            {safePercentage.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="text-center space-y-1 z-10">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Ratio de Ejecución
        </h3>
        <p className="text-sm font-medium text-muted-foreground">
          Facturas generadas vs. Órdenes emitidas
        </p>
      </div>

      {/* Efecto de brillo de fondo */}
      <div className="pointer-events-none absolute -left-20 -bottom-20 z-[-1] h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />
    </div>
  );
}
