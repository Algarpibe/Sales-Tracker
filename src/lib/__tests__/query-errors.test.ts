import { describe, it, expect } from "vitest";
import { AppError, HUB_COMPANY_FORBIDDEN_MESSAGE, RATE_LIMITED_MESSAGE } from "@/lib/errors";
import { READ_ERROR_MESSAGE, readErrorMessage, retryUnlessRateLimited, throwOnlyWithoutData } from "@/lib/query-errors";

describe("throwOnlyWithoutData", () => {
  it("sube el error al boundary si la consulta no tiene datos que mostrar", () => {
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: undefined } })).toBe(true);
  });

  it("un refetch fallido con datos previos no tira la tarjeta", () => {
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: [] } })).toBe(false);
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: null } })).toBe(false);
  });
});

// SEC-006: un 429 de /api/data no es un fallo transitorio que convenga reintentar al
// instante (sería otra petición contra el mismo límite) ni un error genérico: la
// tarjeta explica que hay que esperar. No cierra la sesión ni redirige.
describe("retryUnlessRateLimited", () => {
  it("reintenta una vez los errores normales, como antes (retry: 1)", () => {
    expect(retryUnlessRateLimited(0, new Error("red"))).toBe(true);
    expect(retryUnlessRateLimited(1, new Error("red"))).toBe(false);
  });

  it("no reintenta un 429 del límite por usuario", () => {
    expect(retryUnlessRateLimited(0, new AppError(RATE_LIMITED_MESSAGE, "RATE_LIMITED"))).toBe(false);
  });
});

describe("readErrorMessage", () => {
  it("con el límite por usuario, explica que hay que esperar", () => {
    expect(readErrorMessage(new AppError(RATE_LIMITED_MESSAGE, "RATE_LIMITED"))).toBe(RATE_LIMITED_MESSAGE);
  });

  // SEC-035: la empresa de la sesión no es la dueña del hub. Es un 403 de /api/data que
  // no cierra la sesión: la tarjeta explica por qué no hay datos.
  it("sin acceso al hub por empresa, la tarjeta lo explica", () => {
    expect(readErrorMessage(new AppError(HUB_COMPANY_FORBIDDEN_MESSAGE, "FORBIDDEN"))).toBe(HUB_COMPANY_FORBIDDEN_MESSAGE);
  });

  it("otro FORBIDDEN conserva el mensaje genérico", () => {
    expect(readErrorMessage(new AppError("Alguna categoría no pertenece a tu empresa.", "FORBIDDEN"))).toBe(
      READ_ERROR_MESSAGE
    );
    expect(readErrorMessage(new AppError(HUB_COMPANY_FORBIDDEN_MESSAGE, "HTTP_403"))).toBe(READ_ERROR_MESSAGE);
  });

  it("cualquier otro error muestra el mensaje genérico de carga (nunca el detalle)", () => {
    expect(readErrorMessage(new Error("connect ECONNREFUSED host-interno"))).toBe(READ_ERROR_MESSAGE);
    expect(readErrorMessage(new AppError("Debes iniciar sesión.", "UNAUTHORIZED"))).toBe(READ_ERROR_MESSAGE);
    expect(readErrorMessage(undefined)).toBe(READ_ERROR_MESSAGE);
    expect(READ_ERROR_MESSAGE).toBe("No se pudieron cargar los datos.");
  });
});
