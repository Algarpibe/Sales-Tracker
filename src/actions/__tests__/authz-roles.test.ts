import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Escalada de privilegios (TEST-014, TEST-086). Los guards reales de guards.ts corren
 * tal cual; solo se sustituyen la sesión de better-auth y la BD por dobles en memoria.
 *
 * Cada acción exportada de src/actions tiene que estar clasificada en ACCIONES con el
 * rol mínimo que exige. Un test comprueba que la tabla cubre TODAS las exportaciones
 * de TODOS los ficheros: una acción nueva sin clasificar rompe el test, y al
 * clasificarla queda cubierta por las pruebas de rechazo. Se prefiere esto a buscar
 * `requireRole` en el código fuente: comprueba el comportamiento (el guard que corre de
 * verdad), no el texto, y no se engaña con un helper intermedio como assertSameCompany.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  // Resultados que devuelven, en orden, las consultas db.select(...).
  selects: [] as unknown[][],
  // Cada operación pedida a la BD, en orden. El guard hace exactamente un select
  // (el perfil); una acción rechazada no debe hacer nada más.
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("@/db", () => {
  const METODOS = [
    "from", "where", "for", "innerJoin", "leftJoin", "orderBy", "groupBy", "limit",
    "set", "values", "onConflictDoUpdate", "onConflictDoNothing", "returning",
  ];
  const chain = (result: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of METODOS) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko);
    return c;
  };
  const op = (name: string, result: () => unknown[]) => () => {
    state.calls.push(name);
    return chain(result);
  };
  const db = {
    select: op("select", () => state.selects.shift() ?? []),
    insert: op("insert", () => []),
    update: op("update", () => []),
    delete: op("delete", () => []),
    execute: async () => {
      state.calls.push("execute");
      return { rows: [] };
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.calls.push("transaction");
      return fn(db);
    },
  };
  return { db };
});

import * as adminActions from "@/actions/admin-actions";
import * as categoryActions from "@/actions/category-actions";
import * as categoryMonthActions from "@/actions/category-month-actions";
import * as customerItemActions from "@/actions/customer-item-actions";
import * as customerMonthActions from "@/actions/customer-month-actions";
import * as customerSalesActions from "@/actions/customer-sales-actions";
import * as dashboardLayoutActions from "@/actions/dashboard-layout-actions";
import * as exportActions from "@/actions/export-actions";
import * as favoritesActions from "@/actions/favorites-actions";
import * as groupingActions from "@/actions/grouping-actions";
import * as itemSalesActions from "@/actions/item-sales-actions";
import * as kpiActions from "@/actions/kpi-actions";
import * as marginActions from "@/actions/margin-actions";
import * as profileActions from "@/actions/profile-actions";
import * as salesActions from "@/actions/sales-actions";
import * as savedViewsActions from "@/actions/saved-views-actions";
import * as settingsActions from "@/actions/settings-actions";
import { resetRateLimits } from "@/lib/rate-limit";
import type {
  Bucket,
  CategoryMonthFilters,
  CustomerItemFilters,
  CustomerMonthFilters,
  CustomerSalesFilters,
  ItemSalesFilters,
  MarginByYearFilters,
  MarginCustomerFilters,
  MarginFilters,
  SalesFilters,
} from "@/types/database";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const DESTINO_ID = "22222222-2222-4222-8222-222222222222";
const UUID = "44444444-4444-4444-8444-444444444444";
const COMPANY = "99999999-9999-4999-8999-999999999999";
const OTRA_COMPANY = "88888888-8888-4888-8888-888888888888";

type Rol = "admin" | "editor" | "lector";

/** Inicia sesión con un perfil aprobado y activo (o lo que indique `over`). */
function loginAs(role: Rol, over: Record<string, unknown> = {}) {
  state.session = { user: { id: ACTOR_ID, email: "actor@example.test" } };
  state.selects.push([
    {
      id: ACTOR_ID,
      company_id: COMPANY,
      role,
      is_active: true,
      is_approved: true,
      is_rejected: false,
      has_avatar: false,
      ...over,
    },
  ]);
}

/**
 * Rol mínimo de cada acción:
 * - admin: solo administradores.
 * - metas: administradores y editores (ROLES_EDITAN_METAS).
 * - aprobado: cualquier cuenta aprobada y activa.
 * - sesion: no exige cuenta aprobada (getMyProfile la usa la pantalla de espera).
 */
