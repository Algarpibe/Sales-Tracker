import { test, expect, type Locator, type Page } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const TITULO_GRUPOS = "Evolución Histórica por Grupo";
const TITULO_MACRO = "Evolución Histórica por Macro-categoría";

// Nombres de las series: los de BUCKET_LABELS (src/lib/customer-item.ts), en su orden.
const MACROS = ["Mano de obra", "Consumibles y repuestos", "Equipos", "Operaciones"] as const;

// La semilla del hub (e2e/db/seed-hub.mjs) llega hasta el año en curso, y la tarjeta
// abre las vistas trimestral y mensual en el último año con datos.
const ANIO = String(new Date().getFullYear());

// Tarjeta acotada por su título con `data-slot="card"`, como en charts.spec.ts. Con
// expresión regular y no con texto: `hasText` con un texto no distingue mayúsculas, y la
// descripción de «Análisis por Agrupaciones Personalizadas» («…y evolución histórica por
// grupos de negocio.») casaría también con el título de la tarjeta de grupos.
function tarjeta(page: Page, titulo: string) {
  return page.locator('[data-slot="card"]', { hasText: new RegExp(titulo) });
}

// svg.recharts-surface existe aunque el gráfico esté vacío: hay que mirar las barras.
async function esperarBarras(card: Locator) {
  await expect(async () => {
    expect(await card.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
}

test("la tarjeta de grupos sigue funcionando", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const card = tarjeta(page, TITULO_GRUPOS);
  await expect(card).toBeVisible();

  // La semilla (e2e/db/seed-app.mjs) tiene dos grupos, Ambiental y Consultoria: «los
  // tres primeros» son los dos.
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await expect(
    card.getByText("Tendencia anual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Vista mensual: aparece el selector de año y la descripción cambia.
  const anio = card.getByRole("button", { name: ANIO, exact: true });
  await expect(anio).toHaveCount(0);
  await card.getByRole("tab", { name: "Mensual", exact: true }).click();
  await expect(anio).toBeVisible();
  await expect(
    card.getByText("Tendencia mensual y desglose porcentual de tus agrupaciones estratégicas.")
  ).toBeVisible();
  await esperarBarras(card);

  // Quitar un grupo y volver a añadirlo. El desplegable se pinta fuera de la tarjeta.
  await card.getByRole("button", { name: "2 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "1 Grupos Seleccionados" })).toBeVisible();

  await card.getByRole("button", { name: "1 Grupos Seleccionados" }).click();
  await page.getByRole("option", { name: "Consultoria", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "2 Grupos Seleccionados" })).toBeVisible();
  await esperarBarras(card);

  expect(crashes, `Excepciones en la tarjeta de grupos:\n${crashes.join("\n")}`).toEqual([]);
});

test("la tarjeta de macro-categorías aparece debajo de la de grupos con las cuatro series", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Orden en el documento: primero la de grupos, justo después la de macro-categorías.
  // Ninguna otra tarjeta de la pestaña contiene «Evolución Histórica por» con esas
  // mayúsculas (por eso la expresión regular: ver `tarjeta`).
  const tarjetas = page.locator('[data-slot="card"]').filter({ hasText: /Evolución Histórica por/ });
  await expect(tarjetas).toHaveCount(2);
  await expect(tarjetas.nth(0)).toContainText(TITULO_GRUPOS);
  await expect(tarjetas.nth(1)).toContainText(TITULO_MACRO);

  const card = tarjeta(page, TITULO_MACRO);
  await expect(
    card.getByText("Tendencia anual y desglose porcentual de tus macro-categorías.")
  ).toBeVisible();

  // Abre con las cuatro seleccionadas, tengan ventas o no (Operaciones no tiene en la
  // semilla). .first(): el nombre sale en la etiqueta y en la leyenda del gráfico.
  await expect(card.getByRole("button", { name: "4 Macro-categorías seleccionadas" })).toBeVisible();
  for (const nombre of MACROS) {
    await expect(card.getByText(nombre, { exact: true }).first()).toBeVisible();
  }
  await esperarBarras(card);
});

test("la tarjeta de macro-categorías cambia de vista, de tipo y de series sin errores", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const card = tarjeta(page, TITULO_MACRO);
  await expect(card).toBeVisible();
  await esperarBarras(card);

  // Vistas. El selector de año solo existe en trimestral y mensual.
  const anio = card.getByRole("button", { name: ANIO, exact: true });
  await expect(anio).toHaveCount(0);
  for (const vista of ["Trimestral", "Mensual"]) {
    await card.getByRole("tab", { name: vista, exact: true }).click();
    await expect(anio).toBeVisible();
    await expect(
      card.getByText(`Tendencia ${vista.toLowerCase()} y desglose porcentual de tus macro-categorías.`)
    ).toBeVisible();
    await esperarBarras(card);
  }
  await card.getByRole("tab", { name: "Anual", exact: true }).click();
  await expect(anio).toHaveCount(0);
  await esperarBarras(card);

  // Tipo. La tarjeta arranca en FAC, como el periodo global, y tiene su propio conmutador.
  const ov = card.getByRole("tab", { name: /\bOV\b/ });
  const fac = card.getByRole("tab", { name: /\bFAC\b/ });
  await expect(fac).toHaveAttribute("aria-selected", "true");
  await ov.click();
  await expect(ov).toHaveAttribute("aria-selected", "true");
  await esperarBarras(card);
  await fac.click();
  await expect(fac).toHaveAttribute("aria-selected", "true");
  await esperarBarras(card);

  // Quitar una macro-categoría y volver a añadirla. El desplegable se pinta fuera de la
  // tarjeta.
  await card.getByRole("button", { name: "4 Macro-categorías seleccionadas" }).click();
  await page.getByRole("option", { name: "Mano de obra", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "3 Macro-categorías seleccionadas" })).toBeVisible();
  // Sin etiqueta y sin serie en la leyenda.
  await expect(card.getByText("Mano de obra", { exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "3 Macro-categorías seleccionadas" }).click();
  await page.getByRole("option", { name: "Mano de obra", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "4 Macro-categorías seleccionadas" })).toBeVisible();
  await expect(card.getByText("Mano de obra", { exact: true }).first()).toBeVisible();
  await esperarBarras(card);

  expect(crashes, `Excepciones en la tarjeta de macro-categorías:\n${crashes.join("\n")}`).toEqual([]);
});
