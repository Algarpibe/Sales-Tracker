"use client";

import { computeDelta, formatDeltaPct } from "@/lib/compare";

// Celda de variación coloreada (verde ↑ / rojo ↓ / neutro).
export function DeltaCell({ a, b }: { a: number; b: number }) {
  const p = computeDelta(a, b).deltaPct;
  const cls = p === null || p === 0 ? "text-muted-foreground" : p > 0 ? "text-emerald-500" : "text-rose-500";
  return <span className={cls}>{formatDeltaPct(p)}</span>;
}
