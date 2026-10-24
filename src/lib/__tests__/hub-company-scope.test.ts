import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * SEC-035: el zoho-hub es la réplica de UNA empresa y sus consultas no filtran por
 * empresa. Con HUB_COMPANY_ID definido, una sesión de OTRA empresa no llega a consultar
 * el hub por ningún camino: ni por GET /api/data (403 JSON, sin cerrar sesión) ni por
 * las Server Actions. Sin la variable, o con la empresa correcta, todo sigue igual.
 *
 * Los guards reales corren tal cual; la sesión, la BD de la app, el pool del hub y el
 * agregado de ventas del hub son dobles que registran cada llamada.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  selects: [] as unknown[][],
  hub: true,
}));

const hubQuery = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));
const hubSalesRows = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("@/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "leftJoin"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.selects.shift() ?? []).then(resolve, reject);
    return c;
  };
  return { db: { select: () => chain() } };
});
vi.mock("@/db/hub", () => ({
  hubEnabled: () => state.hub,
  getHubPool: () => ({ query: hubQuery }),
}));
vi.mock("@/db/hub-sales", () => ({ getHubSalesRows: hubSalesRows }));
vi.mock("@/db/historical-customer-sales", () => ({
  HISTORICAL_LAST_YEAR: 2020,
  getHistoricalCustomerSales: async () => [],
}));

import { handleDataRequest } from "@/lib/data-api";
import { HUB_COMPANY_FORBIDDEN_MESSAGE } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import { getSalesData } from "@/actions/sales-actions";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { getCustomerMonthSales } from "@/actions/customer-month-actions";
import { getCategoryMonthSales } from "@/actions/category-month-actions";
import { getItemSales } from "@/actions/item-sales-actions";
import { getMarginByCustomer, getMarginByItem, getMarginByYear } from "@/actions/margin-actions";
import {
  getKpiDealsMonthly,
  getKpiMonthlySales,
  getKpiProjectOrders,
  getKpiTicketsChanges,
  getKpiWonDealsMonthly,
  getSalespeople,
  searchSalesOrdersForProjects,
} from "@/actions/kpi-actions";
import { getGroupingAnalysisData, getMacroEvolutionData } from "@/actions/grouping-actions";

const USER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "99999999-9999-4999-8999-999999999999";
const OTRA = "88888888-8888-4888-8888-888888888888";
const YEAR = new Date().getFullYear();

function loginAs() {
  state.session = { user: { id: USER, email: "u@example.test" } };
  state.selects.push([
    {
      id: USER,
      company_id: COMPANY,
      role: "admin",
      is_active: true,
      is_approved: true,
      is_rejected: false,
      has_avatar: false,
    },
  ]);
}

function hubNoConsultado() {
  expect(hubQuery).not.toHaveBeenCalled();
  expect(hubSalesRows).not.toHaveBeenCalled();
}

