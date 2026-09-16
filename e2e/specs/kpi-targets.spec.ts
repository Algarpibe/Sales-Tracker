import { test, expect } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

test("Configuración muestra las metas del total de compañía", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();
  // La semilla deja dos KPIs con 60 y 40 en el ámbito del total.
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
});

test("no deja guardar si los pesos no suman 100", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();

  const peso = card.getByLabel("Peso de Ventas clientes nuevos");
  await peso.fill("10");
  await expect(card.getByText("Suma de pesos: 50%")).toBeVisible();
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();

  await peso.fill("60");
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeEnabled();
});

test("cada vendedor tiene sus propias metas", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

  // Al cambiar de ámbito, las metas del total no se arrastran: ese vendedor
  // todavía no tiene ninguna.
  await card.getByLabel("Ámbito").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
  await expect(card.getByText("Suma de pesos: 0%")).toBeVisible();
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();
});
