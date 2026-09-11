import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  APPROVED_STATE,
  HISTORICAL_CUSTOMER,
  HISTORICAL_FIRST_YEAR,
  ORDER_FIRST_CUSTOMER,
  ORDER_FIRST_YEAR,
} from "../constants";

// Suma de "Ventas histórico" para HISTORICAL_CUSTOMER incluyendo las filas del
// histórico ficticio (2015-2020) más las facturas del hub. Determinista por la
// semilla.
const VENTAS_HISTORICO = "$14,754";

test.use({ storageState: APPROVED_STATE });

// Tile de KPI de la ficha: un div con la etiqueta y otro con el valor.
function tileValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("..").locator("> div").nth(1);
}

test("la ficha incluye el histórico en Cliente desde y en la evolución anual", async ({ page }) => {
  await page.goto(`/clientes/${encodeURIComponent(HISTORICAL_CUSTOMER)}`);
  await expect(page.getByRole("heading", { level: 1, name: HISTORICAL_CUSTOMER })).toBeVisible();

  // Un contexto nuevo arranca en Facturas, que es donde vive el histórico.
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(HISTORICAL_FIRST_YEAR));

  // "Ventas histórico" suma desde 2015: las dos filas del histórico ficticio
  // más las facturas del hub. Determinista por la semilla.
  await expect(tileValue(page, "Ventas histórico")).toHaveText(VENTAS_HISTORICO);

  const evolucion = page.locator('[data-slot="card"]', { hasText: "Evolución anual" });
  await expect(
    evolucion.locator(".recharts-xAxis .recharts-cartesian-axis-tick").filter({ hasText: String(HISTORICAL_FIRST_YEAR) })
  ).toHaveCount(1);
});

test("Cliente desde no depende del conmutador OV/FAC", async ({ page }) => {
  await page.goto(`/clientes/${encodeURIComponent(ORDER_FIRST_CUSTOMER)}`);
  await expect(page.getByRole("heading", { level: 1, name: ORDER_FIRST_CUSTOMER })).toBeVisible();

  // Su documento más antiguo es una Orden de Venta de 2020 sin factura: con
  // Facturas seleccionadas el valor tiene que salir igualmente de las órdenes.
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(ORDER_FIRST_YEAR));

  const ovTab = page.getByRole("tab", { name: /\bOV\b/ }).first();
  await ovTab.click();
  await expect(ovTab).toHaveAttribute("aria-selected", "true");
  await expect(tileValue(page, "Cliente desde")).toHaveText(String(ORDER_FIRST_YEAR));
});
