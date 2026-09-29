/**
 * Lógica pura de las metas de KPIs: la conversión de la fila de la base y, más
 * adelante, la del borrador de la pantalla de Configuración. Vive fuera de la acción
 * y del componente para poder probarla con vitest, que corre en node.
 */
import type { KpiTargetRow } from "@/actions/kpi-actions";

/** Fila de kpi_targets tal como la devuelve Drizzle: numeric llega como string. */
export interface FilaMetaBd {
  kpi_key: string;
  target_value: string;
  weight_pct: string;
  plazo_horas: string | null;
}

export function filaDeMeta(r: FilaMetaBd): KpiTargetRow {
  return {
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
    // Number(null) sería 0, no «sin plazo»: se conserva el nulo para que la lectura
    // aplique el plazo por defecto.
    plazo_horas: r.plazo_horas === null ? null : Number(r.plazo_horas),
  };
}
