import { test, expect, type APIResponse, type Page } from "@playwright/test";
import { APPROVED_STATE, CATEGORIES, HISTORICAL_CUSTOMER, PENDING_STATE } from "../constants";

/**
 * Lecturas por GET /api/data (DATA-043). Ninguna prueba hace login: reutilizan los
 * storageState de auth.setup.ts y no gastan presupuesto de sign-in.
 *
 * - Sin sesión o sin aprobar, el proxy responde 401/403 en JSON (no una redirección a
 *   /login, que fetch() seguiría hasta el HTML de esa página).
 * - Con sesión aprobada, JSON privado y sin caché.
 * - DATA-046: la lectura filtrada por cliente devuelve exactamente las filas de ese
 *   cliente que trae la lectura de toda la empresa, contra el hub sembrado de verdad.
 */

const YEAR = new Date().getFullYear();

async function json(res: APIResponse) {
  expect(res.headers()["content-type"] ?? "").toContain("application/json");
  return res.json();
}

test.describe("sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("401 JSON en vez de redirigir a /login", async ({ page }) => {
    const res = await page.request.get(`/api/data/customer-item?tipo=INVOICE&anio=${YEAR}`, { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(res.headers()["location"]).toBeUndefined();
    expect(await json(res)).toEqual({ error: "Debes iniciar sesión.", code: "UNAUTHORIZED" });
  });
});

test.describe("cuenta pendiente de aprobación", () => {
  test.use({ storageState: PENDING_STATE });

  test("403 JSON en vez de redirigir a /waiting-approval", async ({ page }) => {
    const res = await page.request.get("/api/data/categories", { maxRedirects: 0 });
    expect(res.status()).toBe(403);
    expect(await json(res)).toMatchObject({ code: "NOT_APPROVED" });
  });
});

test.describe("cuenta aprobada", () => {
  test.use({ storageState: APPROVED_STATE });

  test("200 JSON privado y sin caché", async ({ page }) => {
    const res = await page.request.get("/api/data/categories", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    const cats = (await json(res)) as { name: string }[];
    expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining([...CATEGORIES]));
  });

  test("400 JSON con un filtro inválido", async ({ page }) => {
    const res = await page.request.get("/api/data/customer-item?tipo=INVOICE&anio=1999");
    expect(res.status()).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION" });
  });

  async function filas<T extends { customer: string }>(page: Page, resource: string, query: string): Promise<T[]> {
    const res = await page.request.get(`/api/data/${resource}?${query}`);
    expect(res.status()).toBe(200);
    return (await json(res)) as T[];
  }

  const cliente = `customer=${encodeURIComponent(HISTORICAL_CUSTOMER)}`;
  const casos: [string, string][] = [
    ["customer-sales", `tipo=INVOICE&desdeAnio=2015&hastaAnio=${YEAR}&includeHistory=true`],
    ["customer-sales", `tipo=SALES_ORDER&desdeAnio=2015&hastaAnio=${YEAR}&includeHistory=true`],
    ["customer-item", `tipo=INVOICE&anio=${YEAR}`],
    ["customer-month", `tipo=INVOICE&anio=${YEAR}`],
    ["margin-by-customer", `tipo=INVOICE&anio=${YEAR}`],
  ];

  for (const [resource, query] of casos) {
    test(`DATA-046: ${resource} por cliente = filas de ese cliente en la lectura de la empresa (${query})`, async ({ page }) => {
      const empresa = await filas(page, resource, query);
      const uno = await filas(page, resource, `${query}&${cliente}`);
      const esperado = empresa.filter((r) => r.customer === HISTORICAL_CUSTOMER);
      const orden = (a: object, b: object) => JSON.stringify(a).localeCompare(JSON.stringify(b));
      expect([...uno].sort(orden)).toEqual([...esperado].sort(orden));
    });
  }
});
