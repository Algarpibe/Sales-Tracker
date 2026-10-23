import { describe, it, expect, vi } from "vitest";

const created = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/auth/new-user-profile", () => ({
  createProfileForNewUser: async (id: string) => {
    created.push(id);
  },
}));

const purge = vi.hoisted(() => ({ calls: 0, impl: (): Promise<void> => Promise.resolve() }));
vi.mock("@/lib/auth/session-purge", () => ({
  purgeExpiredAuthRows: () => {
    purge.calls += 1;
    return purge.impl();
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

// PRIV-093: al crear una sesión se purgan las caducadas (con su IP y user-agent). Se
// lanza sin esperarla: una purga lenta o colgada no puede retrasar el login.
describe("purga de sesiones caducadas al iniciar sesión", () => {
  it("al crear una sesión lanza la purga y no espera a que termine", async () => {
    const after = auth.options.databaseHooks?.session?.create?.after;
    expect(after).toBeTypeOf("function");
    purge.calls = 0;
    purge.impl = () => new Promise<void>(() => {}); // nunca termina
    await expect(after!()).resolves.toBeUndefined();
    expect(purge.calls).toBe(1);
  });
});

describe("auditoría de login (ARQ-078)", () => {
  it("registra un hook after para auditar los logins fallidos", () => {
    expect(auth.options.hooks?.after).toBeTypeOf("function");
  });
});
