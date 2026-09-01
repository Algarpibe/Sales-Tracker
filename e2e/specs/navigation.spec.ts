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
