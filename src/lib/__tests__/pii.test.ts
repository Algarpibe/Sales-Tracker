import { describe, it, expect } from "vitest";
import { dropPiiKeys, redactEmails } from "@/lib/pii";

describe("dropPiiKeys", () => {
  it("descarta las claves personales a cualquier profundidad", () => {
    expect(
      dropPiiKeys({
        "e-mail": "a@b.co",
        userName: "X",
        dirección: "Calle 1",
        ok: 1,
        nested: [{ teléfono: "300", rows: 2 }],
      })
    ).toEqual({ ok: 1, nested: [{ rows: 2 }] });
  });

  it("solo acota los textos cuando se pide un máximo", () => {
    const long = "x".repeat(500);
    expect(dropPiiKeys({ s: long })).toEqual({ s: long });
    expect(dropPiiKeys({ s: long }, { maxText: 120 })).toEqual({ s: "x".repeat(120) });
  });

  it("devuelve tal cual los valores no objeto", () => {
    expect(dropPiiKeys(5)).toBe(5);
    expect(dropPiiKeys(null)).toBeNull();
  });
});

describe("redactEmails", () => {
  it("sustituye cada email por [email]", () => {
    expect(redactEmails("de a.b@x.co para c-d+e@sub.dominio.com")).toBe("de [email] para [email]");
  });

  it("no toca rutas de paquetes con versión", () => {
    const stack = "at fn (node_modules/next@16.0.1/dist/server.js:10:5)";
    expect(redactEmails(stack)).toBe(stack);
  });
});
