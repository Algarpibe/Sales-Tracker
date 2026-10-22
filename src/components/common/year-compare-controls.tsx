"use client";

import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Primer año que ofrecen los selectores: 2020 está incompleto en el hub.
const FIRST_YEAR = 2021;

/**
 * Selector de año o, en modo comparación, de año A y año B, más el interruptor
 * «Comparar años». Lo comparten las secciones por cliente × artículo y por cliente ×
 * categoría. Devuelve un fragmento para quedar dentro de la fila de controles de cada
 * página, junto a su conmutador OV/FAC.
 */
export function YearCompareControls({
  anio,
  onAnioChange,
  compareMode,
  onCompareModeChange,
  yearA,
  onYearAChange,
  yearB,
  onYearBChange,
}: {
  anio: number;
  onAnioChange: (anio: number) => void;
  compareMode: boolean;
  onCompareModeChange: (compareMode: boolean) => void;
  yearA: number;
  onYearAChange: (anio: number) => void;
  yearB: number;
  onYearBChange: (anio: number) => void;
}) {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  return (
    <>
      {!compareMode ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Año</label>
          <Select value={String(anio)} onValueChange={(v) => { if (v) onAnioChange(Number(v)); }}>
            <SelectTrigger aria-label="Año" className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Año A</label>
            <Select value={String(yearA)} onValueChange={(v) => { if (v) onYearAChange(Number(v)); }}>
              <SelectTrigger aria-label="Año A" className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <span className="self-end pb-2 text-muted-foreground">vs</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Año B</label>
            <Select value={String(yearB)} onValueChange={(v) => { if (v) onYearBChange(Number(v)); }}>
              <SelectTrigger aria-label="Año B" className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 self-center text-sm pb-1">
        <Switch checked={compareMode} onCheckedChange={onCompareModeChange} /> Comparar años
      </label>
    </>
  );
}
