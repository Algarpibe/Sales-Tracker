import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
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
  },
});
