import { test, expect } from "@playwright/test";
import { APPROVED_STATE } from "../constants";

test.use({ storageState: APPROVED_STATE });

/**
 * El botón "Exportar" de /tablas (src/components/common/export-menu.tsx) abre un
 * menú de Base UI con tres opciones: "Copiar tabla" (portapapeles, sin descarga),
 * "CSV" y "Excel (.xlsx)". Ambas descargan mediante un enlace <a download> creado
 * en cliente (ver src/app/(dashboard)/tablas/page.tsx y src/lib/excel-client.ts),
 * así que Playwright puede capturarlas con page.waitForEvent("download").
 */

test("exportar a Excel descarga un fichero .xlsx no vacío", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  await page.getByRole("button", { name: /Exportar/i }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buffer = Buffer.concat(chunks);

  expect(buffer.length).toBeGreaterThan(1000);
  // Un .xlsx es un ZIP: debe empezar por la firma PK.
  expect(buffer.subarray(0, 2).toString()).toBe("PK");
});

test("exportar a CSV descarga un fichero con cabecera y filas", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  await page.getByRole("button", { name: /Exportar/i }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");

  // Cabecera ("Categoría" + meses + "Total") más al menos una fila de datos.
  const lines = text.trim().split("\n");
  expect(lines.length).toBeGreaterThan(1);
  expect(lines[0]).toContain("Categoría");
});

/**
 * El .xlsx se genera en el servidor (Server Action generateXlsx). Se retiene esa
 * petición (POST con cabecera Next-Action a /tablas) para comprobar que, mientras
 * dura, el botón está deshabilitado y aún no se ha avisado de nada; el aviso de
 * éxito solo aparece cuando la descarga ya ha ocurrido.
 */
test("el aviso de Excel descargado llega tras la descarga, con el botón bloqueado mientras tanto", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  let soltar!: () => void;
  const retenida = new Promise<void>((r) => (soltar = r));
  let llegada!: () => void;
  const haLlegado = new Promise<void>((r) => (llegada = r));
  await page.route(
    (url) => url.pathname === "/tablas",
    async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        llegada();
        await retenida;
      }
      await route.continue();
    },
  );

  const exportar = page.getByRole("button", { name: /Exportar/i });
  await exportar.click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click();

  await haLlegado;
  await expect(exportar).toBeDisabled();
  await expect(page.getByText("Excel descargado")).toHaveCount(0);

  soltar();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(page.getByText("Excel descargado")).toBeVisible();
  await expect(exportar).toBeEnabled();
});

test("si la generación del Excel falla se avisa del error y no del éxito", async ({ page }) => {
  await page.goto("/tablas");
  await expect(page.getByRole("heading", { level: 1, name: "Tablas de Datos" })).toBeVisible();

  await page.route(
    (url) => url.pathname === "/tablas",
    async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        await route.abort();
        return;
      }
      await route.continue();
    },
  );

  await page.getByRole("button", { name: /Exportar/i }).click();
  await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click();

  await expect(page.getByText("No se pudo generar el Excel")).toBeVisible();
  await expect(page.getByText("Excel descargado")).toHaveCount(0);
});
