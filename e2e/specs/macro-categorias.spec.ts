import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, MACRO_SEED } from "../constants";

// Nombres de los grupos: los de BUCKET_LABELS (src/lib/customer-item.ts).
const MANO_OBRA = "Mano de obra";
const CR = "Consumibles y repuestos";
const EQUIPOS = "Equipos";
const OPERACIONES = "Operaciones";
const GUARDAR = "Guardar macro-categorías";

// Busca la tarjeta por su título. Ninguna otra tarjeta de /settings contiene
// «Macro-categorías», y esta no contiene «Categorías de Servicio Técnico», que es lo que
// busca el spec de esa tarjeta.
function tarjeta(page: Page) {
  return page.locator('[data-slot="card"]', { hasText: "Macro-categorías" });
}

/**
 * Deja la clasificación como la siembra e2e/db/seed-app.mjs: Aire en Consumos y
 * repuestos. Otros specs comparten la base en la misma ejecución y no deben depender de
 * que este corra el último. Si el test falló antes de guardar, no hay nada que guardar y
 * el botón está apagado.
 */
async function restaurarMacro(page: Page) {
  await page.goto("/settings");
  const card = tarjeta(page);
  // Espera a que la tarjeta tenga datos: sin esto, los count() de abajo mirarían listas
  // que aún no se han pintado.
  await expect(card.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();

  if ((await card.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr).count()) > 0) {
    await card.getByRole("button", { name: `Quitar ${MACRO_SEED.cr} de ${OPERACIONES}` }).click();
  }
  if ((await card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr).count()) === 0) {
    await card.getByRole("button", { name: `Elegir ${CR}` }).click();
    await page.getByRole("option", { name: MACRO_SEED.cr, exact: true }).click();
    await page.keyboard.press("Escape");
  }
  const guardar = card.getByRole("button", { name: GUARDAR });
  if (await guardar.isEnabled()) {
    await guardar.click();
    await expect(page.getByText("Macro-categorías guardadas")).toBeVisible();
  }

  await page.reload();
  const tras = tarjeta(page);
  await expect(tras.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
  await expect(tras.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toHaveCount(0);
}

// El lector va primero: no cambia nada, y así no depende de que la restauración del
// admin haya ido bien.
test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("ve las macro-categorias pero no puede cambiarlas", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    await expect(card.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();
    await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
    // Suelos no está marcada: no sale en ninguna lista, y cuenta como Equipos.
    await expect(card.getByText(MACRO_SEED.sinMarcar)).toHaveCount(0);

    // Sin desplegables, sin quitar etiquetas y sin botón de guardar.
    for (const grupo of [MANO_OBRA, CR, EQUIPOS, OPERACIONES]) {
      await expect(card.getByRole("button", { name: `Elegir ${grupo}` })).toHaveCount(0);
    }
    await expect(card.getByRole("button", { name: /^Quitar / })).toHaveCount(0);
    await expect(card.getByRole("button", { name: GUARDAR })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: APPROVED_STATE });

  test("una categoria marcada en un grupo aparece desactivada en los demas", async ({ page }) => {
    await page.goto("/settings");
    const card = tarjeta(page);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: `Elegir ${MANO_OBRA}` }).click();
    // Regex y no texto exacto: el nombre accesible junta los dos span sin espacio
    // garantizado entre el nombre y la nota.
    const enCr = page.getByRole("option", { name: new RegExp(`^${MACRO_SEED.cr}\\s*en ${CR}$`) });
    await expect(enCr).toBeVisible();
    await expect(enCr).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
  });

  test("mover una categoria de macro-categoria persiste al recargar", async ({ page }) => {
    // Un guardado, una recarga y la restauración: más que el minuto por defecto en la
    // máquina local.
    test.setTimeout(120_000);
    try {
      await page.goto("/settings");
      const card = tarjeta(page);
      await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toBeVisible();
      const guardar = card.getByRole("button", { name: GUARDAR });
      // Sin cambios no hay nada que guardar.
      await expect(guardar).toBeDisabled();

      // La X la saca de Consumibles y repuestos...
      await card.getByRole("button", { name: `Quitar ${MACRO_SEED.cr} de ${CR}` }).click();
      await expect(card.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toHaveCount(0);

      // ...y ya se puede marcar en Operaciones, donde no sale desactivada.
      await card.getByRole("button", { name: `Elegir ${OPERACIONES}` }).click();
      await page.getByRole("option", { name: MACRO_SEED.cr, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(card.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toBeVisible();

      await guardar.click();
      await expect(page.getByText("Macro-categorías guardadas")).toBeVisible();
      // Lo guardado ya es lo que se ve: el botón se apaga hasta el siguiente cambio.
      await expect(guardar).toBeDisabled();

      await page.reload();
      const tras = tarjeta(page);
      // Primero lo que tiene que estar: así se espera a que la tarjeta cargue antes de
      // comprobar lo que no tiene que estar.
      await expect(tras.getByRole("list", { name: OPERACIONES }).getByText(MACRO_SEED.cr)).toBeVisible();
      await expect(tras.getByRole("list", { name: MANO_OBRA }).getByText(MACRO_SEED.mano_obra)).toBeVisible();
      await expect(tras.getByRole("list", { name: CR }).getByText(MACRO_SEED.cr)).toHaveCount(0);
    } finally {
      await restaurarMacro(page);
    }
  });
});
