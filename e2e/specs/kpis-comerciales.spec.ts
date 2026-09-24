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

test("la tabla muestra el TOTAL con su cobertura y ya no queda ningun KPI pendiente", async ({ page }) => {
  const card = await abrirComercial(page);

  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();
  // La semilla pesa dos KPIs medibles al 60 y al 40.
  await expect(card.getByText(/cobertura: 100/)).toBeVisible();

  // Tickets en plazo era el ultimo KPI sin origen de datos: ahora se calcula desde el
  // historial de Zoho Desk, asi que ninguna fila dice que esta pendiente. El TOTAL
  // ya esta pintado, asi que la cuenta a cero no puede pasar por una tabla a medio cargar.
  await expect(card.getByText(/Pendiente de Zoho/)).toHaveCount(0);
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
 * La fila de ganados cuenta por el mes, en hora de Bogota, en que el trato ENTRO en la
 * fase ganada (stage_modified_time), no por closing_date. Los tres GANADOS_ESPECIALES de
 * e2e/db/seed-hub.mjs hacen discrepar las reglas a proposito; con closing_date saldria
 * 1-2-2-1-2 en marzo, abril, junio, julio y septiembre. El indice de celda es el mes.
 */
test("la fila de tratos ganados cuenta por el mes en Bogota en que el trato entro en la fase", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  const celda = (mes: number) => fila.getByRole("cell").nth(mes);

  // DEAL-GX-FRONTERA entro el 1 de abril a las 02:00 UTC, las 21:00 del 31 de marzo en
  // Bogota: suma a marzo y no a abril. Con el mes UTC tambien iria a abril.
  await expect(celda(3)).toHaveText("2");
  await expect(celda(4)).toHaveText("1");
  // DEAL-GX-MES tiene closing_date de junio pero entro en la fase en julio.
  await expect(celda(6)).toHaveText("1");
  await expect(celda(7)).toHaveText("2");
  // DEAL-GX-SIN-HORA esta ganado con closing_date de septiembre pero sin hora de
  // entrada: no cuenta, y septiembre se queda con el ganado del mes.
  await expect(celda(9)).toHaveText("1");
});

test("el detalle de ganados de marzo incluye el trato que entro en la fase la noche del 31", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  await fila.getByRole("cell").nth(3).getByRole("button").click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Marzo");
  // El ganado del mes (cuenta de Books "Alfa Industrial") y el de la frontera horaria.
  await expect(dialogo).toContainText("Alfa Industrial");
  await expect(dialogo).toContainText("Cuenta Ficticia Frontera");
  await expect(dialogo.getByText("2 clientes")).toBeVisible();
  await expect(dialogo.getByText("Total: 2")).toBeVisible();
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

test("la fila de tickets en plazo calcula el porcentaje del mes con el historial de Desk", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await expect(fila).toBeVisible();
  await expect(fila).not.toContainText("Pendiente de Zoho Desk");

  // Febrero de la semilla (e2e/db/seed-hub.mjs): tres episodios en plazo y dos fuera,
  // mas un rechazo que no cuenta. 3 / 5 = 60 %. La semilla no pone meta a este KPI,
  // asi que la celda lleva solo el valor, sin cumplimiento debajo.
  await expect(fila.getByRole("cell").nth(CELDA_FEBRERO)).toHaveText("60.0%");
  // Enero solo tiene la salida de un episodio que entro el anio anterior: se ignora y
  // el mes queda sin dato, no a 0 %.
  await expect(fila.getByRole("cell").nth(1)).toHaveText("—");
});

test("con un comercial elegido la fila de tickets sigue siendo de compania", async ({ page }) => {
  const card = await abrirComercial(page);

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // Desk no asigna comercial al ticket: la cifra es la misma y la fila lo dice.
  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await expect(fila).toContainText("De compañía: no se filtra por comercial.");
  await expect(fila.getByRole("cell").nth(CELDA_FEBRERO)).toHaveText("60.0%");
});

test("pulsar el porcentaje de tickets de febrero abre el detalle de sus episodios", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await fila.getByRole("cell").nth(CELDA_FEBRERO).getByRole("button").click();

  const dialogo = page.getByRole("dialog", { name: /Tickets en plazo/ });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Febrero");
  // El pie repite el porcentaje de la celda con el mismo formato: es la
  // autocomprobacion de que el detalle cuadra con la cifra pulsada.
  await expect(dialogo.getByText("3 en plazo de 5 → 60.0%")).toBeVisible();

  // Febrero de la semilla (e2e/db/seed-hub.mjs): cinco episodios que cuentan. Primero
  // los fuera de plazo, de mas horas a menos; T-FICT-002 y el segundo episodio de
  // T-FICT-005 empatan a 18 h y va antes el que entro primero, T-FICT-002.
  const cuentan = dialogo.getByRole("table", { name: "Cuentan para el porcentaje" });
  const filas = cuentan.locator("tbody tr");
  await expect(filas).toHaveCount(5);
  await expect(filas.first()).toContainText("#9002");
  await expect(filas.first()).toContainText("Cliente Ficticio B");
  await expect(filas.first()).toContainText("Fuera de plazo");
  // T-FICT-003 no tiene cuenta en el hub: el LEFT JOIN lo deja en el KPI con cliente "—".
  await expect(filas.filter({ hasText: "#9003" })).toContainText("—");

  // El rechazo de T-FICT-004 no cuenta y sale aparte.
  const noCuentan = dialogo.getByRole("region", { name: "No cuentan para el porcentaje" });
  await expect(noCuentan.locator("tbody tr")).toHaveCount(1);
  await expect(noCuentan).toContainText("#9004");
  await expect(noCuentan).toContainText("Excluido (rechazo)");
  await expect(noCuentan).toContainText("Por Facturar");
});

