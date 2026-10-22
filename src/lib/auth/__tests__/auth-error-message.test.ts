import { describe, it, expect } from "vitest";
import {
  authErrorMessage,
  AUTH_ERROR_FALLBACK,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/auth-error-message";

describe("authErrorMessage", () => {
  it("traduce la contraseña corta citando el mínimo real del servidor", () => {
    expect(authErrorMessage({ code: "PASSWORD_TOO_SHORT", status: 400, message: "Password too short" })).toBe(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  });

  it("traduce la contraseña demasiado larga", () => {
    expect(authErrorMessage({ code: "PASSWORD_TOO_LONG", status: 400 })).toBe(
      "La contraseña es demasiado larga.",
    );
  });

  it("traduce el email no válido", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL", status: 400 })).toBe(
      "El correo electrónico no es válido.",
    );
  });

  it("traduce credenciales incorrectas sin decir cuál de las dos falla", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe(
      "Correo o contraseña incorrectos.",
    );
  });

  // El limitador de better-auth responde 429 sin `code`, solo con un mensaje en inglés.
  it("traduce el límite de intentos por el estado 429 aunque no haya código", () => {
    expect(
      authErrorMessage({ status: 429, message: "Too many requests. Please try again later." }),
    ).toBe("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
  });

  it("nunca muestra el mensaje en inglés de un código desconocido", () => {
    expect(authErrorMessage({ code: "FAILED_TO_CREATE_USER", status: 422, message: "Failed to create user" })).toBe(
      AUTH_ERROR_FALLBACK,
    );
    expect(authErrorMessage({ status: 500, message: "Internal Server Error" })).toBe(AUTH_ERROR_FALLBACK);
  });

  // SEC-039: el registro responde igual exista o no el email. Si alguna vez llegara
  // este código, la pantalla no debe delatar que la cuenta existe.
  it("no delata que un email ya está registrado", () => {
    const msg = authErrorMessage({ code: "USER_ALREADY_EXISTS", status: 422, message: "User already exists." });
    expect(msg).toBe(AUTH_ERROR_FALLBACK);
    expect(msg).not.toMatch(/existe|registrad/i);
  });

  it("devuelve el genérico sin error o sin datos", () => {
    expect(authErrorMessage(null)).toBe(AUTH_ERROR_FALLBACK);
    expect(authErrorMessage(undefined)).toBe(AUTH_ERROR_FALLBACK);
    expect(authErrorMessage({})).toBe(AUTH_ERROR_FALLBACK);
  });
});
