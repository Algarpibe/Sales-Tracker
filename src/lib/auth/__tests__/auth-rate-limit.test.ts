import { describe, it, expect } from "vitest";
import { auth } from "@/lib/auth/auth";

/**
 * Cada regla de rate limit tiene que apuntar a una ruta que better-auth expone de
 * verdad: una regla sobre una ruta inexistente no protege nada y da falsa
 * seguridad (p. ej. "/forget-password", que better-auth 1.6 ya no tiene).
 */
describe("rateLimit.customRules", () => {
  it("solo contiene rutas que existen en better-auth", () => {
    const rutas = new Set(
      Object.values(auth.api as Record<string, { path?: string }>)
        .map((e) => e?.path)
        .filter((p): p is string => typeof p === "string")
    );
    const reglas = Object.keys(auth.options.rateLimit?.customRules ?? {});
    expect(reglas.length).toBeGreaterThan(0);
    expect(reglas.filter((r) => !rutas.has(r))).toEqual([]);
  });
});
