import type { TechServiceBucket, TechServiceCategory } from "@/types/database";

/**
 * Selección en curso de la tarjeta «Categorías de Servicio Técnico»: ids de categoría
 * de cada grupo. Vive fuera del componente para poder testearla: vitest corre en
 * node y no hay librería de tests de componentes.
 */
export interface SeleccionServicioTecnico {
  st: string[];
  cr: string[];
}

/** Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. */
export function seleccionInicial(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): SeleccionServicioTecnico {
  const st: string[] = [];
  const cr: string[] = [];
  for (const c of categorias) {
    if (c.tech_service_bucket === "st") st.push(c.id);
    else if (c.tech_service_bucket === "cr") cr.push(c.id);
  }
  return { st, cr };
}

/** Grupo en el que está marcada una categoría, o null si no está en ninguno. */
export function grupoDe(sel: SeleccionServicioTecnico, id: string): TechServiceBucket | null {
  if (sel.st.includes(id)) return "st";
  if (sel.cr.includes(id)) return "cr";
  return null;
}

/**
 * Marca o desmarca una categoría en un grupo. Si ya está en el otro grupo, devuelve
 * la misma selección sin tocarla. La interfaz ya la enseña desactivada, pero la regla
 * se aplica también aquí, porque la columna solo admite un grupo y el servidor
 * rechazaría la intersección. Para moverla de grupo hay que desmarcarla primero, así
 * nadie la cambia de grupo sin darse cuenta.
 *
 * La X de cada etiqueta (spec 2026-09-25) también pasa por esta función: se llama con
 * el grupo actual de la categoría, así que desmarca igual que el desplegable. Es el
 * único camino para desclasificar una categoría inactiva, porque los desplegables solo
 * listan las activas.
 */
export function alternarCategoria(
  sel: SeleccionServicioTecnico,
  grupo: TechServiceBucket,
  id: string
): SeleccionServicioTecnico {
  const actual = grupoDe(sel, id);
  if (actual !== null && actual !== grupo) return sel;
  const lista = sel[grupo];
  const nueva = actual === grupo ? lista.filter((x) => x !== id) : [...lista, id];
  return grupo === "st" ? { st: nueva, cr: sel.cr } : { st: sel.st, cr: nueva };
}

/**
 * Si la selección difiere de la de partida. Se compara como conjuntos: el orden de
 * las etiquetas no es un cambio que merezca guardar.
 */
export function haCambiado(inicial: SeleccionServicioTecnico, actual: SeleccionServicioTecnico): boolean {
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  return !igual(inicial.st, actual.st) || !igual(inicial.cr, actual.cr);
}
