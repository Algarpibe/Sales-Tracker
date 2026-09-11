import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("el Histórico Anual pinta datos pese al registro de un año anterior a FIRST_YEAR (bug 9dc66ee)", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // El widget "Histórico Anual" arranca sin categorías seleccionadas: no pinta
  // barras hasta elegir alguna. La semilla incluye un registro de 2020
  // (YEAR_BEFORE_FIRST_YEAR en e2e/constants.ts), anterior al FIRST_YEAR = 2021
  // que usa este componente: esa es la condición exacta del bug 9dc66ee. Con la
  // guarda, el componente ignora ese registro y agrega 2021-2024 con
  // normalidad; sin ella, el TypeError al escribir en el bucket inexistente
  // (annualGrouped[2020] es undefined) se traga silenciosamente en el catch del
  // fetch y el gráfico queda vacío — sin lanzar un error de página.
  await page.getByRole("button", { name: /Seleccionar Categorías/i }).click();
  await page.getByRole("option", { name: "Aire", exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Aire").first()).toBeVisible();

  // Card de shadcn/ui: `data-slot="card"` es un atributo estructural de la
  // librería (no una clase de Tailwind), estable frente a cambios de estilo.
  // Se usa para acotar la comprobación al widget "Histórico Anual" y no a
  // cualquier otro gráfico de la página.
  const historicalCard = page.locator('[data-slot="card"]', { hasText: "Histórico Anual" });

  // El punto real del test: con la guarda, recharts pinta barras
  // (.recharts-bar-rectangle) dentro del svg; sin ella, currentChartData queda
  // vacío y el svg solo trae ejes y grid, sin ninguna barra. Nótese que
  // svg.recharts-surface SIEMPRE existe (incluso vacío, con un <rect> interno
  // del clipPath): por eso el chequeo tiene que ser sobre las barras mismas,
  // no sobre la mera presencia del <svg>.
  await expect(async () => {
    const bars = await historicalCard.locator("svg.recharts-surface .recharts-bar-rectangle").count();
    expect(bars).toBeGreaterThan(0);
  }).toPass();

  // La página sigue viva y no hubo excepciones sin capturar.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(crashes, `La página lanzó al cargar el Histórico Anual:\n${crashes.join("\n")}`).toEqual([]);
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

test("el Mix por macro-categoría se pinta con barras apiladas", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Comercial", exact: true }).click();

  // Tarjeta acotada por su título con `data-slot="card"`, como en el test del
  // Histórico Anual, para no contar barras de otros gráficos de la pestaña.
  const mixCard = page.locator('[data-slot="card"]', { hasText: "Mix por macro-categoría (evolución anual)" });
  await expect(mixCard).toBeVisible();

  // Primero se espera a que haya barras: garantiza que el gráfico ya se pintó.
  // Con la semilla, todas las categorías caen en "Equipos", así que hay una
  // barra de un solo tramo por año.
  await expect(async () => {
    expect(await mixCard.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  // Con el gráfico ya pintado, no puede quedar ninguna área apilada.
  await expect(mixCard.locator(".recharts-area")).toHaveCount(0);
});
