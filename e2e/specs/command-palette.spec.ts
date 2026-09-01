import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

// Se abre desde varias rutas porque el bug original era de montaje del provider:
// funcionaba en unas páginas y reventaba en otras.
const ROUTES = ["/home", "/analytics", "/clientes", "/articulos", "/tablas"];

for (const route of ROUTES) {
  test(`el command palette abre desde ${route} sin reventar`, async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (err) => crashes.push(err.message));

    await page.goto(route);
    await page.getByRole("heading", { level: 1 }).first().waitFor();

    await page.keyboard.press("ControlOrMeta+k");

    // El diálogo debe montarse: si falta el root <Command>, cmdk lanza al abrir
    // y este diálogo nunca aparece.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    expect(crashes, `El palette lanzó en ${route}:\n${crashes.join("\n")}`).toEqual([]);
  });
}

test("buscar en el palette y navegar al resultado", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("heading", { level: 1 }).waitFor();

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // El grupo "Clientes" carga de forma asíncrona (react-query se dispara al abrir
  // el diálogo). Esperamos a que aparezca sin filtrar antes de escribir: si se
  // escribe antes de que lleguen los datos, cmdk no vuelve a mostrar ese grupo
  // aunque la petición termine después (bug de carrera ajeno a e63dbb3, ver informe).
  const option = dialog.getByText("Alfa Industrial").first();
  await expect(option).toBeVisible();

  await page.keyboard.type("Alfa");

  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/clientes\//);
});
