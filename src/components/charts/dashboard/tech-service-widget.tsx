"use client";

import { useMemo, useState } from "react";
import { TechServiceAnalysis } from "@/components/charts/tech-service-analysis";
import { buildTechServiceData, type TechServiceViewMode } from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

/**
 * Análisis Financiero (ST vs C&R) como widget autónomo: el selector de
 * resolución (mensual/trimestral/anual) es estado propio.
 */
export function TechServiceWidget({
  recordType, yearA, yearB, records, prevRecords, catMap,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
}) {
  const [viewMode, setViewMode] = useState<TechServiceViewMode>("QUARTERLY");
  const data = useMemo(
    () => buildTechServiceData(records, prevRecords, catMap, recordType, viewMode),
    [records, prevRecords, catMap, recordType, viewMode]
  );
  return (
    <TechServiceAnalysis
      data={data}
      yearA={yearA}
      yearB={yearB}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}
