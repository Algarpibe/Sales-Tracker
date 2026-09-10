"use client";

import { useMemo, useState } from "react";
import { TechServiceAnalysis } from "@/components/charts/tech-service-analysis";
import { buildTechServiceData, type TechServiceViewMode } from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

/**
 * Análisis de Servicio Técnico (ST vs C&R) como widget autónomo: tanto el
 * selector de resolución (mensual/trimestral/anual) como el tipo de
 * registro (OV/Facturas) son estado propio, independiente del contexto
 * del dashboard.
 */
export function TechServiceWidget({
  yearA, yearB, records, prevRecords, catMap,
}: {
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
  catMap: Map<string, string>;
}) {
  const [viewMode, setViewMode] = useState<TechServiceViewMode>("QUARTERLY");
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
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
      recordType={recordType}
      onRecordTypeChange={setRecordType}
    />
  );
}
