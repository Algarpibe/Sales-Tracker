"use client";

import { EvolutionCard, type EvolutionCardTextos } from "@/components/charts/premium/evolution-card";
import { getGroupingAnalysisData } from "@/actions/grouping-actions";
import { CHART_HELP } from "@/lib/chart-help";
import { groupingAnalysisKey } from "@/lib/grouping-analysis";
import type { RecordType } from "@/types/database";

interface GroupEvolutionCardProps {
  recordType: RecordType;
}

// Fuera del componente: son constantes, y así no se crean objetos nuevos en cada render.
const TEXTOS: EvolutionCardTextos = {
  seleccionar: "Seleccionar Grupos...",
  seleccionados: (n) => `${n} Grupos Seleccionados`,
  buscar: "Buscar grupos...",
  sinResultados: "No se encontraron grupos.",
  disponibles: "Grupos Disponibles",
  vacio: "Selecciona al menos un grupo de análisis en el panel superior.",
};

const descripcion = (periodo: string) =>
  `Tendencia ${periodo} y desglose porcentual de tus agrupaciones estratégicas.`;

/**
 * Evolución de las agrupaciones personalizadas. La tarjeta en sí es EvolutionCard, que
 * comparte con la de macro-categorías; aquí solo van los textos y la lectura. La usan la
 * página de Análisis y el widget «Evolución por grupo» del dashboard.
 */
export function GroupEvolutionCard({ recordType }: GroupEvolutionCardProps) {
  return (
    <EvolutionCard
      recordType={recordType}
      title="Evolución Histórica por Grupo"
      description={descripcion}
      help={CHART_HELP.grupoEvolucion}
      fetcher={getGroupingAnalysisData}
      // Misma clave que el análisis y el forecast por grupo: comparten caché y se
      // refrescan juntos al editar las agrupaciones.
      queryKeyFor={groupingAnalysisKey}
      // Los grupos pueden ser muchos: al abrir, solo los tres primeros.
      seleccionInicial="primeras3"
      textos={TEXTOS}
    />
  );
}
