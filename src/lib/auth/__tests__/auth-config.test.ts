import { describe, it, expect, vi } from "vitest";

const created = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/auth/new-user-profile", () => ({
  createProfileForNewUser: async (id: string) => {
    created.push(id);
  },
}));

import { auth } from "@/lib/auth/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/auth-error-message";

describe("configuración de better-auth", () => {
  // SEC-039: con autoSignIn activo, registrarse con un email existente devolvía
  // USER_ALREADY_EXISTS (enumeración de cuentas). Sin él, better-auth responde igual
  // exista o no el email, y nadie entra hasta que un admin apruebe la cuenta.
  it("no inicia sesión al registrarse", () => {
    expect(auth.options.emailAndPassword?.autoSignIn).toBe(false);
  });

  // FE-063: el formulario de registro valida con MIN_PASSWORD_LENGTH; si el servidor
  // exigiera otro mínimo, el cliente dejaría pasar contraseñas que luego se rechazan.
  it("exige el mismo mínimo de contraseña que valida el formulario", () => {
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(MIN_PASSWORD_LENGTH);
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });

  it("al crear un usuario delega el alta del perfil en createProfileForNewUser", async () => {
    const after = auth.options.databaseHooks?.user?.create?.after;
    expect(after).toBeTypeOf("function");
    await after!({ id: "user-1" } as never);
    expect(created).toEqual(["user-1"]);
  });
});
