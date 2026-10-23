// Casado de categorías del zoho-hub con las de la app (AI-082). En el hub la categoría
// llega por NOMBRE; se compara en minúsculas y lo que no existe en la app se descarta.
// Lo usaban, repetido, getSalesData y el análisis de agrupaciones.
export function indexCategoriesByName<T extends { name: string }>(cats: readonly T[]): Map<string, T> {
  return new Map(cats.map((c) => [c.name.toLowerCase(), c]));
}

export function findByHubCategoryName<T>(index: Map<string, T>, hubCategoryName: string): T | undefined {
  return index.get(hubCategoryName.toLowerCase());
}
