"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories, fetchSalesData } from "@/lib/data-client";
import { computeDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics";
import type { Category, SalesRecord } from "@/types/database";

export interface DashboardData {
  year: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
  categories: Category[];
  metrics: DashboardMetrics;
  metricsPrev: DashboardMetrics;
  isLoading: boolean;
}

const Ctx = createContext<DashboardData | null>(null);

export function useDashboardData(): DashboardData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDashboardData debe usarse dentro de DashboardDataProvider");
  return v;
}

export function DashboardDataProvider({ year, children }: { year: number; children: React.ReactNode }) {
  const { data: recordsData, isLoading: l1 } = useQuery({
    queryKey: ["sales", { year }],
    queryFn: () => fetchSalesData({ year }),
  });
  const { data: prevData, isLoading: l2 } = useQuery({
    queryKey: ["sales", { year: year - 1 }],
    queryFn: () => fetchSalesData({ year: year - 1 }),
  });
  const { data: catsData, isLoading: l3 } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const value = useMemo<DashboardData>(() => {
    const records = (recordsData ?? []) as SalesRecord[];
    const prevRecords = (prevData ?? []) as SalesRecord[];
    const cats = catsData ?? [];
    return {
      year,
      records,
      prevRecords,
      catMap: new Map(cats.map((c) => [c.id, c.name] as [string, string])),
      categories: cats as Category[],
      metrics: computeDashboardMetrics(records, cats),
      metricsPrev: computeDashboardMetrics(prevRecords, cats),
      isLoading: l1 || l2 || l3,
    };
  }, [recordsData, prevData, catsData, year, l1, l2, l3]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
