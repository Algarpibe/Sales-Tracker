import { test, expect } from "@playwright/test";

/**
 * /api/health es público (fuera del matcher del middleware): el HEALTHCHECK de
 * Docker lo llama sin sesión. Se comprueba sin cookies que ambos niveles responden
 * 200 en vez de redirigir a /login, y que el cuerpo solo lleva estados: nada de
 * hosts, puertos, usuarios ni cadenas de conexión.
 */
const FUGAS = [/postgres/i, /127\.0\.0\.1/, /localhost/i, /:\d{4,5}\b/, /password/i, /error:/i];

test.use({ storageState: { cookies: [], origins: [] } });

test("liveness: GET /api/health responde 200 sin sesión", async ({ request }) => {
  const res = await request.get("/api/health", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const text = await res.text();
  expect(JSON.parse(text)).toEqual({ status: "ok" });
  for (const fuga of FUGAS) expect(text).not.toMatch(fuga);
});

test("readiness: GET /api/health?ready=1 comprueba BD y hub sin sesión", async ({ request }) => {
  const res = await request.get("/api/health?ready=1", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const text = await res.text();
  // El E2E arranca con HUB_DB_URL, así que el hub también se sondea.
  expect(JSON.parse(text)).toEqual({ status: "ok", db: "ok", hub: "ok" });
  for (const fuga of FUGAS) expect(text).not.toMatch(fuga);
});
