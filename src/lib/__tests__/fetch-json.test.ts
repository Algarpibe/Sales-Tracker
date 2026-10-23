import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError, RATE_LIMITED_MESSAGE } from "@/lib/errors";
import { dataUrl, fetchJson } from "@/lib/fetch-json";

/**
 * DATA-043: el fetcher de las lecturas por GET /api/data. react-query distingue éxito y
 * error por si la promesa se rechaza: una respuesta no-OK se convierte en AppError con
 * el mensaje YA saneado por el servidor, nunca con el cuerpo crudo (HTML del proxy, un
 * 502 del balanceador...).
 */

const fetchMock = vi.fn();

function respuesta(body: string, status: number, contentType = "application/json") {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dataUrl", () => {
  it("monta la ruta del recurso y omite los parámetros vacíos", () => {
    expect(dataUrl("customer-item", { tipo: "INVOICE", anio: 2025, customer: undefined, owner: null })).toBe(
      "/api/data/customer-item?tipo=INVOICE&anio=2025",
    );
  });

  it("codifica los valores (un nombre de cliente con & o espacios no rompe la query)", () => {
    expect(dataUrl("margin-by-customer", { customer: "Cliente A & Cía / 50%" })).toBe(
      "/api/data/margin-by-customer?customer=Cliente+A+%26+C%C3%ADa+%2F+50%25",
    );
  });

  it("los booleanos viajan como true/false y la cadena vacía se conserva", () => {
    expect(dataUrl("customer-sales", { includeHistory: true, customer: "" })).toBe(
      "/api/data/customer-sales?includeHistory=true&customer=",
    );
    expect(dataUrl("customer-sales", { includeHistory: false })).toBe("/api/data/customer-sales?includeHistory=false");
  });

  it("sin parámetros no añade '?'", () => {
    expect(dataUrl("categories")).toBe("/api/data/categories");
  });

  it("codifica el nombre del recurso", () => {
    expect(dataUrl("../x")).toBe("/api/data/..%2Fx");
  });
});

describe("fetchJson", () => {
  it("pide JSON sin caché del navegador y con las cookies del mismo origen", async () => {
    fetchMock.mockResolvedValue(respuesta("[1,2]", 200));
    await expect(fetchJson<number[]>("categories")).resolves.toEqual([1, 2]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/data/categories");
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
  });

  it("devuelve null tal cual (p. ej. layout sin personalizar)", async () => {
    fetchMock.mockResolvedValue(respuesta("null", 200));
    await expect(fetchJson("dashboard-layout")).resolves.toBeNull();
  });

  it.each([
    [401, { error: "Debes iniciar sesión.", code: "UNAUTHORIZED" }],
    [403, { error: "Tu cuenta está pendiente de aprobación.", code: "NOT_APPROVED" }],
    [400, { error: "Año fuera de rango", code: "VALIDATION" }],
    [500, { error: "Ocurrió un error interno. Inténtalo de nuevo.", code: "INTERNAL" }],
  ])("%i JSON → AppError con el mensaje y el código del servidor", async (status, body) => {
    fetchMock.mockResolvedValue(respuesta(JSON.stringify(body), status));
    const e = await fetchJson("sales").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ message: body.error, code: body.code });
  });

  it("429 del límite por usuario (SEC-006): AppError RATE_LIMITED con el mensaje del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(JSON.stringify({ error: RATE_LIMITED_MESSAGE, code: "RATE_LIMITED" }), 429));
    await expect(fetchJson("sales")).rejects.toMatchObject({ message: RATE_LIMITED_MESSAGE, code: "RATE_LIMITED" });
  });

  it("un 429 sin el JSON del servidor también se explica como límite, no como fallo genérico", async () => {
    fetchMock.mockResolvedValue(respuesta("Too Many Requests", 429, "text/plain"));
    await expect(fetchJson("sales")).rejects.toMatchObject({ message: RATE_LIMITED_MESSAGE, code: "RATE_LIMITED" });
  });

  it("un error sin JSON (HTML, texto) no filtra el cuerpo: mensaje genérico", async () => {
    fetchMock.mockResolvedValue(respuesta("<html>fallo simulado en host-interno</html>", 502, "text/html"));
    const e = await fetchJson("sales").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ message: "No se pudieron cargar los datos.", code: "HTTP_502" });
  });

  it("un JSON de error sin forma conocida usa el mensaje genérico", async () => {
    fetchMock.mockResolvedValue(respuesta('{"detail":"x"}', 500));
    await expect(fetchJson("sales")).rejects.toMatchObject({ message: "No se pudieron cargar los datos.", code: "HTTP_500" });
  });

  it("un 200 que no es JSON (p. ej. una página HTML tras una redirección) es un error", async () => {
    fetchMock.mockResolvedValue(respuesta("<html>login</html>", 200, "text/html"));
    await expect(fetchJson("sales")).rejects.toMatchObject({ message: "No se pudieron cargar los datos.", code: "HTTP_200" });
  });

  it("un JSON de error ilegible no rompe: mensaje genérico", async () => {
    fetchMock.mockResolvedValue(respuesta("{roto", 500));
    await expect(fetchJson("sales")).rejects.toMatchObject({ message: "No se pudieron cargar los datos." });
  });

  it("un fallo de red se propaga tal cual (react-query reintenta)", async () => {
    const red = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(red);
    await expect(fetchJson("sales")).rejects.toBe(red);
  });
});
