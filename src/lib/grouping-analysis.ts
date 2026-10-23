import type { GroupingAnalysisResult, RecordType } from "@/types/database";

// Claves de react-query de las agrupaciones (FE-057). Todo cuelga de ["groupings"]:
// al crear/editar/borrar/reordenar una agrupación, GroupingManager invalida ese
// prefijo y se refrescan la lista, el análisis, la evolución y el forecast por grupo
// (antes solo se refrescaba la tarjeta desde la que se editaba).
export const GROUPINGS_KEY = ["groupings"] as const;
export const GROUPINGS_LIST_KEY = ["groupings", "list"] as const;

/** Misma lectura (getGroupingAnalysisData) para análisis, evolución y forecast por grupo. */
export function groupingAnalysisKey(recordType: RecordType) {
  return ["groupings", "analysis", { recordType }] as const;
}

/** Recorta solo la lista de años (la evolución lee las filas por año a demanda). */
export function keepYearsFrom(raw: GroupingAnalysisResult, firstYear: number): GroupingAnalysisResult {
  return { ...raw, years: raw.years.filter((y) => y >= firstYear) };
}

/**
 * Recorta el rango desde `firstYear` para la matriz de agrupaciones. Además de las
 * columnas hay que descartar el año de cada fila y recalcular su promedio, o PROMEDIO y
 * TOTAL seguirían incluyendo el año oculto y no cuadrarían.
 */
export function trimGroupingFromYear(raw: GroupingAnalysisResult, firstYear: number): GroupingAnalysisResult {
  const years = raw.years.filter((y) => y >= firstYear);
  const rows = raw.rows.map((row) => {
    const yearsKept = Object.fromEntries(
      Object.entries(row.years).filter(([y]) => Number(y) >= firstYear)
    ) as typeof row.years;
    const vals = Object.values(yearsKept);
    const n = vals.length || 1;
    return {
      ...row,
      years: yearsKept,
      average: {
        amount: vals.reduce((sum, v) => sum + v.amount, 0) / n,
        percentage: vals.reduce((sum, v) => sum + v.percentage, 0) / n,
      },
    };
  });
  return { ...raw, years, rows };
}
