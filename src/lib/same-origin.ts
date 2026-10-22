// Comprobación de mismo origen para route handlers que escriben (SEC-037). Las Server
// Actions ya traen la suya de Next; un route handler propio (p. ej. POST /api/avatar)
// solo tenía SameSite=Lax, que no cubre peticiones del mismo sitio (otro subdominio).

/**
 * Origen público de la app. Detrás del proxy, `req.nextUrl.origin` puede ser la
 * dirección interna del contenedor, así que manda BETTER_AUTH_URL (obligatoria en
 * producción). Sin ella (dev/E2E) o si no es una URL válida, el de la propia petición.
 */
export function expectedOrigin(baseUrl: string | undefined, requestOrigin: string): string {
  if (baseUrl) {
    try {
      return new URL(baseUrl).origin;
    } catch {
      // URL inválida: se usa el origen de la petición.
    }
  }
  return requestOrigin;
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

/**
 * Decide si una petición que escribe viene de la propia app.
 *  - Con cabecera Origin: tiene que coincidir con el origen esperado ("null" o mal
 *    formado se rechaza).
 *  - Sin Origin: se mira Sec-Fetch-Site; solo valen "same-origin" y "none".
 *  - Sin ninguna de las dos (cliente que no es navegador): se deja pasar; igualmente
 *    necesita una cookie de sesión válida, que un sitio ajeno no puede adjuntar.
 */
export function isSameOriginRequest(input: {
  origin: string | null;
  secFetchSite: string | null;
  expected: string;
}): boolean {
  const { origin, secFetchSite, expected } = input;
  if (origin !== null) {
    return normalizeOrigin(origin) === expected;
  }
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  return true;
}
