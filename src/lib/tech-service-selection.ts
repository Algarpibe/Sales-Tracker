import type { TechServiceBucket, TechServiceCategory } from "@/types/database";
import {
  alternarCategoria as alternar,
  grupoDe as grupoGenerico,
  haCambiado as cambiado,
  seleccionPorGrupo,
  type Seleccion,
} from "@/lib/seleccion-grupos";

// La lógica de grupos es común con «Macro-categorías» y vive en seleccion-grupos. Este
// módulo conserva los nombres que ya usaban la tarjeta de Servicio Técnico y sus tests.

/** Selección en curso de la tarjeta «Categorías de Servicio Técnico». */
export type SeleccionServicioTecnico = Seleccion<TechServiceBucket>;

/** Los dos grupos de Servicio Técnico, en el orden en que los pinta la tarjeta. */
export const GRUPOS_SERVICIO_TECNICO: readonly TechServiceBucket[] = ["st", "cr"];

/** Estado inicial a partir de lo guardado, en el orden en que llegan las categorías. */
export function seleccionInicial(
  categorias: Pick<TechServiceCategory, "id" | "tech_service_bucket">[]
): SeleccionServicioTecnico {
  return seleccionPorGrupo(
    GRUPOS_SERVICIO_TECNICO,
    categorias.map((c) => ({ id: c.id, grupo: c.tech_service_bucket }))
  );
}

// Envoltorios con el tipo fijado a los dos grupos de Servicio Técnico. Un simple
// reexport dejaría el genérico libre y TypeScript inferiría el grupo a partir de la
// llamada ("st" a secas), rompiendo la firma que ya tenían la tarjeta y sus tests.
export function grupoDe(sel: SeleccionServicioTecnico, id: string): TechServiceBucket | null {
  return grupoGenerico(sel, id);
}

export function alternarCategoria(
  sel: SeleccionServicioTecnico,
  grupo: TechServiceBucket,
  id: string
): SeleccionServicioTecnico {
  return alternar(sel, grupo, id);
}

export function haCambiado(inicial: SeleccionServicioTecnico, actual: SeleccionServicioTecnico): boolean {
  return cambiado(inicial, actual);
}
