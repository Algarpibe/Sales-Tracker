import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TICKETS = "Tickets de Servicio Técnico en plazo";
/** Celda de febrero: la 0 es la etiqueta del KPI, así que el índice es el número del mes. */
const CELDA_FEBRERO = 2;

function tarjetaMetas(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
}

/**
 * Deja las metas del total como las siembra e2e/db/seed-app.mjs: ventas nuevos 60,
 * ventas existentes 40 y tickets sin meta ni peso, así que sin plazo guardado. Otros
 * specs comparten la base en la misma ejecución y esperan el 60,0 % de febrero.
 */
async function restaurarMetas(page: Page) {
  await page.goto("/settings");
  const card = tarjetaMetas(page);
  await expect(card).toBeVisible();
  await card.getByLabel(`Meta de ${TICKETS}`, { exact: true }).fill("");
  await card.getByLabel(`Peso de ${TICKETS}`, { exact: true }).fill("");
  await card.getByLabel("Peso de Ventas clientes nuevos", { exact: true }).fill("60");
  await card.getByLabel("Peso de Ventas clientes existentes", { exact: true }).fill("40");
  await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("12");
  await card.getByRole("button", { name: "Guardar metas" }).click();
  await expect(page.getByText("Metas guardadas")).toBeVisible();

  await page.reload();
  const tras = tarjetaMetas(page);
  await expect(tras.getByText("Suma de pesos: 100%")).toBeVisible();
  await expect(tras.getByLabel(`Plazo de ${TICKETS}`, { exact: true })).toHaveValue("12");
  await expect(tras.getByLabel(`Peso de ${TICKETS}`, { exact: true })).toHaveValue("");
}

test("cambiar el plazo del anio cambia la cifra de tickets de la tabla y su detalle", async ({ page }) => {
  // Dos pantallas, un guardado y la restauración: más que el minuto por defecto.
  test.setTimeout(120_000);
  try {
    await page.goto("/settings");
    const card = tarjetaMetas(page);
    await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

    // El plazo se guarda en la fila de tickets, así que hay que darle meta y peso.
    // Ventas nuevos baja de 60 a 50 para que la suma siga en 100.
    await card.getByLabel(`Meta de ${TICKETS}`, { exact: true }).fill("80");
    await card.getByLabel(`Peso de ${TICKETS}`, { exact: true }).fill("10");
    await card.getByLabel("Peso de Ventas clientes nuevos", { exact: true }).fill("50");
    await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("8");
    await card.getByRole("button", { name: "Guardar metas" }).click();
    await expect(page.getByText("Metas guardadas")).toBeVisible();

    await page.goto("/analytics");
    await page.getByRole("tab", { name: "Comercial" }).click();
    const tabla = page.locator('[data-slot="card"]', { hasText: "KPIs comerciales" });
    await expect(tabla).toBeVisible();

    // Febrero de la semilla (e2e/db/seed-hub.mjs) con plazo 8: 2 h y 1 h en plazo; 8 h
    // (justo en la frontera: el plazo es «menos de»), 18 h y 18 h fuera. 2 / 5 = 40 %.
    // Con el plazo de 12 era 60 %. Se mira el botón y no la celda: con meta, la celda
    // lleva además el cumplimiento debajo.
    const fila = tabla.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
    const boton = fila.getByRole("cell").nth(CELDA_FEBRERO).getByRole("button");
    await expect(boton).toHaveText("40.0%");

    // El detalle clasifica con el mismo plazo y lo dice.
    await boton.click();
    const dialogo = page.getByRole("dialog", { name: /Tickets en plazo/ });
    await expect(dialogo).toContainText("menos de 8 h laborables");
    await expect(dialogo.getByText("2 en plazo de 5 → 40.0%")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();

    // Con un comercial elegido, sus metas no traen plazo: la tabla usa el del total.
    await tabla.getByLabel("Propietario").click();
    await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
    await expect(boton).toHaveText("40.0%");
  } finally {
    await restaurarMetas(page);
  }
});
