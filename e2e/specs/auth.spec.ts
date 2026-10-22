import { test, expect, type Page } from "@playwright/test";
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

  // Registro (SEC-039). Sin autoSignIn, better-auth responde igual exista o no el email,
  // y la pantalla muestra el MISMO mensaje: no sirve para averiguar qué cuentas hay.
  // Cada prueba gasta 1 del presupuesto de 5 registros/minuto (independiente del de login).
  test.describe("registro", () => {
    const REGISTRO_OK =
      "Cuenta creada. Un administrador debe aprobarla; podrás iniciar sesión cuando esté aprobada.";

    async function registrar(page: Page, email: string) {
      await page.goto("/register");
      await page.getByLabel("Nombre completo").fill("E2E Registro");
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill("RegistroE2E!2026");
      await page.getByLabel("Confirmar contraseña").fill("RegistroE2E!2026");
      await page.getByRole("button", { name: "Crear Cuenta" }).click();
    }

    test("una cuenta nueva queda pendiente, sin sesión, y se ofrece ir a /login", async ({ page }) => {
      await registrar(page, `e2e-registro-${Date.now()}@example.test`);

      await expect(page.getByText(REGISTRO_OK)).toBeVisible();
      await expect(page).toHaveURL(/\/register$/);
      await expect(page.getByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");

      // El registro no inicia sesión: el dashboard sigue mandando a /login.
      await page.goto("/home");
      await expect(page).toHaveURL(/\/login$/);
    });

    test("un email ya registrado muestra el mismo mensaje, sin revelar que existe", async ({ page }) => {
      await registrar(page, APPROVED_USER.email);

      await expect(page.getByText(REGISTRO_OK)).toBeVisible();
      await expect(page.getByText("Error al crear cuenta")).toHaveCount(0);

      await page.goto("/home");
      await expect(page).toHaveURL(/\/login$/);
    });
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

    // La pantalla es un Server Component. Si el boton de recargar vuelve a pedirse
    // con la prop `render` de base-ui, que es una funcion, React no puede serializarla
    // hacia un componente de cliente y el servidor escupe un error en cada visita.
    // Un enlace real con las clases de buttonVariants no cruza esa frontera.
    test("la pantalla de espera ofrece recargar como enlace real", async ({ page }) => {
      await page.goto("/waiting-approval");
      const recargar = page.getByRole("link", { name: "Recargar Estado" });
      await expect(recargar).toBeVisible();
      await expect(recargar).toHaveAttribute("href", "/waiting-approval");
    });
  });
});
