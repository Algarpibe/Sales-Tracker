import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Comprueba que la autorizacion la hace el SERVIDOR (route handlers y Server
 * Actions), no el middleware ni la UI. Los guards reales de guards.ts corren tal
 * cual: solo se sustituyen la sesion de better-auth y la BD por dobles en memoria.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  // Resultados que devuelven, en orden, las consultas db.select(...).
  selects: [] as unknown[][],
  updates: [] as { values: Record<string, unknown> }[],
  deletes: 0,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("@/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "for", "innerJoin", "orderBy"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.selects.shift() ?? []).then(resolve, reject);
    return c;
  };
  const db = {
    select: () => chain(),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ values });
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deletes += 1;
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTRO_ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const PENDIENTE_ID = "33333333-3333-4333-8333-333333333333";
const COMPANY = "99999999-9999-4999-8999-999999999999";

function profile(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    company_id: COMPANY,
    role: "admin",
    is_active: true,
    is_approved: true,
    is_rejected: false,
    has_avatar: false,
    ...over,
  };
}

/** Inicia sesion como `id`; su perfil es lo primero que consulta el guard. */
function loginAs(id: string, over: Record<string, unknown> = {}) {
  state.session = { user: { id, email: `${id}@example.test` } };
  state.selects.push([profile(id, over)]);
}

const PENDIENTE = { role: "lector", is_approved: false };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

function uploadRequest() {
  const form = new FormData();
  form.append("file", new File([PNG], "a.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/avatar", { method: "POST", body: form });
}

beforeEach(() => {
  state.session = null;
  state.selects = [];
  state.updates = [];
  state.deletes = 0;
});

describe("POST /api/avatar", () => {
  it("rechaza con 401 sin sesion", async () => {
    const { POST } = await import("@/app/api/avatar/route");
    const res = await POST(uploadRequest());
    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it("rechaza con 403 a una cuenta pendiente y no guarda nada", async () => {
    const { POST } = await import("@/app/api/avatar/route");
    loginAs(PENDIENTE_ID, PENDIENTE);
    const res = await POST(uploadRequest());
    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it("guarda el avatar de una cuenta aprobada", async () => {
    const { POST } = await import("@/app/api/avatar/route");
    loginAs(ADMIN_ID);
    const res = await POST(uploadRequest());
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
  });
});

describe("GET /api/avatar/[userId]", () => {
  const avatarRow = [{ avatar: PNG, mime: "image/png", company_id: COMPANY }];
  const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
  const req = () => new NextRequest("http://localhost/api/avatar/x");

  it("rechaza con 401 sin sesion", async () => {
    const { GET } = await import("@/app/api/avatar/[userId]/route");
    state.selects.push(avatarRow);
    const res = await GET(req(), params(ADMIN_ID));
    expect(res.status).toBe(401);
  });

  it("rechaza con 403 a una cuenta pendiente, incluso su propio avatar", async () => {
    const { GET } = await import("@/app/api/avatar/[userId]/route");
    loginAs(PENDIENTE_ID, PENDIENTE);
    state.selects.push(avatarRow);
    const res = await GET(req(), params(PENDIENTE_ID));
    expect(res.status).toBe(403);
  });

  it("sirve el avatar de alguien de la misma empresa a una cuenta aprobada", async () => {
    const { GET } = await import("@/app/api/avatar/[userId]/route");
    loginAs(ADMIN_ID);
    state.selects.push(avatarRow);
    const res = await GET(req(), params(OTRO_ADMIN_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});

describe("updateMyAccount", () => {
  it("rechaza a una cuenta pendiente sin tocar la BD", async () => {
    const { updateMyAccount } = await import("@/actions/settings-actions");
    loginAs(PENDIENTE_ID, PENDIENTE);
    const res = await updateMyAccount({ full_name: "Nombre Nuevo" });
    expect(res).toMatchObject({ ok: false, code: "NOT_APPROVED" });
    expect(state.updates).toHaveLength(0);
  });

  it("deja a una cuenta aprobada cambiar su nombre", async () => {
    const { updateMyAccount } = await import("@/actions/settings-actions");
    loginAs(ADMIN_ID);
    const res = await updateMyAccount({ full_name: "Nombre Nuevo" });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.updates).toHaveLength(1);
  });
});

describe("acciones de administrador sobre administradores", () => {
  /** Admin en sesion + perfil destino + administradores activos de la empresa. */
  function prepare(activeAdminIds: string[]) {
    loginAs(ADMIN_ID);
    state.selects.push([{ company_id: COMPANY }]);
    state.selects.push(activeAdminIds.map((id) => ({ id })));
  }

  const SELF = "No puedes modificar tu propia cuenta de administrador.";
  const LAST = "La empresa debe conservar al menos un administrador activo.";

  it("updateUserRole no deja al admin degradarse a si mismo", async () => {
    const { updateUserRole } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await updateUserRole(ADMIN_ID, "lector");
    expect(res).toEqual({ ok: false, error: SELF, code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("deactivateUser no deja al admin desactivarse a si mismo", async () => {
    const { deactivateUser } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await deactivateUser(ADMIN_ID);
    expect(res).toEqual({ ok: false, error: SELF, code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("deleteUser no deja al admin borrarse a si mismo", async () => {
    const { deleteUser } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await deleteUser(ADMIN_ID);
    expect(res).toEqual({ ok: false, error: SELF, code: "FORBIDDEN" });
    expect(state.deletes).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it("approveUser no deja al admin cambiarse el rol a si mismo", async () => {
    const { approveUser } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await approveUser(ADMIN_ID, "lector");
    expect(res).toEqual({ ok: false, error: SELF, code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("no deja a la empresa sin administradores activos", async () => {
    const { updateUserRole } = await import("@/actions/admin-actions");
    // Carrera: el actor fue degradado en paralelo; bajo el bloqueo solo queda el destino.
    prepare([OTRO_ADMIN_ID]);
    const res = await updateUserRole(OTRO_ADMIN_ID, "editor");
    expect(res).toEqual({ ok: false, error: LAST, code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("permite degradar a otro administrador si queda uno activo", async () => {
    const { updateUserRole } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await updateUserRole(OTRO_ADMIN_ID, "editor");
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.updates).toEqual([{ values: { role: "editor" } }]);
  });

  it("permite borrar a otro administrador si queda uno activo", async () => {
    const { deleteUser } = await import("@/actions/admin-actions");
    prepare([ADMIN_ID, OTRO_ADMIN_ID]);
    const res = await deleteUser(OTRO_ADMIN_ID);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.deletes).toBeGreaterThan(0);
  });
});
