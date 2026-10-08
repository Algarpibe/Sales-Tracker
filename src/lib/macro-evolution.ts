import { BUCKETS, BUCKET_COLORS, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";
import type { GroupingAnalysisResult, GroupingAnalysisRow, MacroCategoria } from "@/types/database";

/** Venta agregada por categoría, mes y año, ya filtrada por tipo de registro. */
export interface MacroEvolutionRecord {
  /** Id de la categoría de la app. Nulo en una venta de sales_records sin categoría. */
  category_id: string | null;
  record_year: number;
  record_month: number;
  amount_usd: number;
}

/**
 * Macro-categoría de cada categoría marcada, indexada por id.
 * - Va por id y no por nombre (como mapaMacroCategorias) porque las ventas ya llegan
 *   aquí con el id de la categoría de la app.
 * - Entran las inactivas: sus ventas de años anteriores siguen en su macro-categoría.
 * - Las no marcadas no entran, y buildMacroEvolution las cuenta como Equipos.
 */
export function bucketsPorCategoriaId(
  categorias: readonly Pick<MacroCategoria, "id" | "macro_categoria">[]
): Map<string, Bucket> {
  const mapa = new Map<string, Bucket>();
  for (const c of categorias) {
    // La columna tiene un CHECK, pero se filtra igual: un valor inesperado no debe
    // colarse como macro-categoría.
    if (c.macro_categoria !== null && (BUCKETS as readonly string[]).includes(c.macro_categoria)) {
      mapa.set(c.id, c.macro_categoria);
    }
  }
  return mapa;
}

/**
 * Reparte las ventas entre las cuatro macro-categorías, en el formato del gráfico de
 * grupos para que los dos compartan tarjeta. Siempre devuelve las cuatro filas, en el
 * orden de BUCKETS, aunque alguna no tenga ventas: el selector de series no debe cambiar
 * de un año a otro.
 */
export function buildMacroEvolution(
  records: readonly MacroEvolutionRecord[],
  bucketPorCategoriaId: ReadonlyMap<string, Bucket>
): GroupingAnalysisResult {
  const porAnio = {} as Record<Bucket, Record<number, number>>;
  const porMes = {} as Record<Bucket, Record<number, Record<number, number>>>;
  for (const b of BUCKETS) {
    porAnio[b] = {};
    porMes[b] = {};
  }
  const yearTotals: Record<number, number> = {};

  for (const r of records) {
    const year = Number(r.record_year);
    const month = Number(r.record_month);
    // Leído de sales_records, el importe es NUMERIC y llega como texto.
    const amount = Number(r.amount_usd) || 0;
    // Sin categoría o con una categoría sin marcar: Equipos, como en el resto de
    // gráficos de macro-categorías.
    const b = (r.category_id ? bucketPorCategoriaId.get(r.category_id) : undefined) ?? "equipos";

    yearTotals[year] = (yearTotals[year] || 0) + amount;
    porAnio[b][year] = (porAnio[b][year] || 0) + amount;
    const meses = (porMes[b][year] ??= {});
    meses[month] = (meses[month] || 0) + amount;
  }

  const years = Object.keys(yearTotals).map(Number).sort((a, b) => a - b);
  const totalGeneral = years.reduce((acc, y) => acc + yearTotals[y], 0);

  const rows: GroupingAnalysisRow[] = BUCKETS.map((b) => {
    const yearData: GroupingAnalysisRow["years"] = {};
    let total = 0;
    for (const y of years) {
      const amount = porAnio[b][y] || 0;
      const totalAnio = yearTotals[y];
      yearData[y] = { amount, percentage: totalAnio > 0 ? (amount / totalAnio) * 100 : 0 };
      total += amount;
    }
    return {
      groupId: b,
      groupName: BUCKET_LABELS[b],
      color: BUCKET_COLORS[b],
      years: yearData,
      months: porMes[b],
      // Igual que en el gráfico de grupos: importe medio por año y peso sobre el total
      // de todos los años.
      average: {
        amount: years.length > 0 ? total / years.length : 0,
        percentage: totalGeneral > 0 ? (total / totalGeneral) * 100 : 0,
      },
    };
  });

  return { rows, years, yearTotals };
}
