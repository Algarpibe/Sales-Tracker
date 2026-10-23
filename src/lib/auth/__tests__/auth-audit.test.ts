import { describe, it, expect } from "vitest";
import { APIError } from "better-auth/api";
import { signInFailureAudit } from "@/lib/auth/auth-audit";

describe("signInFailureAudit", () => {
  it("un login con credenciales malas da una entrada de auditoría sin datos personales", () => {
    const returned = new APIError("UNAUTHORIZED", {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
    const entry = signInFailureAudit("/sign-in/email", returned);
    expect(entry).toEqual({
      action: "auth.sign_in_failed",
      meta: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    expect(JSON.stringify(entry)).not.toMatch(/@/);
  });

  it("un login correcto no audita nada", () => {
    expect(signInFailureAudit("/sign-in/email", { token: "t", user: { email: "a@b.c" } })).toBeNull();
  });

  it("solo mira el login por email", () => {
    const returned = new APIError("BAD_REQUEST", { code: "X", message: "x" });
    expect(signInFailureAudit("/sign-up/email", returned)).toBeNull();
    expect(signInFailureAudit("/get-session", returned)).toBeNull();
  });
});
