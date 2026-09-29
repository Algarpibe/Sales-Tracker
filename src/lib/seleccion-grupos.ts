/**
 * Selección en curso de una tarjeta de Configuración que reparte categorías en grupos
 * excluyentes: ids de categoría de cada grupo. La usan «Categorías de Servicio Técnico»
 * (dos grupos) y «Macro-categorías» (cuatro). Vive fuera de los componentes para poder
 * testearla: vitest corre en node y no hay librería de tests de componentes.
 */
export type Seleccion<G extends string> = Record<G, string[]>;

/**
 * Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. Un
 * valor que no está en `grupos` se ignora: la columna tiene un CHECK, pero un valor
 * inesperado no debe crear un grupo que la tarjeta no pinta.
 */
export function seleccionPorGrupo<G extends string>(
  grupos: readonly G[],
  categorias: { id: string; grupo: string | null }[]
): Seleccion<G> {
  const sel = Object.fromEntries(grupos.map((g) => [g, [] as string[]])) as Seleccion<G>;
  for (const c of categorias) {
    if (c.grupo !== null && (grupos as readonly string[]).includes(c.grupo)) {
      sel[c.grupo as G].push(c.id);
    }
  }
  return sel;
}

/** Grupo en el que está marcada una categoría, o null si no está en ninguno. */
export function grupoDe<G extends string>(sel: Seleccion<G>, id: string): G | null {
  for (const g of Object.keys(sel) as G[]) {
    if (sel[g].includes(id)) return g;
  }
  return null;
}

/**
 * Marca o desmarca una categoría en un grupo. Si ya está en otro grupo, devuelve la
 * misma selección sin tocarla. La interfaz ya la enseña desactivada, pero la regla se
 * aplica también aquí, porque la columna solo admite un grupo y el servidor rechazaría
 * la intersección. Para moverla de grupo hay que desmarcarla primero, así nadie la
 * cambia de grupo sin darse cuenta.
 *
 * La X de cada etiqueta también pasa por esta función: se llama con el grupo actual de
 * la categoría, así que desmarca igual que el desplegable. Es el único camino para
 * desclasificar una categoría inactiva, porque los desplegables solo listan las activas.
 */
export function alternarCategoria<G extends string>(
  sel: Seleccion<G>,
  grupo: G,
  id: string
): Seleccion<G> {
  const actual = grupoDe(sel, id);
  if (actual !== null && actual !== grupo) return sel;
  const lista = sel[grupo];
  const nueva = actual === grupo ? lista.filter((x) => x !== id) : [...lista, id];
  return { ...sel, [grupo]: nueva } as Seleccion<G>;
}

/**
 * Si la selección difiere de la de partida. Se compara como conjuntos: el orden de las
 * etiquetas no es un cambio que merezca guardar.
 */
export function haCambiado<G extends string>(inicial: Seleccion<G>, actual: Seleccion<G>): boolean {
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  return (Object.keys(inicial) as G[]).some((g) => !igual(inicial[g], actual[g]));
}
