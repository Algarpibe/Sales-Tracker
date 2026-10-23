import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/** Ruta + el texto exacto de su <h1>, leído de cada page.tsx. */
const ROUTES = [
  { path: "/home", heading: "Dashboard General" },
  { path: "/analytics", heading: /Análisis/i },
  { path: "/clientes", heading: "Ventas por cliente" },
  { path: "/clientes/Alfa%20Industrial", heading: "Alfa Industrial" },
  { path: "/articulos", heading: "Ventas por artículo" },
  { path: "/cliente-articulo", heading: "Ventas por cliente × artículo" },
  { path: "/cliente-categoria", heading: "Ventas por cliente × categoría" },
  { path: "/categories", heading: "Categorías" },
  { path: "/tablas", heading: "Tablas de Datos" },
  { path: "/settings", heading: /Ajustes|Configuración/i },
] as const;

/**
 * Errores de consola que NO cuentan como fallo. La lista se mantiene CORTA y
 * cada entrada lleva su motivo: una lista larga vacía el valor de la assertion.
 */
const IGNORED_CONSOLE = [
  // El favicon no existe en el entorno de test y su 404 no es un defecto del app.
  /favicon\.ico/,
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((rx) => rx.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

for (const route of ROUTES) {
  test(`${route.path} carga sin errores`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(route.path);

    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

    // El error boundary de Next se anuncia con este texto; si aparece, la página reventó.
    await expect(page.getByText("Application error")).toHaveCount(0);

    expect(errors, `Errores de consola en ${route.path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

/**
 * Regresión del React #418 intermitente en /tablas. React 19.2 revela en lote los
 * Suspense del HTML de servidor (`$RC` → `$RV`, hasta ~300 ms tras el primer pintado) y
 * el <Sidebar> del layout vive en uno: hidrata al revelarse. Si getMyProfile responde
 * antes, el perfil de admin añade «Usuarios» y el HTML ya no coincide. Se retrasa la
 * revelación para forzar esa carrera de forma determinista en vez de esperarla al azar.
 */
test("el sidebar hidrata sin errores aunque el perfil llegue antes que su Suspense", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    let reveal: ((...args: unknown[]) => void) | undefined;
    Object.defineProperty(w, "$RV", {
      configurable: true,
      set(fn: (...args: unknown[]) => void) { reveal = fn; },
      get() {
        return (...args: unknown[]) => {
          w.__revealDelayed = true;
          setTimeout(() => reveal?.(...args), 1500);
        };
      },
    });
  });
  const errors = collectConsoleErrors(page);

  await page.goto("/tablas");

  // El enlace de admin solo existe con el perfil cargado y el sidebar ya hidratado.
  await expect(page.getByRole("link", { name: "Usuarios", exact: true })).toBeVisible();
  // Si React deja de usar $RV la prueba no forzaría nada: que falle en vez de pasar en falso.
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__revealDelayed)).toBe(true);
  expect(errors, `Errores de consola:\n${errors.join("\n")}`).toEqual([]);
});
