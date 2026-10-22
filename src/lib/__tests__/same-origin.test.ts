import { describe, it, expect } from "vitest";
import { expectedOrigin, isSameOriginRequest } from "@/lib/same-origin";

const APP = "https://app.example.test";

describe("expectedOrigin", () => {
  it("usa el origen de BETTER_AUTH_URL cuando está definido", () => {
    expect(expectedOrigin("https://app.example.test/", "http://0.0.0.0:3000")).toBe(APP);
  });

  it("ignora la ruta de BETTER_AUTH_URL y se queda con el origen", () => {
    expect(expectedOrigin("https://app.example.test/api/auth", "http://0.0.0.0:3000")).toBe(APP);
  });

  it("cae al origen de la propia petición si BETTER_AUTH_URL no está", () => {
    expect(expectedOrigin(undefined, "http://localhost:3000")).toBe("http://localhost:3000");
    expect(expectedOrigin("", "http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("cae al origen de la petición si BETTER_AUTH_URL no es una URL válida", () => {
    expect(expectedOrigin("no-es-una-url", "http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("isSameOriginRequest", () => {
  it("acepta un Origin igual al de la app", () => {
    expect(isSameOriginRequest({ origin: APP, secFetchSite: "same-origin", expected: APP })).toBe(true);
  });

  it("compara el Origin normalizado (mayúsculas en el host)", () => {
    expect(isSameOriginRequest({ origin: "https://APP.example.test", secFetchSite: null, expected: APP })).toBe(true);
  });

  it("rechaza un Origin de otro sitio aunque Sec-Fetch-Site diga same-origin", () => {
    expect(isSameOriginRequest({ origin: "https://evil.example", secFetchSite: "same-origin", expected: APP })).toBe(false);
  });

  it("rechaza otro puerto o esquema del mismo host", () => {
    expect(isSameOriginRequest({ origin: "http://app.example.test", secFetchSite: null, expected: APP })).toBe(false);
    expect(isSameOriginRequest({ origin: "https://app.example.test:8443", secFetchSite: null, expected: APP })).toBe(false);
  });

  it("rechaza el Origin opaco 'null' y uno mal formado", () => {
    expect(isSameOriginRequest({ origin: "null", secFetchSite: null, expected: APP })).toBe(false);
    expect(isSameOriginRequest({ origin: "%%%", secFetchSite: null, expected: APP })).toBe(false);
  });

  it("sin Origin, acepta Sec-Fetch-Site same-origin y none", () => {
    expect(isSameOriginRequest({ origin: null, secFetchSite: "same-origin", expected: APP })).toBe(true);
    expect(isSameOriginRequest({ origin: null, secFetchSite: "none", expected: APP })).toBe(true);
  });

  it("sin Origin, rechaza Sec-Fetch-Site cross-site y same-site", () => {
    expect(isSameOriginRequest({ origin: null, secFetchSite: "cross-site", expected: APP })).toBe(false);
    expect(isSameOriginRequest({ origin: null, secFetchSite: "same-site", expected: APP })).toBe(false);
  });

  it("sin Origin ni Sec-Fetch-Site (cliente no navegador) deja pasar", () => {
    expect(isSameOriginRequest({ origin: null, secFetchSite: null, expected: APP })).toBe(true);
  });
});
