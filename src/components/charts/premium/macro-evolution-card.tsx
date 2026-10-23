"use client";

import {
  EvolutionCard,
  type EvolutionCardTextos,
} from "@/components/charts/premium/evolution-card";
import { getMacroEvolutionData } from "@/actions/grouping-actions";
import { CHART_HELP } from "@/lib/chart-help";
import type { RecordType } from "@/types/database";

interface MacroEvolutionCardProps {
  recordType: RecordType;
}

// Fuera del componente: son constantes, y así no se crean objetos nuevos en cada render.
const TEXTOS: EvolutionCardTextos = {
  seleccionar: "Seleccionar macro-categorías...",
  seleccionados: (n) => `${n} Macro-categorías seleccionadas`,
  buscar: "Buscar macro-categorías...",
  sinResultados: "No se encontraron macro-categorías.",
  disponibles: "Macro-categorías disponibles",
  vacio: "Selecciona al menos una macro-categoría en el panel superior.",
};

const descripcion = (periodo: string) =>
  `Tendencia ${periodo} y desglose porcentual de tus macro-categorías.`;

// El reparto depende de la clasificación de categorías. Al guardarla en Configuración se
// invalida ["categories"]; colgando de ese prefijo, esta lectura se vuelve a pedir sola
// (antes hacía falta un refreshKey con la fecha de otra consulta).
const macroEvolutionKey = (recordType: RecordType) =>
  ["categories", "macro-evolution", { recordType }] as const;

/**
 * Evolución de las ventas por macro-categoría. La tarjeta en sí es EvolutionCard, que
 * comparte con la de grupos; aquí van los textos y la lectura.
 */
export function MacroEvolutionCard({ recordType }: MacroEvolutionCardProps) {
  return (
    <EvolutionCard
      recordType={recordType}
      title="Evolución Histórica por Macro-categoría"
      description={descripcion}
      help={CHART_HELP.macroEvolucion}
      fetcher={getMacroEvolutionData}
      queryKeyFor={macroEvolutionKey}
      // Son siempre cuatro: al abrir, todas.
      seleccionInicial="todas"
      textos={TEXTOS}
    />
  );
}
