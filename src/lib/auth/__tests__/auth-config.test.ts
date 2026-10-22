import { describe, it, expect, vi } from "vitest";

const created = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/auth/new-user-profile", () => ({
  createProfileForNewUser: async (id: string) => {
    created.push(id);
  },
}));

import { auth } from "@/lib/auth/auth";

describe("configuración de better-auth", () => {
  // SEC-039: con autoSignIn activo, registrarse con un email existente devolvía
  // USER_ALREADY_EXISTS (enumeración de cuentas). Sin él, better-auth responde igual
  // exista o no el email, y nadie entra hasta que un admin apruebe la cuenta.
  it("no inicia sesión al registrarse", () => {
    expect(auth.options.emailAndPassword?.autoSignIn).toBe(false);
  });

  it("al crear un usuario delega el alta del perfil en createProfileForNewUser", async () => {
    const after = auth.options.databaseHooks?.user?.create?.after;
    expect(after).toBeTypeOf("function");
    await after!({ id: "user-1" } as never);
    expect(created).toEqual(["user-1"]);
  });
});
