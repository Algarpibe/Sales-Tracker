import { test, expect } from "@playwright/test";
import { APPROVED_USER, APPROVED_STATE, PENDING_STATE } from "../constants";

test.describe("autenticación", () => {
  test("un visitante anónimo es redirigido a /login", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  });

  // Este test gasta el tercer y último login del presupuesto de 5/minuto.
  // NO añadir más intentos de sign-in a la suite sin releer esa restricción.
  test("unas credenciales inválidas muestran error y no dejan entrar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(APPROVED_USER.email);
    await page.getByLabel("Contraseña").fill("ContrasenaIncorrecta!99");
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();

    await expect(page.getByText("Error al iniciar sesión")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("con sesión aprobada", () => {
    test.use({ storageState: APPROVED_STATE });

    test("entra a /home y ve el dashboard", async ({ page }) => {
      await page.goto("/home");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();
    });

    test("visitar /login redirige a /home", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/home$/);
    });
  });

  test.describe("con sesión pendiente de aprobación", () => {
    test.use({ storageState: PENDING_STATE });

    test("cualquier ruta del dashboard redirige a /waiting-approval", async ({ page }) => {
      await page.goto("/analytics");
      await expect(page).toHaveURL(/\/waiting-approval$/);
    });
  });
});
