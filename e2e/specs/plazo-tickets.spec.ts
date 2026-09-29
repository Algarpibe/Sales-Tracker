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
  // Si el test falló antes de guardar, la base ya está como la semilla y el botón,
  // sin cambios que guardar, está apagado: no hay nada que restaurar.
  const guardar = card.getByRole("button", { name: "Guardar metas" });
  if (await guardar.isEnabled()) {
    await guardar.click();
    await expect(page.getByText("Metas guardadas")).toBeVisible();
  }

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
    // Lo guardado ya es lo que se ve: el botón se apaga hasta el siguiente cambio.
    await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();

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

    // Con un comercial elegido manda su propio plazo, no el del total: la semilla no le
    // guarda ninguno, así que vale el de por defecto (12 h) y febrero vuelve al 60 %.
    await tabla.getByLabel("Propietario").click();
    await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
    await expect(boton).toHaveText("60.0%");
  } finally {
    await restaurarMetas(page);
  }
});

/**
 * Deja el plazo del comercial en el de por defecto. La pantalla no puede vaciar un
 * ámbito (hay que enviar al menos un KPI), así que la fila de tickets se queda con su
 * meta y su peso; con 12 h mide igual que sin plazo guardado. Ningún otro spec usa las
 * metas de este comercial, y la ejecución completa resiembra la base antes de empezar.
 */
async function restaurarPlazoComercial(page: Page, comercial: string) {
  await page.goto("/settings");
  const card = tarjetaMetas(page);
  await expect(card).toBeVisible();
  await card.getByLabel("Ámbito").click();
  await page.getByRole("option", { name: comercial }).click();
  // Esperar a sus metas antes de tocar el campo: el formulario se remonta al cargarlas.
  await expect(card.getByText(/Suma de pesos: (0|100)%/)).toBeVisible();
  await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("12");
  const guardar = card.getByRole("button", { name: "Guardar metas" });
  if (await guardar.isEnabled()) {
    await guardar.click();
    await expect(page.getByText("Metas guardadas")).toBeVisible();
  }
}

test("con un comercial elegido la cifra de tickets usa su plazo y no el del total", async ({ page }) => {
  test.setTimeout(120_000);
  // Otro comercial que el del test de arriba, para que cada uno mire su propio ámbito.
  const comercial = SALESPEOPLE[1];
  try {
    await page.goto("/settings");
    const card = tarjetaMetas(page);
    await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
    await card.getByLabel("Ámbito").click();
    await page.getByRole("option", { name: comercial }).click();
    await expect(card.getByText(/Suma de pesos: (0|100)%/)).toBeVisible();

    // El plazo se guarda en la fila de tickets del comercial: meta y todo el peso.
    await card.getByLabel(`Meta de ${TICKETS}`, { exact: true }).fill("80");
    await card.getByLabel(`Peso de ${TICKETS}`, { exact: true }).fill("100");
    await card.getByLabel(`Plazo de ${TICKETS}`, { exact: true }).fill("8");
    await card.getByRole("button", { name: "Guardar metas" }).click();
    await expect(page.getByText("Metas guardadas")).toBeVisible();
    await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();

    await page.goto("/analytics");
    await page.getByRole("tab", { name: "Comercial" }).click();
    const tabla = page.locator('[data-slot="card"]', { hasText: "KPIs comerciales" });
    await expect(tabla).toBeVisible();
    const fila = tabla.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
    const boton = fila.getByRole("cell").nth(CELDA_FEBRERO).getByRole("button");

    // El total no tiene plazo guardado: 12 h, 3 de 5 en plazo en febrero (seed-hub.mjs).
    await expect(boton).toHaveText("60.0%");

    // Con el comercial, su plazo de 8 h: 2 de 5. Los tickets siguen siendo de compañía.
    await tabla.getByLabel("Propietario").click();
    await page.getByRole("option", { name: comercial }).click();
    await expect(boton).toHaveText("40.0%");

    await boton.click();
    const dialogo = page.getByRole("dialog", { name: /Tickets en plazo/ });
    await expect(dialogo).toContainText("menos de 8 h laborables");
    await expect(dialogo.getByText("2 en plazo de 5 → 40.0%")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
  } finally {
    await restaurarPlazoComercial(page, comercial);
  }
});
