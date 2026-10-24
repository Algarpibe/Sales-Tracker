import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * IDOR (TEST-014): toda acción que lee o escribe datos de un usuario o de una empresa
 * filtra por el usuario o la empresa de la SESIÓN, nunca solo por el id que llega del
 * navegador. Un id ajeno no encuentra nada que tocar.
 *
 * La BD es un doble que registra cada operación con su tabla, su WHERE y sus valores.
 * eq/ne/and se sustituyen por versiones legibles para poder inspeccionar el WHERE. Cada
 * caso exige que TODAS las operaciones de ese tipo sobre la tabla lleven el filtro de la
 * sesión (y que haya al menos una).
 */

type Cond = { op: string; col?: unknown; val?: unknown; conds?: Cond[] };
type Operacion = { op: string; tabla?: unknown; where?: Cond; values?: unknown; sql?: unknown };

const state = vi.hoisted(() => ({
  ops: [] as Operacion[],
  // Resultados que devuelven, en orden, las operaciones esperadas con await.
  results: [] as unknown[][],
}));

const USER = "u1";
const COMPANY = "c1";
const AJENO = "77777777-7777-4777-8777-777777777777";
const AJENO_2 = "66666666-6666-4666-8666-666666666666";

vi.mock("drizzle-orm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...orig,
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    and: (...conds: unknown[]) => ({ op: "and", conds }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/guards", () => {
  const sesion = async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "admin" } });
  return { requireApproved: sesion, requireRole: sesion };
});
vi.mock("@/db", () => {
  const registrar = (op: string, tabla?: unknown) => {
    const o: Operacion = { op, tabla };
    state.ops.push(o);
    const c: Record<string, unknown> = {};
    for (const m of ["orderBy", "limit", "for", "onConflictDoUpdate", "onConflictDoNothing", "returning", "innerJoin"]) {
      c[m] = () => c;
    }
    c.from = (t: unknown) => {
      o.tabla = t;
      return c;
    };
    c.where = (w: Cond) => {
      o.where = w;
      return c;
    };
    c.values = (v: unknown) => {
      o.values = v;
      return c;
    };
    c.set = (v: unknown) => {
      o.values = v;
      return c;
    };
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(state.results.shift() ?? [{ total: 0, id: "x" }]).then(ok, ko);
    return c;
  };
  const db = {
    select: () => registrar("select"),
    insert: (t: unknown) => registrar("insert", t),
    update: (t: unknown) => registrar("update", t),
    delete: (t: unknown) => registrar("delete", t),
    execute: async (q: unknown) => {
      state.ops.push({ op: "execute", sql: q });
      return { rows: [] };
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

import {
  categories,
  categoryGroupMappings,
  categoryGroups,
  companies,
  favorites,
  kpiProjectOrders,
  kpiTargets,
  profiles,
  savedViews,
} from "@/db/schema";
import { deleteSavedView, getSavedViews, saveView } from "@/actions/saved-views-actions";
import { getFavorites, toggleFavorite } from "@/actions/favorites-actions";
import { getDashboardLayout, resetDashboardLayout, saveDashboardLayout } from "@/actions/dashboard-layout-actions";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getMacroCategorias,
  getTechServiceCategories,
  saveMacroCategorias,
  saveTechServiceBuckets,
  updateCategory,
} from "@/actions/category-actions";
import {
  deleteCategoryGrouping,
  getSavedCategoryGroupings,
  reorderCategoryGroupings,
  saveCategoryGrouping,
  updateCategoryGrouping,
} from "@/actions/grouping-actions";
import {
  addProjectOrder,
  getKpiProjectOrders,
  getKpiTargets,
  removeProjectOrder,
  saveKpiTargets,
} from "@/actions/kpi-actions";
import { getCompany, getCompanyUsers, updateCompany } from "@/actions/settings-actions";

beforeEach(() => {
  state.ops = [];
  state.results = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

/** Hojas del WHERE (los and anidados se aplanan). */
function hojas(c: Cond | undefined): Cond[] {
  if (!c) return [];
  return c.op === "and" ? c.conds!.flatMap(hojas) : [c];
}

/** El WHERE de la operación contiene `col = val` (comparando la columna por identidad). */
function filtraPor(o: Operacion, col: unknown, val: unknown): boolean {
  return hojas(o.where).some((h) => h.op === "eq" && h.col === col && h.val === val);
}

/** Todas las filas insertadas llevan `campo = val`. */
function insertaCon(o: Operacion, campo: string, val: unknown): boolean {
  const filas = (Array.isArray(o.values) ? o.values : [o.values]) as Record<string, unknown>[];
  return filas.length > 0 && filas.every((f) => f[campo] === val);
}

type Esperado =
  | { op: "select" | "update" | "delete"; tabla: unknown; col: unknown; val: string }
  | { op: "insert"; tabla: unknown; campo: string; val: string };

function comprobar(esperados: Esperado[]) {
  for (const e of esperados) {
    const ops = state.ops.filter((o) => o.op === e.op && o.tabla === e.tabla);
    expect(ops.length, `${e.op} sin registrar`).toBeGreaterThan(0);
    for (const o of ops) {
      if (e.op === "insert") expect(insertaCon(o, e.campo, e.val), "insert sin el ámbito de la sesión").toBe(true);
      else expect(filtraPor(o, e.col, e.val), `${e.op} sin filtrar por la sesión`).toBe(true);
    }
  }
}

type Caso = [nombre: string, run: () => Promise<unknown>, esperados: Esperado[], results?: unknown[][]];

const porUsuario = (op: "select" | "update" | "delete", tabla: unknown, col: unknown): Esperado => ({
  op,
  tabla,
  col,
  val: USER,
});
const porEmpresa = (op: "select" | "update" | "delete", tabla: unknown, col: unknown): Esperado => ({
  op,
  tabla,
  col,
  val: COMPANY,
});

describe("datos del usuario: vistas guardadas, favoritos y layout", () => {
  const casos: Caso[] = [
    [
      "deleteSavedView con un id ajeno solo borra entre las vistas del usuario",
      () => deleteSavedView(AJENO),
      [porUsuario("delete", savedViews, savedViews.user_id)],
    ],
    ["getSavedViews lee solo las vistas del usuario", () => getSavedViews("clientes"), [porUsuario("select", savedViews, savedViews.user_id)]],
    [
      "saveView cuenta y guarda con el usuario de la sesión",
      () => saveView("clientes", "Vista", { a: 1 }),
      [porUsuario("select", savedViews, savedViews.user_id), { op: "insert", tabla: savedViews, campo: "user_id", val: USER }],
    ],
    ["getFavorites lee solo los favoritos del usuario", () => getFavorites(), [porUsuario("select", favorites, favorites.user_id)]],
    [
      "toggleFavorite da de alta y de baja solo en los favoritos del usuario",
      () => toggleFavorite("Cliente A"),
      [
        porUsuario("select", favorites, favorites.user_id),
        { op: "insert", tabla: favorites, campo: "user_id", val: USER },
        porUsuario("delete", favorites, favorites.user_id),
      ],
      // count → 0; el INSERT no inserta (ya existía); el DELETE lo quita.
      [[{ total: 0 }], [], [{ id: "x" }]],
    ],
    [
      "getDashboardLayout lee solo el layout del usuario",
      () => getDashboardLayout(),
      [porUsuario("select", savedViews, savedViews.user_id)],
      [[]],
    ],
    [
      "saveDashboardLayout guarda con el usuario de la sesión",
      () => saveDashboardLayout([]),
      [{ op: "insert", tabla: savedViews, campo: "user_id", val: USER }],
    ],
    [
      "resetDashboardLayout borra solo el layout del usuario",
      () => resetDashboardLayout(),
      [porUsuario("delete", savedViews, savedViews.user_id)],
    ],
  ];

  it.each(casos)("%s", async (_nombre, run, esperados, results = []) => {
    state.results = results;
    await run();
    comprobar(esperados);
  });

  it("deleteSavedView filtra además por el id pedido (no borra todas las del usuario)", async () => {
    await deleteSavedView(AJENO);
    const [del] = state.ops.filter((o) => o.op === "delete");
    expect(filtraPor(del, savedViews.id, AJENO)).toBe(true);
  });
});

describe("datos de la empresa: categorías, agrupaciones, KPIs y ajustes", () => {
  const casos: Caso[] = [
    ["getCategories", () => getCategories(), [porEmpresa("select", categories, categories.company_id)]],
    ["getTechServiceCategories", () => getTechServiceCategories(), [porEmpresa("select", categories, categories.company_id)]],
    ["getMacroCategorias", () => getMacroCategorias(), [porEmpresa("select", categories, categories.company_id)]],
    [
      "createCategory crea en la empresa de la sesión",
      () => createCategory({ name: "X" }),
      [{ op: "insert", tabla: categories, campo: "company_id", val: COMPANY }],
    ],
    [
      "updateCategory con un id ajeno solo toca categorías de la empresa",
      () => updateCategory(AJENO, { name: "X" }),
      [porEmpresa("update", categories, categories.company_id)],
    ],
    [
      "deleteCategory con un id ajeno solo toca categorías de la empresa",
      () => deleteCategory(AJENO),
      [porEmpresa("update", categories, categories.company_id)],
    ],
    [
      "saveTechServiceBuckets con ids ajenos solo toca categorías de la empresa",
      () => saveTechServiceBuckets([AJENO], [AJENO_2]),
      [porEmpresa("update", categories, categories.company_id)],
    ],
    [
      "saveMacroCategorias con ids ajenos solo toca categorías de la empresa",
      () => saveMacroCategorias({ mano_obra: [AJENO], cr: [], equipos: [], operacion: [] }),
      [porEmpresa("update", categories, categories.company_id)],
    ],
    [
      "getSavedCategoryGroupings",
      () => getSavedCategoryGroupings(),
      [porEmpresa("select", categoryGroups, categoryGroups.company_id)],
    ],
    [
      "saveCategoryGrouping comprueba las categorías y crea en la empresa de la sesión",
      () => saveCategoryGrouping("G", [AJENO]),
      [
        porEmpresa("select", categories, categories.company_id),
        { op: "insert", tabla: categoryGroups, campo: "company_id", val: COMPANY },
        { op: "insert", tabla: categoryGroupMappings, campo: "company_id", val: COMPANY },
      ],
    ],
    [
      "updateCategoryGrouping con un id ajeno solo toca grupos de la empresa",
      () => updateCategoryGrouping(AJENO, "G", []),
      [
        porEmpresa("update", categoryGroups, categoryGroups.company_id),
        porEmpresa("delete", categoryGroupMappings, categoryGroupMappings.company_id),
      ],
    ],
    [
      "deleteCategoryGrouping con un id ajeno solo borra grupos de la empresa",
      () => deleteCategoryGrouping(AJENO),
      [porEmpresa("delete", categoryGroups, categoryGroups.company_id)],
    ],
    ["getKpiTargets", () => getKpiTargets(2026, null), [porEmpresa("select", kpiTargets, kpiTargets.company_id)]],
    [
      "saveKpiTargets escribe y poda solo las metas de la empresa",
      () =>
        saveKpiTargets(2026, null, [{ kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 100, plazo_horas: null }]),
      [
        { op: "insert", tabla: kpiTargets, campo: "company_id", val: COMPANY },
        porEmpresa("delete", kpiTargets, kpiTargets.company_id),
      ],
    ],
    [
      "getKpiProjectOrders",
      () => getKpiProjectOrders().catch(() => undefined), // el hub no está: solo importa la consulta previa
      [porEmpresa("select", kpiProjectOrders, kpiProjectOrders.company_id)],
      [[]],
    ],
    [
      "addProjectOrder marca en la empresa de la sesión",
      () => addProjectOrder("OV-1"),
      [{ op: "insert", tabla: kpiProjectOrders, campo: "company_id", val: COMPANY }],
    ],
    [
      "removeProjectOrder solo desmarca órdenes de la empresa",
      () => removeProjectOrder("OV-1"),
      [porEmpresa("delete", kpiProjectOrders, kpiProjectOrders.company_id)],
    ],
    ["getCompany lee solo la empresa de la sesión", () => getCompany(), [porEmpresa("select", companies, companies.id)]],
    [
      "updateCompany solo actualiza la empresa de la sesión",
      () => updateCompany({ name: "X" }),
      [porEmpresa("update", companies, companies.id)],
    ],
    ["getCompanyUsers lista solo usuarios de la empresa", () => getCompanyUsers(), [porEmpresa("select", profiles, profiles.company_id)]],
  ];

  it.each(casos)("%s", async (_nombre, run, esperados, results = []) => {
    state.results = results;
    await run();
    comprobar(esperados);
  });

  it("saveCategoryGrouping rechaza una categoría de otra empresa sin crear nada", async () => {
    state.results = [[]]; // assertCategoriesOwned no encuentra la categoría en la empresa
    expect(await saveCategoryGrouping("G", [AJENO])).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.ops.filter((o) => o.op === "insert")).toEqual([]);
  });

  it("reorderCategoryGroupings solo reordena grupos de la empresa", async () => {
    await reorderCategoryGroupings([AJENO]);
    const [exec] = state.ops.filter((o) => o.op === "execute");
    const q = new PgDialect().sqlToQuery(exec.sql as Parameters<PgDialect["sqlToQuery"]>[0]);
    const [, n] = q.sql.match(/g\.company_id = \$(\d+)/) ?? [];
    expect(n, "el UPDATE no filtra por company_id").toBeDefined();
    expect(q.params[Number(n) - 1]).toBe(COMPANY);
  });
});
