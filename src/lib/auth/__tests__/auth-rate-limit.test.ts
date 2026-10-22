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

/**
 * El contador de better-auth 1.6 solo se reinicia tras `window` segundos SIN
 * peticiones (lastRequest avanza con cada una). Con tráfico continuo desde una IP
 * compartida (la oficina tras NAT) /get-session acumula hasta `max` y devuelve 429:
 * el cliente se queda sin sesión. Es de solo lectura y exige cookie, así que no se
 * limita; login y registro siguen con sus reglas estrictas.
 */
describe("rateLimit de /get-session", () => {
  it("no se limita: un 429 dejaría al usuario sin sesión en el cliente", () => {
    expect(auth.options.rateLimit?.customRules?.["/get-session"]).toBe(false);
  });

  it("login y registro siguen limitados", () => {
    const reglas = auth.options.rateLimit?.customRules ?? {};
    expect(reglas["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    expect(reglas["/sign-up/email"]).toEqual({ window: 60, max: 5 });
  });
});
