import { test, expect } from "@playwright/test";
import { APPROVED_STATE, YEAR_WITH_GAPS, CATEGORY_MISSING_IN_GAP_YEAR } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("un año con datos parciales no deja el gráfico roto", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // El selector de año (pestaña "Exploración", año A) no expone la palabra "año"
  // como nombre accesible: base-ui muestra solo el valor seleccionado en el
  // disparador (p. ej. "2026"), aunque cada opción de la lista sí lleva el
  // prefijo "A: " (p. ej. "A: 2026"). Es el primer combobox de la página.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: String(YEAR_WITH_GAPS) }).click();

  // El widget "Histórico Anual" (el que corrige el bug 9dc66ee) filtra categorías
  // con su propio selector, independiente del año de la página. La semilla deja
  // 2021 con ventas SOLO de 'Aguas': seleccionar 'Aire' reproduce el bucket
  // ausente para ese año dentro de la agrupación anual.
  await page.getByRole("button", { name: /Seleccionar Categorías/i }).click();
  await page.getByRole("option", { name: CATEGORY_MISSING_IN_GAP_YEAR, exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByText(CATEGORY_MISSING_IN_GAP_YEAR).first()).toBeVisible();

  // La página sigue viva: cabecera presente, el gráfico llegó a renderizar y no
  // hubo excepciones sin capturar.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(async () => {
    expect(await page.locator("svg.recharts-surface").count()).toBeGreaterThan(0);
  }).toPass();
  expect(crashes, `La página lanzó al filtrar ${YEAR_WITH_GAPS}:\n${crashes.join("\n")}`).toEqual([]);
});

test("cambiar de año no rompe el renderizado de los gráficos", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const year of [2024, 2023, 2022, 2021]) {
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: String(year) }).click();
    // Recharts monta en un <svg>: se espera a que exista al menos uno.
    await expect(async () => {
      expect(await page.locator("svg.recharts-surface").count()).toBeGreaterThan(0);
    }).toPass();
  }

  expect(crashes, `Excepciones al cambiar de año:\n${crashes.join("\n")}`).toEqual([]);
});