beforeEach(() => {
  state.session = null;
  state.selects = [];
  state.hub = true;
  hubQuery.mockClear();
  hubSalesRows.mockClear();
  resetRateLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Todo recurso de /api/data que lee del hub.
const RECURSOS_HUB: [string, string][] = [
  ["sales", `year=${YEAR}`],
  ["customer-sales", `tipo=INVOICE&desdeAnio=2015&hastaAnio=${YEAR}&includeHistory=true`],
  ["customer-item", `tipo=INVOICE&anio=${YEAR}`],
  ["customer-month", `tipo=INVOICE&anio=${YEAR}&customer=Cliente%20A`],
  ["category-month", `tipo=INVOICE&anio=${YEAR}`],
  ["item-sales", `tipo=INVOICE&desde=${YEAR}-01-01&hasta=${YEAR}-12-31`],
  ["margin-by-year", "tipo=INVOICE"],
  ["margin-by-item", `tipo=INVOICE&anio=${YEAR}`],
  ["margin-by-customer", `tipo=INVOICE&anio=${YEAR}`],
  ["salespeople", ""],
  ["kpi-monthly-sales", `tipo=INVOICE&anio=${YEAR}`],
  ["kpi-deals", `anio=${YEAR}`],
  ["kpi-won-deals", `anio=${YEAR}`],
  ["kpi-tickets", `anio=${YEAR}`],
  ["kpi-project-orders", ""],
];

async function get(resource: string, query: string) {
  const res = await handleDataRequest(resource, new URLSearchParams(query));
  return { res, body: (await res.json()) as unknown };
}

describe("GET /api/data con HUB_COMPANY_ID de otra empresa", () => {
  it.each(RECURSOS_HUB)("%s: 403 JSON con el mensaje, sin consultar el hub", async (resource, query) => {
    vi.stubEnv("HUB_COMPANY_ID", OTRA);
    loginAs();
    // Si la comprobación faltara, kpi-project-orders encontraría una orden marcada y
    // consultaría el hub con ella.
    state.selects.push([{ hub_order_id: "OV-1" }]);
    const { res, body } = await get(resource, query);
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({ error: HUB_COMPANY_FORBIDDEN_MESSAGE, code: "FORBIDDEN" });
    hubNoConsultado();
  });

  it("los datos propios de la app (categorías, metas) siguen accesibles", async () => {
    vi.stubEnv("HUB_COMPANY_ID", OTRA);
    loginAs();
    expect((await get("categories", "")).res.status).toBe(200);
    loginAs();
    expect((await get("kpi-targets", `year=${YEAR}`)).res.status).toBe(200);
    hubNoConsultado();
  });

  it("sin hub (fallback a sales_records, ya filtrado por empresa) sales no se restringe", async () => {
    vi.stubEnv("HUB_COMPANY_ID", OTRA);
    state.hub = false;
    loginAs();
    const { res } = await get("sales", `year=${YEAR}`);
    expect(res.status).toBe(200);
    hubNoConsultado();
  });
});

describe("GET /api/data con la empresa dueña del hub o sin HUB_COMPANY_ID", () => {
  it.each(RECURSOS_HUB)("%s: 200 con HUB_COMPANY_ID = empresa de la sesión", async (resource, query) => {
    vi.stubEnv("HUB_COMPANY_ID", COMPANY.toUpperCase());
    loginAs();
    const { res } = await get(resource, query);
    expect(res.status).toBe(200);
  });

  it.each(RECURSOS_HUB)("%s: 200 sin HUB_COMPANY_ID (comportamiento anterior)", async (resource, query) => {
    loginAs();
    const { res } = await get(resource, query);
    expect(res.status).toBe(200);
  });

  it("un HUB_COMPANY_ID que no es UUID se ignora: no restringe", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("HUB_COMPANY_ID", "no-es-uuid");
    loginAs();
    const { res } = await get("customer-item", `tipo=INVOICE&anio=${YEAR}`);
    expect(res.status).toBe(200);
    expect(hubQuery).toHaveBeenCalledTimes(1);
  });
});

// Todas las Server Actions que leen del hub.
const ACCIONES_HUB: [string, () => Promise<unknown>][] = [
  ["getSalesData", () => getSalesData({ year: YEAR })],
  ["getCustomerSales", () => getCustomerSales({ tipo: "INVOICE", desdeAnio: 2021, hastaAnio: YEAR })],
  ["getCustomerItemSales", () => getCustomerItemSales({ tipo: "INVOICE", anio: YEAR })],
  ["getCustomerMonthSales", () => getCustomerMonthSales({ tipo: "INVOICE", anio: YEAR })],
  ["getCategoryMonthSales", () => getCategoryMonthSales({ tipo: "INVOICE", anio: YEAR })],
  ["getItemSales", () => getItemSales({ tipo: "INVOICE", desde: `${YEAR}-01-01`, hasta: `${YEAR}-12-31` })],
  ["getMarginByYear", () => getMarginByYear({ tipo: "INVOICE" })],
  ["getMarginByItem", () => getMarginByItem({ tipo: "INVOICE", anio: YEAR })],
  ["getMarginByCustomer", () => getMarginByCustomer({ tipo: "INVOICE", anio: YEAR })],
  ["getSalespeople", () => getSalespeople()],
  ["getKpiMonthlySales", () => getKpiMonthlySales("INVOICE", YEAR, null)],
  ["getKpiDealsMonthly", () => getKpiDealsMonthly(YEAR, null)],
  ["getKpiWonDealsMonthly", () => getKpiWonDealsMonthly(YEAR, null)],
  ["getKpiTicketsChanges", () => getKpiTicketsChanges(YEAR)],
  ["getKpiProjectOrders", () => getKpiProjectOrders()],
  ["searchSalesOrdersForProjects", () => searchSalesOrdersForProjects("Cliente", YEAR)],
  ["getGroupingAnalysisData", () => getGroupingAnalysisData("INVOICE")],
  ["getMacroEvolutionData", () => getMacroEvolutionData("INVOICE")],
];

describe("Server Actions con HUB_COMPANY_ID de otra empresa", () => {
  it.each(ACCIONES_HUB)("%s rechaza con FORBIDDEN sin consultar el hub", async (_n, fn) => {
    vi.stubEnv("HUB_COMPANY_ID", OTRA);
    loginAs();
    // Agrupaciones: un grupo para llegar a la carga de ventas. Órdenes de proyecto:
    // una orden marcada. Sin la comprobación, ambas acabarían en el hub.
    state.selects.push([{ id: "g1", name: "Grupo", color: null, sort_order: 0, hub_order_id: "OV-1" }]);
    await expect(fn()).rejects.toMatchObject({
      name: "AppError",
      code: "FORBIDDEN",
      message: HUB_COMPANY_FORBIDDEN_MESSAGE,
    });
    hubNoConsultado();
  });

  it.each(ACCIONES_HUB)("%s funciona con la empresa dueña del hub", async (_n, fn) => {
    vi.stubEnv("HUB_COMPANY_ID", COMPANY);
    loginAs();
    state.selects.push([{ id: "g1", name: "Grupo", color: null, sort_order: 0, hub_order_id: "OV-1" }]);
    await expect(fn()).resolves.toBeDefined();
  });
});

/**
 * Inventario estructural: el único módulo de la app que importa las consultas del hub
 * (src/db/hub-*.ts) es la capa de lecturas, src/lib/data-reads.ts, que comprueba la
 * empresa antes de cada consulta. Una acción o ruta nueva que importe hub-* directamente
 * se saltaría la comprobación: este test la para. getHubPool() solo lo usan los propios
 * módulos hub-* y el sondeo de readiness (SELECT 1, sin datos de nadie).
 */
describe("inventario: nadie consulta el hub saltándose data-reads", () => {
  const SRC = join(__dirname, "..", "..");
  const ficheros = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === "__tests__" ? [] : ficheros(p);
      return /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const rel = (p: string) => relative(join(SRC, ".."), p).split(sep).join("/");
  const todos = ficheros(SRC).map((p) => ({ path: rel(p), src: readFileSync(p, "utf8") }));

  it("solo src/lib/data-reads.ts importa las consultas hub-*", () => {
    const CONSULTAS = /from\s+["'](?:@\/db\/|\.\/)hub-(?!sql["']|config["'])[\w-]+["']/;
    const importan = todos
      .filter((f) => !f.path.startsWith("src/db/hub-") && CONSULTAS.test(f.src))
      .map((f) => f.path);
    expect(importan).toEqual(["src/lib/data-reads.ts"]);
  });

  it("getHubPool solo se usa en los módulos hub-* y en el health check", () => {
    const usan = todos
      .filter((f) => f.path !== "src/db/hub.ts" && /\bgetHubPool\b/.test(f.src))
      .map((f) => f.path)
      .filter((p) => !p.startsWith("src/db/hub-"));
    expect(usan).toEqual(["src/app/api/health/route.ts"]);
  });
});
