import type { GroupingAnalysisResult, GroupingAnalysisRow, RecordType } from "@/types/database";

// ─── Agregado del análisis por agrupaciones (ARQ-079) ───
// Lógica pura que antes vivía dentro de getGroupingAnalysisData: la acción conserva la
// autorización y las lecturas, y delega aquí el cálculo.

export interface GroupingGroup {
  id: string;
  name: string;
  color: string | null;
}

export interface GroupingMapping {
  group_id: string;
  category_id: string | null;
}

/** Venta por categoría, mes y año (amount_usd NUMERIC puede llegar como texto). */
export interface GroupingRecord {
  category_id: string | null;
  record_year: number;
  record_month: number;
  amount_usd: number | string;
}

const DEFAULT_GROUP_COLOR = "#6366f1";

/**
 * Suma por grupo, año y mes; % de cada año sobre el total del año (que incluye las
 * ventas de categorías sin grupo) y promedio sobre TODOS los años con ventas, también
 * los años en que el grupo no vendió (cuentan 0).
 */
export function aggregateGroupingAnalysis(
  groups: readonly GroupingGroup[],
  mappings: readonly GroupingMapping[],
  records: readonly GroupingRecord[]
): GroupingAnalysisResult {
  if (groups.length === 0) return { rows: [], years: [], yearTotals: {} };

  const catToGroup = new Map<string, string>();
  for (const m of mappings) catToGroup.set(String(m.category_id), m.group_id);
  // Desde catToGroup (y no desde las asignaciones) para que una categoría cuente en un
  // solo grupo, el mismo en el que suman sus ventas.
  const groupCategories = new Map<string, string[]>(groups.map((g) => [g.id, []]));
  for (const [catId, groupId] of catToGroup) groupCategories.get(groupId)?.push(catId);

  const yearsSet = new Set<number>();
  const groupYearSums: Record<string, Record<number, number>> = {};
  const groupMonthSums: Record<string, Record<number, Record<number, number>>> = {}; // grupo → año → mes
  const yearTotals: Record<number, number> = {};
  for (const g of groups) {
    groupYearSums[g.id] = {};
    groupMonthSums[g.id] = {};
  }

  for (const r of records) {
    const year = Number(r.record_year);
    const month = Number(r.record_month);
    const amount = Number(r.amount_usd) || 0; // NUMERIC → Number
    const groupId = catToGroup.get(String(r.category_id));

    yearsSet.add(year);
    yearTotals[year] = (yearTotals[year] || 0) + amount;

    if (groupId && groupYearSums[groupId]) {
      groupYearSums[groupId][year] = (groupYearSums[groupId][year] || 0) + amount;
      groupMonthSums[groupId][year] ??= {};
      groupMonthSums[groupId][year][month] = (groupMonthSums[groupId][year][month] || 0) + amount;
    }
  }

  const years = Array.from(yearsSet).sort((a, b) => a - b);
  const totalOfAllYearTotals = years.reduce((acc, y) => acc + (yearTotals[y] || 0), 0);

  const rows: GroupingAnalysisRow[] = groups.map((g) => {
    const sums = groupYearSums[g.id] || {};
    const yearData: GroupingAnalysisRow["years"] = {};
    let totalAmount = 0;
    for (const y of years) {
      const amount = sums[y] || 0;
      const grandTotal = yearTotals[y] || 1;
      yearData[y] = { amount, percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0 };
      totalAmount += amount;
    }
    return {
      groupId: g.id,
      groupName: g.name,
      color: g.color || DEFAULT_GROUP_COLOR,
      years: yearData,
      months: groupMonthSums[g.id] || {},
      average: {
        amount: years.length > 0 ? totalAmount / years.length : 0,
        percentage: totalOfAllYearTotals > 0 ? (totalAmount / totalOfAllYearTotals) * 100 : 0,
      },
      categoryIds: groupCategories.get(g.id) ?? [],
    };
  });

  return { rows, years, yearTotals };
}

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
