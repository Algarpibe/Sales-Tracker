"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTechServiceCategories } from "@/actions/category-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { TechServiceAnalysis } from "@/components/charts/tech-service-analysis";
import {
  buildTechServiceData,
  gruposServicioTecnico,
  TECH_SERVICE_CATEGORIES_KEY,
  type TechServiceViewMode,
} from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

/**
 * Análisis de Servicio Técnico (ST vs C&R) como widget autónomo: tanto el
 * selector de resolución (mensual/trimestral/anual) como el tipo de
 * registro (OV/Facturas) son estado propio, independiente del contexto
 * del dashboard. La clasificación ST / C&R la lee él mismo, con la misma consulta
 * que /analytics y el KPI de la tabla comercial. El mapa de categorías del contexto no sirve:
 * trae solo las categorías activas, y por nombre.
 */
export function TechServiceWidget({
  yearA, yearB, records, prevRecords,
}: {
  yearA: number;
  yearB: number;
  records: SalesRecord[];
  prevRecords: SalesRecord[];
}) {
  const [viewMode, setViewMode] = useState<TechServiceViewMode>("QUARTERLY");
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const { data: categorias, isPending } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
  });
  const grupos = useMemo(() => gruposServicioTecnico(categorias ?? []), [categorias]);
  const data = useMemo(
    () => buildTechServiceData(records, prevRecords, grupos, recordType, viewMode),
    [records, prevRecords, grupos, recordType, viewMode]
  );
  // Sin la clasificación todas las ventas quedan fuera del mapa y el gráfico pintaría
  // ST, C&R y totales a 0 para luego saltar a las cifras reales: mientras carga se
  // muestra el mismo esqueleto que el resto de widgets del dashboard.
  if (isPending) return <Skeleton className="h-full min-h-[400px] w-full" />;
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
