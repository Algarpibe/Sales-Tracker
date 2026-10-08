import { test, expect, type Locator, type Page } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TITULO_GRUPOS = "Evolución Histórica por Grupo";

// La semilla del hub (e2e/db/seed-hub.mjs) llega hasta el año en curso, y la tarjeta
// abre las vistas trimestral y mensual en el último año con datos.
const ANIO = String(new Date().getFullYear());

// Tarjeta acotada por su título con `data-slot="card"`, como en charts.spec.ts. Con
// expresión regular y no con texto: `hasText` con un texto no distingue mayúsculas, y la
// descripción de «Análisis por Agrupaciones Personalizadas» («…y evolución histórica por
// grupos de negocio.») casaría también con el título de la tarjeta de grupos.
function tarjeta(page: Page, titulo: string) {
  return page.locator('[data-slot="card"]', { hasText: new RegExp(titulo) });
}

// svg.recharts-surface existe aunque el gráfico esté vacío: hay que mirar las barras.
async function esperarBarras(card: Locator) {
  await expect(async () => {
    expect(await card.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
}

test("la tarjeta de grupos sigue funcionando", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const card = tarjeta(page, TITULO_GRUPOS);
  await expect(card).toBeVisible();

  // La semilla (e2e/db/seed-app.mjs) tiene dos grupos, Ambiental y Consultoria: «los
  // tres primeros» son los dos.
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await expect(
    card.getByText("Tendencia anual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Vista mensual: aparece el selector de año y la descripción cambia.
  const anio = card.getByRole("button", { name: ANIO, exact: true });
  await expect(anio).toHaveCount(0);
  await card.getByRole("tab", { name: "Mensual", exact: true }).click();
  await expect(anio).toBeVisible();
  await expect(
    card.getByText("Tendencia mensual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Quitar un grupo y volver a añadirlo. El desplegable se pinta fuera de la tarjeta.
  await card.getByRole("button", { name: "2 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "1 Grupos Seleccionados" })).toBeVisible();

  await card.getByRole("button", { name: "1 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await esperarBarras(card);

  expect(crashes, `Excepciones en la tarjeta de grupos:\n${crashes.join("\n")}`).toEqual([]);
});
