import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
  },
});
