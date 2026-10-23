import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/**
 * FE-056: el error de una tarjeta es local. Se hace fallar SOLO la lectura de
 * «Margen bruto estimado» (GET /api/data/margin-by-year, la única de la pestaña Margen
 * que la usa; DATA-043) devolviendo un 500. Esa tarjeta debe mostrar su aviso con
 * «Reintentar» mientras el resto de la página sigue en pie; al reintentar sin el
 * fallo, carga.
 */
test("si falla una tarjeta, solo ella muestra el error y se puede reintentar", async ({ page }) => {
  let fallar = true;
  await page.route(
    (url) => url.pathname === "/api/data/margin-by-year",
    async (route) => {
      if (fallar) {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "fallo simulado" });
        return;
      }
      await route.fallback();
    }
  );

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Análisis Inteligente" })).toBeVisible();
  await page.getByRole("tab", { name: "Margen", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Margen", exact: true });

  // La tarjeta que falla: aviso local con su título y «Reintentar».
  const aviso = panel.getByRole("alert").filter({ hasText: "Margen bruto estimado" });
  await expect(aviso).toBeVisible({ timeout: 20_000 });
  await expect(aviso).toContainText("No se pudieron cargar los datos.");
  await expect(aviso.getByRole("button", { name: "Reintentar" })).toBeVisible();
  // Nunca el mensaje crudo del error.
  await expect(aviso).not.toContainText("fallo simulado");

  // El resto de la página sigue: cabecera, pestañas y las otras tarjetas de Margen.
  await expect(page.getByText("Algo salió mal")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Análisis Inteligente" })).toBeVisible();
  await expect(panel.getByText(/Margen por artículo/).first()).toBeVisible();
  await expect(panel.getByTestId("card-error")).toHaveCount(1);

  // Reintentar sin el fallo: la tarjeta carga sus datos.
  fallar = false;
  await aviso.getByRole("button", { name: "Reintentar" }).click();
  await expect(panel.getByText("Ventas (bienes)", { exact: true })).toBeVisible();
  await expect(panel.getByTestId("card-error")).toHaveCount(0);
});