type Clase = "admin" | "metas" | "aprobado" | "sesion";
type Fila = { clase: Clase; call: () => Promise<unknown> };

const ACCIONES: Record<string, Record<string, Fila>> = {
  "admin-actions": {
    approveUser: { clase: "admin", call: () => adminActions.approveUser(DESTINO_ID, "admin") },
    updateUserRole: { clase: "admin", call: () => adminActions.updateUserRole(DESTINO_ID, "admin") },
    deactivateUser: { clase: "admin", call: () => adminActions.deactivateUser(DESTINO_ID) },
    deleteUser: { clase: "admin", call: () => adminActions.deleteUser(DESTINO_ID) },
  },
  "category-actions": {
    getCategories: { clase: "aprobado", call: () => categoryActions.getCategories() },
    getTechServiceCategories: { clase: "aprobado", call: () => categoryActions.getTechServiceCategories() },
    createCategory: { clase: "admin", call: () => categoryActions.createCategory({ name: "X" }) },
    updateCategory: { clase: "admin", call: () => categoryActions.updateCategory(UUID, { name: "X" }) },
    deleteCategory: { clase: "admin", call: () => categoryActions.deleteCategory(UUID) },
    saveTechServiceBuckets: { clase: "metas", call: () => categoryActions.saveTechServiceBuckets([UUID], []) },
    getMacroCategorias: { clase: "aprobado", call: () => categoryActions.getMacroCategorias() },
    saveMacroCategorias: {
      clase: "metas",
      call: () =>
        categoryActions.saveMacroCategorias({ mano_obra: [UUID], cr: [], equipos: [], operacion: [] } as Record<
          Bucket,
          string[]
        >),
    },
  },
  "category-month-actions": {
    getCategoryMonthSales: {
      clase: "aprobado",
      call: () => categoryMonthActions.getCategoryMonthSales({ tipo: "INVOICE", anio: 2026 } as CategoryMonthFilters),
    },
  },
  "customer-item-actions": {
    getCustomerItemSales: {
      clase: "aprobado",
      call: () => customerItemActions.getCustomerItemSales({} as CustomerItemFilters),
    },
  },
  "customer-month-actions": {
    getCustomerMonthSales: {
      clase: "aprobado",
      call: () => customerMonthActions.getCustomerMonthSales({} as CustomerMonthFilters),
    },
  },
  "customer-sales-actions": {
    getCustomerSales: {
      clase: "aprobado",
      call: () => customerSalesActions.getCustomerSales({} as CustomerSalesFilters),
    },
  },
  "dashboard-layout-actions": {
    getDashboardLayout: { clase: "aprobado", call: () => dashboardLayoutActions.getDashboardLayout() },
    saveDashboardLayout: { clase: "aprobado", call: () => dashboardLayoutActions.saveDashboardLayout([]) },
    resetDashboardLayout: { clase: "aprobado", call: () => dashboardLayoutActions.resetDashboardLayout() },
  },
  "export-actions": {
    generateXlsx: { clase: "aprobado", call: () => exportActions.generateXlsx([]) },
  },
  "favorites-actions": {
    getFavorites: { clase: "aprobado", call: () => favoritesActions.getFavorites() },
    toggleFavorite: { clase: "aprobado", call: () => favoritesActions.toggleFavorite("Cliente A") },
  },
  "grouping-actions": {
    saveCategoryGrouping: { clase: "admin", call: () => groupingActions.saveCategoryGrouping("G", []) },
    getSavedCategoryGroupings: { clase: "aprobado", call: () => groupingActions.getSavedCategoryGroupings() },
    updateCategoryGrouping: { clase: "admin", call: () => groupingActions.updateCategoryGrouping(UUID, "G", []) },
    deleteCategoryGrouping: { clase: "admin", call: () => groupingActions.deleteCategoryGrouping(UUID) },
    reorderCategoryGroupings: { clase: "admin", call: () => groupingActions.reorderCategoryGroupings([UUID]) },
    getGroupingAnalysisData: { clase: "aprobado", call: () => groupingActions.getGroupingAnalysisData("INVOICE") },
    getMacroEvolutionData: { clase: "aprobado", call: () => groupingActions.getMacroEvolutionData("INVOICE") },
  },
  "item-sales-actions": {
    getItemSales: { clase: "aprobado", call: () => itemSalesActions.getItemSales({} as ItemSalesFilters) },
  },
  "kpi-actions": {
    getSalespeople: { clase: "aprobado", call: () => kpiActions.getSalespeople() },
    getKpiTargets: { clase: "aprobado", call: () => kpiActions.getKpiTargets(2026, null) },
    saveKpiTargets: {
      clase: "metas",
      call: () =>
        kpiActions.saveKpiTargets(2026, null, [
          { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 100, plazo_horas: null },
        ]),
    },
    getKpiMonthlySales: { clase: "aprobado", call: () => kpiActions.getKpiMonthlySales("INVOICE", 2026, null) },
    getKpiDealsMonthly: { clase: "aprobado", call: () => kpiActions.getKpiDealsMonthly(2026, null) },
    getKpiWonDealsMonthly: { clase: "aprobado", call: () => kpiActions.getKpiWonDealsMonthly(2026, null) },
    searchSalesOrdersForProjects: {
      clase: "aprobado",
      call: () => kpiActions.searchSalesOrdersForProjects("OV-1", 2026),
    },
    getKpiProjectOrders: { clase: "aprobado", call: () => kpiActions.getKpiProjectOrders() },
    addProjectOrder: { clase: "admin", call: () => kpiActions.addProjectOrder("OV-1") },
    removeProjectOrder: { clase: "admin", call: () => kpiActions.removeProjectOrder("OV-1") },
    getKpiTicketsChanges: { clase: "aprobado", call: () => kpiActions.getKpiTicketsChanges(2026) },
  },
  "margin-actions": {
    getMarginByYear: { clase: "aprobado", call: () => marginActions.getMarginByYear({} as MarginByYearFilters) },
    getMarginByItem: { clase: "aprobado", call: () => marginActions.getMarginByItem({} as MarginFilters) },
    getMarginByCustomer: {
      clase: "aprobado",
      call: () => marginActions.getMarginByCustomer({} as MarginCustomerFilters),
    },
  },
  "profile-actions": {
    getMyProfile: { clase: "sesion", call: () => profileActions.getMyProfile() },
  },
  "sales-actions": {
    getSalesData: { clase: "aprobado", call: () => salesActions.getSalesData({} as SalesFilters) },
  },
  "saved-views-actions": {
    getSavedViews: { clase: "aprobado", call: () => savedViewsActions.getSavedViews("clientes") },
    saveView: { clase: "aprobado", call: () => savedViewsActions.saveView("clientes", "Vista", {}) },
    deleteSavedView: { clase: "aprobado", call: () => savedViewsActions.deleteSavedView(UUID) },
  },
  "settings-actions": {
    getCompany: { clase: "aprobado", call: () => settingsActions.getCompany() },
    updateCompany: { clase: "admin", call: () => settingsActions.updateCompany({ name: "X" }) },
    updateMyAccount: { clase: "aprobado", call: () => settingsActions.updateMyAccount({ full_name: "X" }) },
    getCompanyUsers: { clase: "admin", call: () => settingsActions.getCompanyUsers() },
  },
};

