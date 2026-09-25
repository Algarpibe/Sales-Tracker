import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, TECH_SERVICE_SEED } from "../constants";

const TITULO = "Categorías de Servicio Técnico";
const ST = "Categorías de ST (mano de obra)";
const CR = "Categorías de C&R (consumibles y repuestos)";

function tarjeta(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: TITULO });
}

// El lector va primero: el test del admin cambia la clasificacion guardada, y la
// base solo se reinicia al principio de cada ejecucion de test:e2e. Aun asi, el
// test del admin deja la semilla como estaba al terminar, para no depender del orden.
test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("ve la clasificacion pero no puede cambiarla", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    await expect(card.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.st)).toBeVisible();
    await expect(card.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();

    // Sin desplegables, sin quitar etiquetas y sin boton de guardar.
    await expect(card.getByRole("button", { name: `Elegir ${ST}` })).toHaveCount(0);
    await expect(card.getByRole("button", { name: `Elegir ${CR}` })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /^Quitar / })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Guardar categorías" })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: APPROVED_STATE });

  test("una categoria de un grupo aparece desactivada en el otro", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: `Elegir ${ST}` }).click();
    // Regex y no texto exacto: el nombre accesible junta los dos span sin espacio
    // garantizado entre el nombre y la nota.
    const enCr = page.getByRole("option", { name: new RegExp(`^${TECH_SERVICE_SEED.cr}\\s*en C&R$`) });
    await expect(enCr).toBeVisible();
    await expect(enCr).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
  });

  test("mover una categoria de grupo persiste al recargar", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    const guardar = card.getByRole("button", { name: "Guardar categorías" });
    // Sin cambios no hay nada que guardar.
    await expect(guardar).toBeDisabled();

    // Para cambiarla de grupo hay que sacarla primero de C&R...
    await card.getByRole("button", { name: `Elegir ${CR}` }).click();
    await page.getByRole("option", { name: TECH_SERVICE_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toHaveCount(0);

    // ...y despues marcarla en ST, donde ya no sale desactivada.
    await card.getByRole("button", { name: `Elegir ${ST}` }).click();
    await page.getByRole("option", { name: TECH_SERVICE_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();

    await guardar.click();
    await expect(page.getByText("Clasificación guardada")).toBeVisible();

    await page.reload();
    const tras = tarjeta(page);
    await expect(tras.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();
    await expect(tras.getByRole("list", { name: ST }).getByText(TECH_SERVICE_SEED.st)).toBeVisible();
    await expect(tras.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toHaveCount(0);

    // Deja la semilla como estaba: otros specs comparten la base en la misma
    // ejecucion y no deben depender de que este corra el ultimo.
    await tras.getByRole("button", { name: `Quitar ${TECH_SERVICE_SEED.cr} de ST` }).click();
    await tras.getByRole("button", { name: `Elegir ${CR}` }).click();
    await page.getByRole("option", { name: TECH_SERVICE_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(tras.getByRole("list", { name: CR }).getByText(TECH_SERVICE_SEED.cr)).toBeVisible();
    await tras.getByRole("button", { name: "Guardar categorías" }).click();
    await expect(page.getByText("Clasificación guardada")).toBeVisible();
    await expect(tras.getByRole("button", { name: "Guardar categorías" })).toBeDisabled();
  });
});
