import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE } from "../constants";

/**
 * FE-059 / FE-060: los borrados de un clic piden confirmación, los botones de solo
 * icono tienen nombre accesible y la UI de categorías solo ofrece editar a quien el
 * servidor deja hacerlo (admin). Ninguna prueba borra nada: siempre se cancela, así
 * que la BD compartida queda como estaba. No hace login (usa los storageState).
 */

// Semilla e2e/db/seed-app.mjs: grupo «Ambiental» y categoría «Aguas».
const GRUPO = "Ambiental";
const CATEGORIA = "Aguas";

async function abrirCategorias(page: Page) {
  await page.goto("/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Categorías" })).toBeVisible();
  await expect(page.getByRole("cell", { name: CATEGORIA, exact: true })).toBeVisible();
}

test.describe("administrador", () => {
  test.use({ storageState: APPROVED_STATE });

  test("borrar una agrupación pide confirmación y cancelar la conserva", async ({ page }) => {
    await page.goto("/analytics");
    // Descripción de la tarjeta con datos: en el estado vacío hay dos botones de
    // configurar; con datos, uno solo.
    await expect(
      page.getByText("Distribución estratégica y evolución histórica por grupos de negocio.")
    ).toBeVisible();
    const configurar = page.getByRole("button", { name: "Configurar Agrupaciones" });
    await expect(configurar).toHaveCount(1);
    await configurar.click();

    const gestor = page.getByRole("dialog", { name: "Agrupaciones Personalizadas de Categorías" });
    const eliminar = gestor.getByRole("button", { name: `Eliminar ${GRUPO}` });
    await expect(eliminar).toBeVisible();
    // Los botones de solo icono de la fila se anuncian con nombre.
    await expect(gestor.getByRole("button", { name: `Editar ${GRUPO}` })).toBeVisible();
    await expect(gestor.getByRole("button", { name: `Bajar ${GRUPO}` })).toBeVisible();

    await eliminar.click();
    const confirmar = page.getByRole("dialog", { name: "¿Eliminar agrupación?" });
    await expect(confirmar).toBeVisible();
    await expect(confirmar).toContainText(GRUPO);

    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmar).toHaveCount(0);
    await expect(gestor.getByRole("button", { name: `Eliminar ${GRUPO}` })).toBeVisible();
  });

  test("las acciones de una categoría tienen nombre, se ven con el teclado y borrar pide confirmación", async ({ page }) => {
    await abrirCategorias(page);

    const editar = page.getByRole("button", { name: `Editar ${CATEGORIA}` });
    const eliminar = page.getByRole("button", { name: `Eliminar ${CATEGORIA}` });
    await expect(page.getByRole("button", { name: "Nueva", exact: true })).toBeVisible();
    await expect(editar).toBeVisible();

    // Ocultas hasta hover; al llegar con el foco, el contenedor se hace visible.
    await editar.focus();
    await expect(editar.locator("xpath=..")).toHaveCSS("opacity", "1");

    await eliminar.click();
    const confirmar = page.getByRole("dialog", { name: "¿Eliminar categoría?" });
    await expect(confirmar).toBeVisible();
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmar).toHaveCount(0);
    await expect(page.getByRole("cell", { name: CATEGORIA, exact: true })).toBeVisible();
  });
});

test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  // category-actions exige admin para crear, editar y desactivar.
  test("no ve los botones de crear, editar ni eliminar categorías", async ({ page }) => {
    await abrirCategorias(page);

    await expect(page.getByRole("button", { name: "Nueva", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Editar ${CATEGORIA}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Eliminar ${CATEGORIA}` })).toHaveCount(0);
  });
});