const MODULOS: Record<string, Record<string, unknown>> = {
  "admin-actions": adminActions,
  "category-actions": categoryActions,
  "category-month-actions": categoryMonthActions,
  "customer-item-actions": customerItemActions,
  "customer-month-actions": customerMonthActions,
  "customer-sales-actions": customerSalesActions,
  "dashboard-layout-actions": dashboardLayoutActions,
  "export-actions": exportActions,
  "favorites-actions": favoritesActions,
  "grouping-actions": groupingActions,
  "item-sales-actions": itemSalesActions,
  "kpi-actions": kpiActions,
  "margin-actions": marginActions,
  "profile-actions": profileActions,
  "sales-actions": salesActions,
  "saved-views-actions": savedViewsActions,
  "settings-actions": settingsActions,
};

const FILAS = Object.entries(ACCIONES).flatMap(([modulo, acciones]) =>
  Object.entries(acciones).map(([nombre, fila]) => ({ modulo, nombre, ...fila })),
);

/** Código del rechazo: el de { ok: false } (mutaciones) o el del AppError lanzado (lecturas). */
async function resultado(call: () => Promise<unknown>): Promise<string> {
  try {
    const res = await call();
    if (res && typeof res === "object" && "ok" in res && res.ok === false && "code" in res) {
      return String(res.code);
    }
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? "ERROR";
  }
}

