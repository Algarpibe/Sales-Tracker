"use client";

import { useState } from "react";
import { getYearRange } from "@/lib/constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default function HomePage() {
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard General</h1>
          <p className="text-muted-foreground mt-1">Vista centralizada de métricas y rendimiento para el año {year}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 bg-card/50 px-4 py-2 rounded-lg border border-border/50 backdrop-blur-sm shadow-sm">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger aria-label="Año" className="w-[140px] border-none shadow-none focus:ring-0 font-semibold bg-transparent">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>Año {y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DashboardDataProvider year={year}>
        <DashboardGrid />
      </DashboardDataProvider>
    </div>
  );
}
