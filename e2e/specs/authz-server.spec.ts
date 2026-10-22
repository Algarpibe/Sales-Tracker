import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { APP_SERVER_URL } from "../db/config.mjs";
import { APPROVED_USER, APPROVED_STATE, LECTOR_USER, PENDING_USER, PENDING_STATE } from "../constants";

/**
 * Autorizacion aplicada por el SERVIDOR, no por la UI. Ninguna prueba hace login:
 * reutiliza los storageState de auth.setup.ts y no gasta presupuesto de sign-in.
 */

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: APP_SERVER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql, params);
    return rows;
  } finally {
    await client.end();
  }
}

async function userId(email: string): Promise<string> {
  const [row] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  return row.id;
}

// PNG minimo: la cabecera basta para pasar la deteccion por magic bytes de la ruta.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

test.describe("cuenta pendiente de aprobacion", () => {
  test.use({ storageState: PENDING_STATE });

  // El middleware ya redirige (307) a /waiting-approval cualquier ruta no aprobada,
  // incluida /api/avatar; la ruta ademas responde 401/403 por si el middleware
  // fallara (eso lo cubre src/lib/auth/__tests__/authz-server.test.ts). Aqui se
  // fija el resultado de punta a punta: la peticion no se acepta y no se guarda nada.
  test("no puede subir un avatar", async ({ page }) => {
    const id = await userId(PENDING_USER.email);

    const res = await page.request.post("/api/avatar", {
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
      maxRedirects: 0,
    });

    expect([307, 401, 403]).toContain(res.status());
    const [p] = await query<{ con_avatar: boolean }>(
      `SELECT avatar IS NOT NULL AS con_avatar FROM profiles WHERE id = $1`,
      [id],
    );
    expect(p.con_avatar).toBe(false);
  });

  test("no puede leer ni su propio avatar", async ({ page }) => {
    const id = await userId(PENDING_USER.email);
    // Sin avatar la ruta responderia 404 y la prueba no distinguiria nada.
    await query(`UPDATE profiles SET avatar = $1, avatar_mime = 'image/png' WHERE id = $2`, [PNG, id]);
    try {
      const res = await page.request.get(`/api/avatar/${id}`, { maxRedirects: 0 });

      expect([307, 401, 403]).toContain(res.status());
      expect(res.headers()["content-type"] ?? "").not.toContain("image/");
    } finally {
      await query(`UPDATE profiles SET avatar = NULL, avatar_mime = NULL WHERE id = $1`, [id]);
    }
  });
});

test.describe("administrador sobre su propia cuenta", () => {
  test.use({ storageState: APPROVED_STATE });

  const PROPIA_CUENTA = "No puedes modificar tu propia cuenta de administrador.";

  /**
   * La UI no pinta acciones en la fila propia, asi que se dispara la accion real
   * sobre la fila del lector y se reescribe el id destino en la peticion de la
   * Server Action (cabecera Next-Action) por el del admin en sesion. El servidor
   * recibe exactamente lo que mandaria un cliente manipulado; el lector no se toca.
   */
  async function redirigirAccionesAlAdmin(page: Page, lectorId: string, adminId: string) {
    const reescritas = { total: 0 };
    await page.route(
      (url) => url.pathname === "/admin/users",
      async (route) => {
        const req = route.request();
        const body = req.postData();
        if (req.method() === "POST" && req.headers()["next-action"] && body?.includes(lectorId)) {
          reescritas.total += 1;
          await route.continue({ postData: body.replaceAll(lectorId, adminId) });
          return;
        }
        await route.continue();
      },
    );
    return reescritas;
  }

  async function perfilAdmin(adminId: string) {
    const [p] = await query<{ role: string; is_active: boolean; is_approved: boolean; is_rejected: boolean }>(
      `SELECT role, is_active, is_approved, is_rejected FROM profiles WHERE id = $1`,
      [adminId],
    );
    return p;
  }

  const ADMIN_INTACTO = { role: "admin", is_active: true, is_approved: true, is_rejected: false };

  async function preparar(page: Page) {
    const adminId = await userId(APPROVED_USER.email);
    const lectorId = await userId(LECTOR_USER.email);
    const reescritas = await redirigirAccionesAlAdmin(page, lectorId, adminId);
    await page.goto("/admin/users");
    const filaLector = page.getByRole("row").filter({ hasText: LECTOR_USER.email });
    await expect(filaLector).toBeVisible();
    return { adminId, reescritas, filaLector };
  }

  test("la fila propia no ofrece acciones", async ({ page }) => {
    await page.goto("/admin/users");
    const filaPropia = page.getByRole("row").filter({ hasText: APPROVED_USER.email });
    await expect(filaPropia).toBeVisible();
    await expect(filaPropia.getByRole("button")).toHaveCount(0);
    await expect(filaPropia.getByRole("combobox")).toHaveCount(0);
  });

  test("el servidor no le deja quitarse el rol de administrador", async ({ page }) => {
    const { adminId, reescritas, filaLector } = await preparar(page);

    await filaLector.getByRole("combobox").click();
    await page.getByRole("option", { name: "Editor", exact: true }).click();
    await filaLector.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(PROPIA_CUENTA)).toBeVisible();
    expect(reescritas.total).toBe(1);
    expect(await perfilAdmin(adminId)).toEqual(ADMIN_INTACTO);
  });

  test("el servidor no le deja desactivarse", async ({ page }) => {
    const { adminId, reescritas, filaLector } = await preparar(page);

    await filaLector.getByRole("button", { name: "Desactivar" }).click();

    await expect(page.getByText(PROPIA_CUENTA)).toBeVisible();
    expect(reescritas.total).toBe(1);
    expect(await perfilAdmin(adminId)).toEqual(ADMIN_INTACTO);
  });

  test("el servidor no le deja borrarse", async ({ page }) => {
    const { adminId, reescritas, filaLector } = await preparar(page);

    // El boton de la papelera no tiene texto: es el ultimo boton de la fila
    // (el selector de rol es un combobox, no un boton).
    await filaLector.getByRole("button").last().click();
    await page.getByRole("button", { name: "Eliminar Definitivamente" }).click();

    await expect(page.getByText(PROPIA_CUENTA)).toBeVisible();
    expect(reescritas.total).toBe(1);
    expect(await perfilAdmin(adminId)).toEqual(ADMIN_INTACTO);
    const usuarios = await query(`SELECT 1 FROM "user" WHERE id = $1`, [adminId]);
    expect(usuarios).toHaveLength(1);
  });
});
