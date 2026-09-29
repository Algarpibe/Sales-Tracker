import { test, expect } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/** aria-label del campo de plazo. exact en getByLabel: sin él, la búsqueda es por subcadena. */
const PLAZO = "Plazo de Tickets de Servicio Técnico en plazo";

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

  // Volver a lo guardado deja los pesos bien, pero no hay nada nuevo que guardar.
  await peso.fill("60");
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
  await expect(card.getByRole("button", { name: "Guardar metas" })).toBeDisabled();

  // Un cambio válido sí lo activa. El test no guarda: la base queda como estaba.
  await card.getByLabel("Meta de Ventas clientes nuevos").fill("1500");
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

test("la tabla dice qué es cada columna y en qué unidad va la meta", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card).toBeVisible();

  // Sin cabeceras, los dos campos de cada fila son indistinguibles.
  await expect(card.getByText("Meta", { exact: true })).toBeVisible();
  await expect(card.getByText("Peso %", { exact: true })).toBeVisible();

  // Cada fila declara su unidad: no todas las metas son importes.
  await expect(card.getByText("Trimestral · USD").first()).toBeVisible();
  await expect(card.getByText("Mensual · nº").first()).toBeVisible();
  await expect(card.getByText("Mensual · %").first()).toBeVisible();

  // Y el propio campo la repite, que es donde mira quien está tecleando.
  await expect(card.getByLabel("Meta de Ventas clientes nuevos")).toHaveAttribute("placeholder", "USD");
  await expect(card.getByLabel("Meta de Tratos cerrados ganados")).toHaveAttribute("placeholder", "nº");
});

test("el total muestra el plazo de tickets con su valor por defecto y un vendedor no lo tiene", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();

  await expect(card.getByText("Plazo (h)", { exact: true })).toBeVisible();
  // La semilla no guarda plazo: se ve el de por defecto.
  await expect(card.getByLabel(PLAZO, { exact: true })).toHaveValue("12");

  // El KPI de tickets solo se mide a nivel compañía: en un vendedor no hay plazo.
  await card.getByLabel("Ámbito").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();
  await expect(card.getByText("Suma de pesos: 0%")).toBeVisible();
  await expect(card.getByLabel(PLAZO, { exact: true })).toHaveCount(0);
});

test("no deja guardar un plazo invalido ni un plazo sin meta y peso de tickets", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
  await expect(card.getByText("Suma de pesos: 100%")).toBeVisible();
  const plazo = card.getByLabel(PLAZO, { exact: true });
  const guardar = card.getByRole("button", { name: "Guardar metas" });
  // Recién cargada no hay cambios que guardar.
  await expect(guardar).toBeDisabled();

  await plazo.fill("0");
  await expect(card.getByText(/mayor que 0/)).toBeVisible();
  await expect(guardar).toBeDisabled();

  // La semilla no pesa el KPI de tickets: su fila no existe y el plazo no tendría dónde guardarse.
  await plazo.fill("8");
  await expect(card.getByText(/ponle meta y peso/)).toBeVisible();
  await expect(guardar).toBeDisabled();

  // Nada se guarda en este test: volver al de por defecto deja la pantalla como estaba.
  await plazo.fill("12");
  await expect(card.getByText(/ponle meta y peso/)).toHaveCount(0);
  await expect(guardar).toBeDisabled();
});

test.describe("lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("ve las metas pero no puede editarlas", async ({ page }) => {
    await page.goto("/settings");
    const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    // Ve lo que hay guardado: la semilla deja 60 en este KPI.
    const peso = card.getByLabel("Peso de Ventas clientes nuevos");
    await expect(peso).toHaveValue("60");
    await expect(peso).not.toBeEditable();
    await expect(card.getByLabel("Meta de Ventas clientes nuevos")).not.toBeEditable();

    await expect(card.getByRole("button", { name: "Guardar metas" })).toHaveCount(0);
  });

  test("ve el plazo de tickets pero no puede editarlo", async ({ page }) => {
    await page.goto("/settings");
    const card = page.locator('[data-slot="card"]', { hasText: "Metas de KPIs comerciales" });
    await expect(card.getByText("Solo lectura.")).toBeVisible();

    const plazo = card.getByLabel(PLAZO, { exact: true });
    await expect(plazo).toHaveValue("12");
    await expect(plazo).not.toBeEditable();
  });
});