beforeEach(() => {
  state.session = null;
  state.selects = [];
  state.calls = [];
  // Cada rechazo con `fresh` descuenta del cupo de mutaciones del usuario (SEC-006).
  resetRateLimits();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inventario de acciones", () => {
  it("cada fichero de src/actions está en la tabla de roles", () => {
    const dir = fileURLToPath(new URL("..", import.meta.url));
    const ficheros = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    expect(Object.keys(ACCIONES).sort()).toEqual(ficheros);
    expect(Object.keys(MODULOS).sort()).toEqual(ficheros);
  });

  it.each(Object.keys(MODULOS))("toda acción exportada de %s tiene un rol asignado", (modulo) => {
    const exportadas = Object.keys(MODULOS[modulo])
      .filter((k) => typeof MODULOS[modulo][k] === "function")
      .sort();
    expect(Object.keys(ACCIONES[modulo]).sort()).toEqual(exportadas);
  });
});

describe("escalada: un rol sin permiso no ejecuta la acción ni toca la BD", () => {
  const casos = FILAS.flatMap((f) => {
    const sinPermiso: Rol[] = f.clase === "admin" ? ["lector", "editor"] : f.clase === "metas" ? ["lector"] : [];
    return sinPermiso.map((rol) => [`${f.modulo}.${f.nombre}`, rol, f.call] as const);
  });

  it.each(casos)("%s rechaza al rol %s con FORBIDDEN", async (_nombre, rol, call) => {
    loginAs(rol);
    expect(await resultado(call)).toBe("FORBIDDEN");
    // Solo la consulta del perfil que hace el guard: ninguna lectura ni escritura más.
    expect(state.calls).toEqual(["select"]);
  });
});

describe("cuenta pendiente: ninguna acción protegida pasa el guard", () => {
  const casos = FILAS.filter((f) => f.clase !== "sesion").map((f) => [`${f.modulo}.${f.nombre}`, f.call] as const);

  it.each(casos)("%s rechaza a una cuenta pendiente con NOT_APPROVED", async (_nombre, call) => {
    loginAs("lector", { is_approved: false });
    expect(await resultado(call)).toBe("NOT_APPROVED");
    expect(state.calls).toEqual(["select"]);
  });

  it("getMyProfile sin sesión devuelve null sin tocar la BD", async () => {
    expect(await profileActions.getMyProfile()).toBeNull();
    expect(state.calls).toEqual([]);
  });
});

describe("controles positivos: el rol con permiso sí pasa el guard", () => {
  it("un editor guarda las metas de KPIs (ROLES_EDITAN_METAS)", async () => {
    loginAs("editor");
    const res = await kpiActions.saveKpiTargets(2026, null, [
      { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 100, plazo_horas: null },
    ]);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(state.calls).toEqual(["select", "transaction", "insert", "delete"]);
  });

  it("un admin lista los usuarios de su empresa", async () => {
    loginAs("admin");
    state.selects.push([]);
    await expect(settingsActions.getCompanyUsers()).resolves.toEqual([]);
    expect(state.calls).toEqual(["select", "select"]);
  });

  it("un lector aprobado lee los datos de su empresa", async () => {
    loginAs("lector");
    await expect(settingsActions.getCompany()).resolves.toBeNull();
  });
});

describe("IDOR en acciones de administrador", () => {
  it.each([
    ["approveUser", () => adminActions.approveUser(DESTINO_ID, "lector")],
    ["updateUserRole", () => adminActions.updateUserRole(DESTINO_ID, "lector")],
    ["deactivateUser", () => adminActions.deactivateUser(DESTINO_ID)],
    ["deleteUser", () => adminActions.deleteUser(DESTINO_ID)],
  ] as const)("%s rechaza a un usuario de otra empresa sin escribir", async (_nombre, call) => {
    loginAs("admin");
    state.selects.push([{ company_id: OTRA_COMPANY }]);
    expect(await call()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    // Perfil del actor y perfil del destino; ni transacción ni escrituras.
    expect(state.calls).toEqual(["select", "select"]);
  });
});
