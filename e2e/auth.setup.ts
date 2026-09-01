import { test as setup, expect, type Page } from "@playwright/test";
import { APPROVED_USER, PENDING_USER, APPROVED_STATE, PENDING_STATE } from "./constants";

/**
 * Login real por formulario. NO se falsifica la cookie: src/middleware.ts consulta
 * la tabla profiles en cada request, así que la sesión tiene que existir de verdad.
 *
 * Consume 1 del presupuesto de 5 logins/minuto. Este fichero gasta 2.
 */
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
}

setup("autenticar al usuario aprobado", async ({ page }) => {
  await login(page, APPROVED_USER.email, APPROVED_USER.password);

  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  await page.context().storageState({ path: APPROVED_STATE });
});

setup("autenticar al usuario pendiente de aprobación", async ({ page }) => {
  await login(page, PENDING_USER.email, PENDING_USER.password);

  // El middleware manda a /waiting-approval a quien no está aprobado.
  await page.waitForURL("**/waiting-approval");

  await page.context().storageState({ path: PENDING_STATE });
});
