"use client";

import { useQuery } from "@tanstack/react-query";
import {
  EvolutionCard,
  EvolutionCardSkeleton,
  type EvolutionCardTextos,
} from "@/components/charts/premium/evolution-card";
import { getMacroCategorias } from "@/actions/category-actions";
import { getMacroEvolutionData } from "@/actions/grouping-actions";
import { CHART_HELP } from "@/lib/chart-help";
import { MACRO_CATEGORIAS_KEY } from "@/lib/customer-item";
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

/**
 * Evolución de las ventas por macro-categoría. La tarjeta en sí es EvolutionCard, que
 * comparte con la de grupos; aquí van los textos, la lectura y el refresco.
 */
export function MacroEvolutionCard({ recordType }: MacroEvolutionCardProps) {
  // El reparto lo hace el servidor, así que de esta consulta no se usan los datos: se usa
  // su fecha. EvolutionCard carga con un efecto, no con react-query, y por sí sola no se
  // enteraría de que la clasificación ha cambiado. Al guardar en Configuración se
  // invalida ["categories"]; por prefijo se vuelve a pedir esta clave, cambia
  // dataUpdatedAt y, como va de refreshKey, la tarjeta vuelve a pedir el reparto.
  const { data: macro, dataUpdatedAt } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
  });

  // Hasta que llega la clasificación no se monta la tarjeta: si se montara ya, pediría
  // el reparto dos veces, una al montarse y otra al cambiar la fecha.
  if (macro === undefined) return <EvolutionCardSkeleton />;

  return (
    <EvolutionCard
      recordType={recordType}
      title="Evolución Histórica por Macro-categoría"
      description={descripcion}
      help={CHART_HELP.macroEvolucion}
      fetcher={getMacroEvolutionData}
      // Son siempre cuatro: al abrir, todas.
      seleccionInicial="todas"
      textos={TEXTOS}
      refreshKey={dataUpdatedAt}
    />
  );
}
