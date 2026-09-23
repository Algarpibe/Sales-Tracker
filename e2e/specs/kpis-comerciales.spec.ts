import { test, expect, type Page } from "@playwright/test";
import { APPROVED_STATE, LECTOR_STATE, SALESPEOPLE } from "../constants";

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

  // Solo queda un KPI sin origen de datos, con su motivo. Zoho CRM ya no aparece
  // (sus tres KPIs se calculan) y tampoco ingresos por proyectos (se gestiona a
  // mano desde la propia tabla).
  await expect(card.getByText("Pendiente de Zoho Desk").first()).toBeVisible();
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

/**
 * Orden identificable para el dialogo de gestion de ingresos por proyectos:
 * "Alfa Industrial" (ver e2e/db/seed-hub.mjs) tiene ordenes de venta en los
 * meses 1, 6 y 11 de CADA anio sembrado, incluido el anio en curso. La
 * busqueda del dialogo ordena por fecha descendente, asi que el primer
 * resultado para este cliente es siempre su orden mas reciente en el tiempo:
 * la de noviembre (mes 11) del anio en curso. Ningun otro cliente de la
 * semilla comparte fragmento de nombre con "Alfa Industrial", asi que la
 * busqueda no es ambigua. No hizo falta sembrar ninguna orden nueva.
 */
const CLIENTE_ORDEN = "Alfa Industrial";
const CELDA_ORDEN_MARCADA = 11;

test.describe("usuario lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("sin permisos de administrador no hay boton para gestionar ingresos por proyectos", async ({ page }) => {
    const card = await abrirComercial(page);
    const fila = card.getByRole("row", { name: /Ingresos por proyectos/ });
    await expect(fila).toBeVisible();
    await expect(fila.getByRole("button", { name: /Gestionar/ })).toHaveCount(0);
  });
});

test("un administrador marca una orden y su importe entra en la fila de ingresos por proyectos", async ({ page }) => {
  const card = await abrirComercial(page);
  const fila = card.getByRole("row", { name: /Ingresos por proyectos/ });
  await fila.getByRole("button", { name: /Gestionar/ }).click();

  const dialogo = page.getByRole("dialog", { name: /Gestionar/ });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("combobox").fill(CLIENTE_ORDEN);

  // El buscador solo ofrece ordenes del anio seleccionado en la pestana. La
  // semilla tiene ordenes de este cliente en todos los anios desde 2020, asi que
  // sin el filtro aparecerian tambien las del anio anterior.
  const anio = new Date().getFullYear();
  const opciones = dialogo.getByRole("option");
  await expect(opciones.first()).toBeVisible();
  const textos = await opciones.allInnerTexts();
  for (const t of textos) expect(t).toContain(`${anio}-`);
  expect(textos.some((t) => t.includes(`${anio - 1}-`))).toBe(false);

  await opciones.first().click();
  // Una vez marcada, esa orden no se puede volver a agregar.
  await expect(opciones.first().getByRole("button", { name: "Agregada" })).toBeDisabled();
  await dialogo.getByRole("button", { name: "Cerrar" }).click();

  await expect(fila.getByRole("cell").nth(CELDA_ORDEN_MARCADA)).not.toHaveText("$0");
});
