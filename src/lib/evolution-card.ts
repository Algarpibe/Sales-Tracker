/**
 * Qué series salen marcadas al abrir una tarjeta de evolución: las tres primeras (los
 * grupos pueden ser muchos y el gráfico apilado se vuelve ilegible) o todas (las
 * macro-categorías son siempre cuatro).
 */
export type SeleccionInicial = "primeras3" | "todas";

export function seleccionInicialIds(
  rows: readonly { groupId: string }[],
  modo: SeleccionInicial
): string[] {
  const elegidas = modo === "todas" ? rows : rows.slice(0, 3);
  return elegidas.map((r) => r.groupId);
}
