/**
 * Lógica pura de las metas de KPIs: la conversión de la fila de la base y la del
 * borrador de la pantalla de Configuración. Vive fuera de la acción y del componente
 * para poder probarla con vitest, que corre en node sin librería de componentes.
 */
import type { KpiScope, KpiTargetRow } from "@/actions/kpi-actions";
import { COMMERCIAL_KPIS, KPI_CON_PLAZO } from "@/lib/commercial-kpis";
import { PLAZO_HORAS_POR_DEFECTO, plazoTicketsDelAnio } from "@/lib/kpi-tickets";

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

/** Meta y peso de cada KPI como texto editable, por clave. */
export type Draft = Record<string, { target: string; weight: string }>;

/** Lo guardado, como texto editable. Los KPIs sin fila en ese ámbito van vacíos. */
export function toDraft(rows: KpiTargetRow[]): Draft {
  const d: Draft = Object.fromEntries(
    COMMERCIAL_KPIS.map((k) => [k.key, { target: "", weight: "" }])
  );
  for (const r of rows) {
    if (d[r.kpi_key]) d[r.kpi_key] = { target: String(r.target_value), weight: String(r.weight_pct) };
  }
  return d;
}

/** Texto inicial del campo de plazo: lo guardado o, si no hay nada, el plazo por defecto. */
export function plazoInicial(rows: KpiTargetRow[]): string {
  return String(plazoTicketsDelAnio(rows));
}

/**
 * Plazo tecleado → horas, o null si no vale. Acepta la coma decimal porque es la que
 * teclea quien trabaja en español. Mismas reglas que kpiTargetsSchema (mayor que 0,
 * 999 como mucho, dos decimales como mucho), para que el botón no ofrezca guardar algo
 * que el servidor rechazaría.
 */
export function parsePlazo(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const horas = Number(limpio);
  return horas > 0 && horas <= 999 ? horas : null;
}

export const AVISO_PLAZO_INVALIDO =
  "El plazo debe ser un número de horas mayor que 0 y de 999 como mucho, con dos decimales como mucho.";
export const AVISO_PLAZO_SIN_FILA =
  "El plazo se guarda en la fila de Tickets de Servicio Técnico en plazo: ponle meta y peso para guardarlo.";

export interface EstadoBorrador {
  /** Lo que se envía a saveKpiTargets: solo los KPIs con peso. */
  items: KpiTargetRow[];
  suma: number;
  /** Los pesos suman 100 y todo KPI con peso tiene meta. */
  pesosValidos: boolean;
  /** Se puede guardar: pesos válidos y el plazo no lo impide. */
  valido: boolean;
  /** Por qué el plazo impide guardar, o null si no lo impide. */
  avisoPlazo: string | null;
}

export function evaluarBorrador(draft: Draft, salesperson: KpiScope, plazoTexto: string): EstadoBorrador {
  const esTotal = salesperson === null;
  const plazo = esTotal ? parsePlazo(plazoTexto) : null;
  // Solo cuentan los KPIs con peso: el resto no se mide en ese ámbito.
  const items: KpiTargetRow[] = COMMERCIAL_KPIS.map((k) => ({
    kpi_key: k.key,
    target_value: Number(draft[k.key]?.target ?? ""),
    weight_pct: Number(draft[k.key]?.weight ?? ""),
    // El plazo solo viaja en la fila de tickets del total: el servidor lo rechaza en cualquier otra.
    plazo_horas: esTotal && k.key === KPI_CON_PLAZO ? plazo : null,
  })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0);
  const suma = items.reduce((s, i) => s + i.weight_pct, 0);
  const pesosValidos = Math.round(suma * 100) === 10000 && items.every((i) => i.target_value > 0);

  let avisoPlazo: string | null = null;
  if (esTotal) {
    if (plazo === null) {
      avisoPlazo = AVISO_PLAZO_INVALIDO;
    } else if (
      plazo !== PLAZO_HORAS_POR_DEFECTO &&
      !items.some((i) => i.kpi_key === KPI_CON_PLAZO && i.target_value > 0)
    ) {
      // saveKpiTargets borra la fila de un KPI sin peso, y con ella su plazo: guardar
      // otro plazo sin esa fila lo perdería sin avisar. Una fila con peso pero sin meta
      // válida tampoco se guarda, y sin el aviso no se sabría qué le falta al plazo.
      avisoPlazo = AVISO_PLAZO_SIN_FILA;
    }
  }
  return { items, suma, pesosValidos, valido: pesosValidos && avisoPlazo === null, avisoPlazo };
}

/**
 * Si lo que hay en pantalla difiere de lo guardado. Se compara lo que se enviaría al
 * guardar, no el texto de los campos: "80.0" y "80" son la misma meta, y un plazo
 * tecleado en el ámbito de un vendedor no viaja, así que tampoco es un cambio. Sin
 * esto el botón quedaba activo aunque no hubiera nada nuevo que guardar.
 */
export function hayCambios(rows: KpiTargetRow[], draft: Draft, salesperson: KpiScope, plazoTexto: string): boolean {
  const clave = (items: KpiTargetRow[]) =>
    items
      .map((i) => `${i.kpi_key}|${i.target_value}|${i.weight_pct}|${i.plazo_horas ?? ""}`)
      .sort()
      .join(";");
  const guardado = evaluarBorrador(toDraft(rows), salesperson, plazoInicial(rows)).items;
  const actual = evaluarBorrador(draft, salesperson, plazoTexto).items;
  return clave(guardado) !== clave(actual);
}
