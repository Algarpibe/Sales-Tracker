import { test, expect, type Locator } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

// formatUSD usa en-US ("$1,234.56"): se quitan el símbolo y los separadores de miles.
function parseUsd(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ""));
}

// Valor de un tile de KPI de "Margen bruto estimado": el tile es un div con dos
// hijos, la etiqueta y el valor.
function tileValue(panel: Locator, label: string): Locator {
  return panel.getByText(label, { exact: true }).locator("..").locator("div").nth(1);
}

test("Comercial y Margen muestran la barra de periodo", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Comercial ya tiene la barra: esta vuelta protege la extracción a PeriodBar.
  // Margen no la tiene: es la vuelta que falla antes de implementar.
  for (const name of ["Comercial", "Margen"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    // base-ui solo renderiza el panel activo, con aria-labelledby hacia su pestaña.
    const panel = page.getByRole("tabpanel", { name, exact: true });
    // .first(): la barra es lo primero del panel; alguna tarjeta puede traer su
    // propio conmutador o selector más abajo.
    await expect(panel.getByRole("tab", { name: /\bOV\b/ }).first()).toBeVisible();
    await expect(panel.getByRole("tab", { name: /\bFAC\b/ }).first()).toBeVisible();
    await expect(panel.getByRole("combobox").first()).toBeVisible();
  }
});

test("en Margen, el tipo y el año cambian los datos", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Margen", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Margen", exact: true });

  const facTab = panel.getByRole("tab", { name: /\bFAC\b/ }).first();
  const ovTab = panel.getByRole("tab", { name: /\bOV\b/ }).first();
  const ventas = tileValue(panel, "Ventas (bienes)");

  // Tipo. "Margen bruto estimado" agrega todos los años, así que solo depende del
  // tipo. En la semilla del hub (e2e/db/seed-hub.mjs) las órdenes cubren los 12
  // meses y las facturas solo los pares, con las mismas líneas: con OV las
  // ventas son estrictamente mayores que con FAC.
  await expect(facTab).toBeVisible();
  await facTab.click();
  // aria-selected sale del mismo render que la prop de la tarjeta: a partir de
  // aquí el tile ya corresponde a FAC.
  await expect(facTab).toHaveAttribute("aria-selected", "true");
  await expect(ventas).toBeVisible();
  const fac = parseUsd(await ventas.innerText());
  expect(fac).toBeGreaterThan(0);

  await ovTab.click();
  await expect(ovTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => parseUsd(await ventas.innerText())).toBeGreaterThan(fac);

  // Año: el título de "Margen por artículo" muestra el año elegido.
  await panel.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Año 2024" }).click();
  await expect(panel.getByText("Margen por artículo 2024")).toBeVisible();

  expect(crashes, `Excepciones en la pestaña Margen:\n${crashes.join("\n")}`).toEqual([]);
});
