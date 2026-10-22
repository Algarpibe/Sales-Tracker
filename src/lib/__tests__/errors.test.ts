import { describe, it, expect } from "vitest";
import { AppError, authErrorStatus } from "@/lib/errors";

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
