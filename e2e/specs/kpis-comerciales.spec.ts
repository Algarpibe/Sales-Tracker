import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, SALESPEOPLE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/**
 * Columna del mes que se usa para comprobar el filtro por comercial. La primera
 * celda de cada fila es la etiqueta del KPI, asi que el indice coincide con el
 * numero del mes: 2 = febrero. Febrero es de la otra comercial (los meses 2, 6
 * y 10 de la semilla), y no cierra ningun trimestre, asi que su celda lleva solo
 * el importe y no arrastra el cumplimiento del periodo.
 */
const CELDA_FEBRERO = 2;

async function abrirComercial(page: Page) {
  await page.goto("/analytics");
  await page.getByRole("tab", { name: "Comercial" }).click();
  const card = page.locator('[data-slot="card"]', { hasText: "KPIs comerciales" });
  await expect(card).toBeVisible();
  return card;
}

test("la tabla muestra el TOTAL con su cobertura y los KPIs pendientes con su motivo", async ({ page }) => {
  const card = await abrirComercial(page);

  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();
  // La semilla pesa dos KPIs medibles al 60 y al 40.
  await expect(card.getByText(/cobertura: 100/)).toBeVisible();

  // Los dos KPIs que siguen sin origen de datos dicen por que estan vacios, cada
  // uno con su motivo. Zoho CRM ya no aparece: sus tres KPIs se calculan.
  await expect(card.getByText("Pendiente de Zoho Desk").first()).toBeVisible();
  await expect(card.getByText("Pendiente de carga manual").first()).toBeVisible();
});

test("el selector de propietario filtra los importes", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Ventas clientes existentes/ });
  const mes = fila.getByRole("cell").nth(CELDA_FEBRERO);
  const conTodos = await mes.innerText();

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // Ese mes es de la otra comercial, asi que al filtrar se queda sin importe.
  await expect(mes).not.toHaveText(conTodos);
});

test("un ambito sin metas configuradas lo dice en vez de fingir cumplimiento", async ({ page }) => {
  const card = await abrirComercial(page);

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // La semilla deja los ambitos por vendedor sin metas a proposito.
  await expect(card.getByText(/Configura las metas/)).toBeVisible();
});

test("las filas de generacion de tratos muestran numeros y ya no dicen que estan pendientes", async ({ page }) => {
  const card = await abrirComercial(page);

  const nuevos = card.getByRole("row", { name: /Generación de tratos · clientes nuevos/ });
  const existentes = card.getByRole("row", { name: /Generación de tratos · clientes existentes/ });

  // La semilla deja un trato de cada clase en cada mes del anio en curso.
  await expect(nuevos).toBeVisible();
  await expect(existentes).toBeVisible();
  await expect(nuevos).not.toContainText("Pendiente de Zoho CRM");
  await expect(existentes).not.toContainText("Pendiente de Zoho CRM");

  // Enero tiene trato nuevo y trato existente; el indice 1 es el primer mes.
  await expect(nuevos.getByRole("cell").nth(1)).toHaveText("1");
  await expect(existentes.getByRole("cell").nth(1)).toHaveText("1");
});

test("la fila de tratos cerrados ganados cuenta solo los ganados", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  await expect(fila).toBeVisible();
  await expect(fila).not.toContainText("Pendiente de Zoho CRM");

  // La semilla cierra un trato ganado y otro perdido cada mes: si el filtro por
  // fase no funcionara, aqui saldria 2.
  await expect(fila.getByRole("cell").nth(1)).toHaveText("1");
});

test("pulsar la cifra de un mes abre el detalle de esa celda", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Ventas clientes existentes/ });
  // Las facturas de la semilla solo existen en meses pares, y ningun cliente
  // ficticio es nuevo en el anio en curso (todos compran desde 2020 o 2021), asi
  // que la fila de existentes solo tiene boton en feb/abr/jun/ago/oct/dic. El
  // primer boton es por tanto febrero.
  await fila.getByRole("button").nth(0).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Febrero");
  // El pie repite el total, que es la autocomprobacion de que el detalle cuadra.
  // El selector busca "Total:" y no "Total" a secas porque el ambito por defecto
  // del dialogo es "Total compania" (sin filtrar por comercial), que tambien
  // contendria la palabra suelta y volveria el selector ambiguo.
  await expect(dialogo.getByText("Total:")).toBeVisible();
});

test("pulsar la cifra de tratos ganados abre su detalle", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  // Enero: la semilla gana un trato cada mes, siempre de la misma cuenta salvo
  // agosto, que la escribe en mayusculas. Enero evita esa variante.
  await fila.getByRole("button").nth(0).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Enero");
  await expect(dialogo.getByText("1 cliente")).toBeVisible();
  await expect(dialogo.getByText("Total: 1")).toBeVisible();
});