/**
 * Columnas de resumen, tras Dic. En una fila de KPI la celda 0 es la etiqueta y las 1-12
 * son los meses, asi que el resumen va de la 13 a la 16. En la fila TOTAL los doce meses
 * son una sola celda (colSpan), asi que alli van de la 2 a la 5.
 */
const CELDA_PROMEDIO_ANUAL = 13;
const CELDA_PROMEDIO_FECHA = 15;
const CELDAS_RESUMEN_TOTAL = [2, 3, 4, 5];
/** Meses que cierran trimestre: bajo su importe va el cumplimiento del trimestre. */
const CIERRES_TRIMESTRE = [3, 6, 9, 12];

/** Ultimo porcentaje del texto de una celda: en un mes de cierre, el cumplimiento. */
function ultimoPct(texto: string): number {
  const pcts = [...texto.matchAll(/(-?[\d.]+)%/g)];
  if (pcts.length === 0) throw new Error(`sin porcentaje en "${texto}"`);
  return Number(pcts[pcts.length - 1][1]);
}

test("la tabla separa el promedio y el aporte anuales de los de a la fecha", async ({ page }) => {
  const card = await abrirComercial(page);
  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();

  const cabeceras = await card.getByRole("columnheader").allInnerTexts();
  expect(cabeceras.slice(-5)).toEqual([
    "Dic",
    "Promedio anual",
    "Aporte anual",
    "Promedio a la fecha",
    "Aporte a la fecha",
  ]);

  // Semilla (e2e/db/seed-app.mjs): ventas nuevos pesa 60 y no tiene ningun cliente nuevo,
  // asi que cumple 0 %; ventas existentes pesa 40 y supera su meta en todos los
  // trimestres, topada al 100 %. Nota (0 * 60 + 100 * 40) / 100 = 40 % y aporte 0 + 40.
  // Vale en cualquier mes: los dos KPIs tienen dato en todos los trimestres del anio.
  const total = card.getByRole("row", { name: /^TOTAL/ });
  for (const i of CELDAS_RESUMEN_TOTAL) {
    await expect(total.getByRole("cell").nth(i)).toHaveText("40.0%");
  }
  // Los mismos KPIs tienen dato y peso en los dos calculos: la cobertura sale una vez.
  await expect(total).toContainText("cobertura: 100.0% del peso");
  await expect(total).not.toContainText("cobertura a la fecha");
});

test("el promedio a la fecha de ventas existentes solo cuenta los trimestres transcurridos", async ({ page }) => {
  const card = await abrirComercial(page);
  const celdas = card.getByRole("row", { name: /Ventas clientes existentes/ }).getByRole("cell");
  // Espera a la tabla con datos antes de leer textos sueltos.
  await expect(celdas.nth(CELDA_PROMEDIO_FECHA)).toHaveText(/%$/);

  const cumplimientos: number[] = [];
  for (const mes of CIERRES_TRIMESTRE) {
    cumplimientos.push(ultimoPct(await celdas.nth(mes).innerText()));
  }
  const anual = ultimoPct(await celdas.nth(CELDA_PROMEDIO_ANUAL).innerText());
  const fecha = ultimoPct(await celdas.nth(CELDA_PROMEDIO_FECHA).innerText());

  // Mismo criterio que periodosTranscurridos para un KPI trimestral del anio en curso, con
  // el reloj del sistema, que es tambien el del navegador: el test vale cualquier mes.
  const transcurridos = Math.ceil((new Date().getMonth() + 1) / 3);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Cada cumplimiento de la celda llega redondeado a un decimal y el promedio de la tabla
  // se calcula sin redondear: pueden separarse hasta 0.05, y se deja 0.1 de margen.
  expect(Math.abs(anual - media(cumplimientos))).toBeLessThanOrEqual(0.1);
  expect(Math.abs(fecha - media(cumplimientos.slice(0, transcurridos)))).toBeLessThanOrEqual(0.1);

  // La semilla (e2e/db/seed-hub.mjs) tiene ventas tambien en los meses que aun no han
  // llegado. Los trimestres no crecen de forma monotona (en facturas solo hay meses
  // pares y T3 queda por debajo de T2), pero el T4 es el mayor y T3+T4 superan a T1+T2:
  // por eso a la fecha queda por debajo del anual hasta el ultimo trimestre, en el que
  // los dos cuentan lo mismo.
  if (transcurridos < 4) expect(fecha).toBeLessThan(anual);
  else expect(fecha).toBe(anual);
});
