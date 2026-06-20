import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Secreto dummy para que importar auth.ts no dispare el fail-fast en tests
    // unitarios/CI. El smoke de integración se salta solo si no hay DATABASE_URL.
    env: { BETTER_AUTH_SECRET: "ci-test-secret-not-used-at-runtime" },
  },
});
