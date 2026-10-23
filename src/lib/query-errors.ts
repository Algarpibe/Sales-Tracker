// Política de errores de lectura de react-query (FE-056). Solo se lanza al error
// boundary más cercano (el de la tarjeta, CardErrorBoundary) cuando la consulta no
// tiene datos que enseñar; si un refetch en segundo plano falla con datos previos, la
// tarjeta sigue mostrando lo último bueno en vez de convertirse en un error.
export function throwOnlyWithoutData(_error: unknown, query: { state: { data: unknown } }): boolean {
  return query.state.data === undefined;
}
