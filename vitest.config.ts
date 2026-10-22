import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    // Alias de tsconfig.json (`@/` → src/) resueltos por Vite de forma nativa; sustituye
    // al plugin vite-tsconfig-paths, que ya no hace falta con Vite 8 (TEST-090).
    tsconfigPaths: true,
    alias: {
      // `server-only` lanza salvo bajo la condición react-server, que solo activa el
      // bundler de Next. Los tests unitarios importan módulos de servidor (db, auth) en
      // Node: se redirige al empty.js del propio paquete, lo mismo que hace Next en
      // servidor. El build de Next sigue usando el paquete real (DEP-027).
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Los specs de Playwright viven en e2e/ y usan su propio runner. Sin esta
    // exclusión, el patrón por defecto de vitest (**/*.spec.ts) los recoge e
    // intenta ejecutarlos, y truenan con "Playwright Test did not expect
    // test.describe() to be called here". Se parte de configDefaults.exclude
    // porque definir `exclude` reemplaza los valores por defecto en vez de sumarse.
    exclude: [...configDefaults.exclude, "e2e/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Secreto dummy para que importar auth.ts no dispare el fail-fast en tests
    // unitarios/CI. El smoke de integración se salta solo si no hay DATABASE_URL.
    env: { BETTER_AUTH_SECRET: "ci-test-secret-not-used-at-runtime" },
    // Cobertura (TEST-089) de la lógica pura y las Server Actions. Los umbrales van un
    // poco por DEBAJO de lo medido al introducirlos: no rompen CI hoy, pero una bajada
    // real (código nuevo sin tests) sí. Subirlos cuando la cobertura mejore.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.{ts,tsx}", "src/actions/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "text"],
      // Medido el 2026-10-22: 78.38 % sentencias, 73.22 % ramas, 81.67 % funciones,
      // 78.32 % líneas.
      thresholds: { statements: 77, branches: 72, functions: 80, lines: 77 },
    },
  },
});
