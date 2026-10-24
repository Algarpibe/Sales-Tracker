import { defineConfig, devices } from "@playwright/test";
import { APP_SERVER_URL, E2E_COMPANY_ID, HUB_URL } from "./e2e/db/config.mjs";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
      DATABASE_URL: APP_SERVER_URL,
      HUB_DB_URL: HUB_URL,
      // SEC-035: la empresa sembrada es la dueña del hub de E2E. Así la suite recorre
      // la comprobación de empresa en cada lectura del hub, como producción.
      HUB_COMPANY_ID: E2E_COMPANY_ID,
      // Secreto de un entorno efímero: no se usa en ningún sitio real.
      BETTER_AUTH_SECRET: "e2e-secret-solo-para-tests-0123456789abcdef",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
      // Límite de lecturas por usuario (SEC-006). La suite va en serie con UN usuario
      // sembrado y encadena cargas de /analytics (~25 lecturas cada una) en pocos
      // segundos: con el default (600/min) podría tocar el límite y dar 429 que no
      // existen con uso humano. Se sube SOLO aquí; producción mantiene el default.
      RATE_LIMIT_READS_PER_MINUTE: "100000",
    },
  },
});
