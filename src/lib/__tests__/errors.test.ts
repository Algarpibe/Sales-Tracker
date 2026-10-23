import { describe, it, expect } from "vitest";
import { AppError, authErrorStatus, unwrapAction, userErrorMessage } from "@/lib/errors";

describe("authErrorStatus", () => {
  it("traduce la falta de sesion a 401", () => {
    expect(authErrorStatus(new AppError("Debes iniciar sesión.", "UNAUTHORIZED"))).toBe(401);
  });

  it("traduce una cuenta no aprobada o sin permisos a 403", () => {
    expect(authErrorStatus(new AppError("Pendiente", "NOT_APPROVED"))).toBe(403);
    expect(authErrorStatus(new AppError("Sin permisos", "FORBIDDEN"))).toBe(403);
  });

  it("deja pasar cualquier otro error", () => {
    expect(authErrorStatus(new AppError("Otro", "VALIDATION"))).toBeNull();
    expect(authErrorStatus(new Error("boom"))).toBeNull();
  });
});

describe("unwrapAction", () => {
  it("devuelve los datos de un resultado correcto", () => {
    expect(unwrapAction({ ok: true, data: 7 })).toBe(7);
  });

  it("convierte un resultado fallido en AppError con su mensaje y código", () => {
    expect(() => unwrapAction({ ok: false, error: "Límite alcanzado", code: "LIMIT" })).toThrow(
      expect.objectContaining({ name: "AppError", message: "Límite alcanzado", code: "LIMIT" })
    );
  });
});

describe("userErrorMessage", () => {
  it("muestra el mensaje de un AppError (ya saneado en el servidor)", () => {
    expect(userErrorMessage(new AppError("Nombre duplicado", "VALIDATION"), "No se pudo guardar")).toBe("Nombre duplicado");
  });

  it("nunca muestra el mensaje crudo de otro error: usa el genérico", () => {
    expect(userErrorMessage(new Error("ECONNREFUSED 10.0.0.1:5432"), "No se pudo guardar")).toBe("No se pudo guardar");
    expect(userErrorMessage("boom", "No se pudo guardar")).toBe("No se pudo guardar");
  });
});
