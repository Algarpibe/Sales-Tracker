import { HUB_COMPANY_FORBIDDEN_MESSAGE, isHubCompanyForbidden, isRateLimited, RATE_LIMITED_MESSAGE } from "@/lib/errors";

// Política de errores de lectura de react-query (FE-056). Solo se lanza al error
// boundary más cercano (el de la tarjeta, CardErrorBoundary) cuando la consulta no
// tiene datos que enseñar; si un refetch en segundo plano falla con datos previos, la
// tarjeta sigue mostrando lo último bueno en vez de convertirse en un error.
export function throwOnlyWithoutData(_error: unknown, query: { state: { data: unknown } }): boolean {
  return query.state.data === undefined;
}

// Un reintento, como el `retry: 1` de siempre, salvo con el límite por usuario
// (SEC-006): reintentar al instante sería otra petición contra el mismo límite.
export function retryUnlessRateLimited(failureCount: number, error: unknown): boolean {
  return !isRateLimited(error) && failureCount < 1;
}

export const READ_ERROR_MESSAGE = "No se pudieron cargar los datos.";

// Texto del aviso de una lectura fallida: el genérico (nunca el detalle del error),
// salvo con el límite por usuario, que explica que basta con esperar, y con la empresa
// sin acceso al hub (SEC-035), que explica por qué no hay datos. Ni el 429 ni ese 403
// cierran la sesión ni redirigen: solo cambian este texto.
export function readErrorMessage(error: unknown): string {
  if (isRateLimited(error)) return RATE_LIMITED_MESSAGE;
  if (isHubCompanyForbidden(error)) return HUB_COMPANY_FORBIDDEN_MESSAGE;
  return READ_ERROR_MESSAGE;
}
