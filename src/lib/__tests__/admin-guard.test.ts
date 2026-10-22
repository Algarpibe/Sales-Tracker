import { describe, it, expect } from "vitest";
import { adminChangeError, SELF_ADMIN_CHANGE, LAST_ACTIVE_ADMIN } from "@/lib/admin-guard";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTRO_ADMIN = "22222222-2222-4222-8222-222222222222";
const LECTOR = "33333333-3333-4333-8333-333333333333";

describe("adminChangeError", () => {
  it("rechaza que el administrador actue sobre su propia cuenta", () => {
    expect(
      adminChangeError({ actorId: ADMIN, targetId: ADMIN, removesAdmin: true, activeAdminIds: [ADMIN, OTRO_ADMIN] }),
    ).toBe(SELF_ADMIN_CHANGE);
  });

  it("rechaza la propia cuenta aunque el cambio no le quite el rol", () => {
    expect(
      adminChangeError({ actorId: ADMIN, targetId: ADMIN, removesAdmin: false, activeAdminIds: [ADMIN] }),
    ).toBe(SELF_ADMIN_CHANGE);
  });

  it("permite quitar el rol a otro administrador si queda al menos uno activo", () => {
    expect(
      adminChangeError({ actorId: ADMIN, targetId: OTRO_ADMIN, removesAdmin: true, activeAdminIds: [ADMIN, OTRO_ADMIN] }),
    ).toBeNull();
  });

  it("rechaza dejar a la empresa sin administradores activos", () => {
    // Carrera: el actor fue degradado en paralelo y ya no figura entre los activos.
    expect(
      adminChangeError({ actorId: ADMIN, targetId: OTRO_ADMIN, removesAdmin: true, activeAdminIds: [OTRO_ADMIN] }),
    ).toBe(LAST_ACTIVE_ADMIN);
  });

  it("no cuenta como perdida un cambio que conserva el rol de administrador", () => {
    expect(
      adminChangeError({ actorId: ADMIN, targetId: OTRO_ADMIN, removesAdmin: false, activeAdminIds: [OTRO_ADMIN] }),
    ).toBeNull();
  });

  it("permite actuar sobre un usuario que no es administrador activo", () => {
    expect(
      adminChangeError({ actorId: ADMIN, targetId: LECTOR, removesAdmin: true, activeAdminIds: [ADMIN] }),
    ).toBeNull();
  });
});
