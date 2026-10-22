import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DEP-027: los módulos que abren conexiones o leen secretos llevan `import "server-only"`
 * para que importarlos desde un componente de cliente rompa el build en vez de intentar
 * meter el pool de Postgres o BETTER_AUTH_SECRET en el bundle del navegador.
 *
 * En vitest el paquete `server-only` está redirigido a su `empty.js` (vitest.config.ts),
 * así que importar estos módulos no falla aquí: por eso se comprueba el fuente.
 */
const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const MARKER = /^import "server-only";$/m;

describe("frontera server-only", () => {
  it.each(["src/db/index.ts", "src/db/hub.ts", "src/lib/auth/auth.ts"])("%s solo se puede importar en servidor", (rel) => {
    expect(read(rel)).toMatch(MARKER);
  });

  // hub-pool.spec.ts (Playwright, Node sin la condición react-server) importa la
  // configuración del pool: tiene que seguir siendo un módulo puro.
  it("la configuración pura del pool del hub no lleva server-only", () => {
    expect(read("src/db/hub-config.ts")).not.toMatch(MARKER);
    expect(read("e2e/specs/hub-pool.spec.ts")).toContain('from "../../src/db/hub-config"');
  });
});
