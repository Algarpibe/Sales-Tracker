import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const PG_HOST = process.env.E2E_PG_HOST ?? "127.0.0.1";
const PG_PORT = process.env.E2E_PG_PORT ?? "55432";
const PG_BASE = `postgres://postgres:postgres@${PG_HOST}:${PG_PORT}`;

export default defineConfig({
  testDir: "./e2e/specs",
  // Serie estricta: las pruebas comparten una única BD y el login tiene un
  // presupuesto de 5 intentos por minuto. El paralelismo convertiría ambas
  // cosas en carreras.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Fijo: Recharts y react-grid-layout dependen del ancho disponible.
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testDir: "./e2e",
      testMatch: /auth\.setup\.ts/,
      // Sin reintentos: cada reintento gastaría logins del presupuesto.
      retries: 0,
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      retries: 0,
    },
    {
      name: "chromium",
      testIgnore: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      retries: process.env.CI ? 2 : 0,
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: `${PG_BASE}/salestracker_e2e`,
      HUB_DB_URL: `${PG_BASE}/zoho_hub_e2e`,
      // Secreto de un entorno efímero: no se usa en ningún sitio real.
      BETTER_AUTH_SECRET: "e2e-secret-solo-para-tests-0123456789abcdef",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
