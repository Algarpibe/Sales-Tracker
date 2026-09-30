import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, MACRO_SEED } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TITULO = "Ventas por cliente × categoría";

// Cliente inventado de e2e/db/seed-hub.mjs. En el año en curso tiene la factura de
// junio con los cinco artículos, así que sale con las tres categorías sembradas.
const CLIENTE = "Alfa Industrial";

/** Importes de las 4 macro-categorías en la fila de cabecera del cliente. */
async function totalesDelCliente(page: Page): Promise<string[]> {
  // El enlace solo aparece cuando han llegado las ventas y la clasificación: antes, la
  // tabla es un esqueleto.
  const enlace = page.getByRole("link", { name: CLIENTE, exact: true });
  await expect(enlace).toBeVisible();
  const celdas = await page.getByRole("row").filter({ has: enlace }).getByRole("cell").allTextContents();
  // La primera celda es el nombre; su colSpan cambia entre las dos páginas, las 4
  // últimas son siempre las macro-categorías.
  return celdas.slice(-4);
}

test("el total de un cliente coincide con el de la seccion de articulos", async ({ page }) => {
  // Dos páginas completas: más que el minuto por defecto en la máquina local.
  test.setTimeout(120_000);

  await page.goto("/cliente-articulo");
  await expect(page.getByRole("heading", { level: 1, name: "Ventas por cliente × artículo" })).toBeVisible();
  const enArticulos = await totalesDelCliente(page);

  await page.goto("/cliente-categoria");
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
  const enCategorias = await totalesDelCliente(page);

  expect(enCategorias).toEqual(enArticulos);
  // Que no sea una igualdad trivial: con la clasificación sembrada hay importe en Mano
  // de obra (Aguas), Consumibles y repuestos (Aire) y Equipos (Suelos), y nada en
  // Operaciones.
  expect(enCategorias.slice(0, 3).every((t) => t !== "$0")).toBe(true);
  expect(enCategorias[3]).toBe("$0");

  // Una fila por categoría sembrada.
  for (const categoria of [MACRO_SEED.mano_obra, MACRO_SEED.cr, MACRO_SEED.sinMarcar]) {
    await expect(page.getByRole("cell", { name: categoria, exact: true }).first()).toBeVisible();
  }
});

test("comparar anios muestra las columnas de los dos anios", async ({ page }) => {
  await page.goto("/cliente-categoria");
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
  // Espera a los datos antes de pulsar: así la página ya está hidratada y el clic no se
  // pierde.
  await expect(page.getByRole("link", { name: CLIENTE, exact: true })).toBeVisible();

  await page.getByRole("switch").click();

  const anio = new Date().getFullYear();
  await expect(page.getByRole("columnheader", { name: "Categoría", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: `Importe ${anio}`, exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: `Importe ${anio - 1}`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: CLIENTE, exact: true })).toBeVisible();
});
