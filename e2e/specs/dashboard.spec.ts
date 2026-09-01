import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

const VIEWPORT_WIDTH = 1440;

test("la rejilla ocupa el ancho completo desde la primera carga", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  const grid = page.locator(".react-grid-layout").first();
  await expect(grid).toBeVisible();

  // Comprobación básica de cordura: la caja del contenedor (CSS, gobernada por el
  // layout flex) ocupa la mayor parte del viewport. Medido con el fix puesto:
  // ~1152px a 1440px de viewport (~80%); sin datos que mostrar, boundingBox()
  // seguiría dando esta misma cifra, así que 0.6 deja margen holgado.
  const box = await grid.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(VIEWPORT_WIDTH * 0.6);

  // La comprobación que de verdad atrapa el bug: `.react-grid-layout` fija su
  // propio ancho de caja por CSS (siempre igual, con o sin el fix), pero
  // react-grid-layout posiciona los widgets internamente usando el ancho que
  // midió. Con el bug, ese ancho quedaba en el valor por defecto (1280, el
  // contenedor no estaba montado cuando se calculó) en vez del real (~1152
  // medido en este layout), así que los widgets se posicionaban para un
  // contenedor más ancho del que en verdad hay y se salían por la derecha:
  // scrollWidth/el borde derecho del último widget superaban la caja visible
  // por ~112px. Con el fix puesto no hay desbordamiento.
  await expect(async () => {
    const overflow = await grid.evaluate((el) => {
      const items = Array.from(el.querySelectorAll(".react-grid-item")) as HTMLElement[];
      const rightEdges = items.map((it) => it.offsetLeft + it.offsetWidth);
      return {
        boxWidth: el.getBoundingClientRect().width,
        scrollWidth: el.scrollWidth,
        maxRightEdge: rightEdges.length > 0 ? Math.max(...rightEdges) : 0,
      };
    });
    // 2px de tolerancia por redondeo de layout.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.boxWidth + 2);
    expect(overflow.maxRightEdge).toBeLessThanOrEqual(overflow.boxWidth + 2);
  }).toPass();
});

test("recargar no encoge la rejilla", async ({ page }) => {
  await page.goto("/home");
  const grid = page.locator(".react-grid-layout").first();
  await expect(grid).toBeVisible();

  const before = await grid.boundingBox();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();
  await expect(grid).toBeVisible();

  await expect(async () => {
    const after = await grid.boundingBox();
    expect(after).not.toBeNull();
    // Mismo ancho tras recargar, con 2px de tolerancia por redondeo de layout.
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(2);
  }).toPass();
});

test("el layout personalizado sobrevive a una recarga", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  await page.getByRole("button", { name: /Personalizar/i }).click();

  const widgets = page.locator(".react-grid-item");
  const countBefore = await widgets.count();
  expect(countBefore).toBeGreaterThan(0);

  // Arrastrar el primer widget hacia la derecha.
  const first = widgets.first();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 1.5, box!.y + 20, { steps: 12 });
  await page.mouse.up();

  await page.getByRole("button", { name: /Guardar|Listo|Terminar/i }).click();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard General" })).toBeVisible();

  // El número de widgets persiste: el layout se guardó y se releyó desde saved_views.
  await expect(page.locator(".react-grid-item")).toHaveCount(countBefore);
});
