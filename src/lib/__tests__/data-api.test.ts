import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * DATA-043: lecturas por GET /api/data/[resource] (en paralelo desde el navegador, a
 * diferencia de las Server Actions, que Next despacha de una en una). La ruta vuelve a
 * autorizar aunque el proxy ya lo haga (defensa en profundidad) y responde SIEMPRE JSON:
 * 401 sin sesión, 403 sin aprobar, 404 recurso desconocido, 400 filtros inválidos (sin
 * llegar a Postgres) y 500 genérico sin detalles. Los guards reales corren tal cual;
 * solo se sustituyen la sesión, la BD de la app y el pool del hub por dobles.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  selects: [] as unknown[][],
  queries: [] as { sql: string; params?: unknown[] }[],
  hubRows: [] as Record<string, unknown>[],
  hubError: null as Error | null,
  salesRows: [] as Record<string, unknown>[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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
  hubEnabled: () => true,
  getHubPool: () => ({
    query: async (sql: string, params?: unknown[]) => {
      state.queries.push({ sql, params });
      if (state.hubError) throw state.hubError;
      return { rows: state.hubRows };
    },
  }),
}));
vi.mock("@/db/hub-sales", () => ({ getHubSalesRows: async () => state.salesRows }));

import { handleDataRequest } from "@/lib/data-api";
import { resetRateLimits } from "@/lib/rate-limit";

const USER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "99999999-9999-4999-8999-999999999999";
const CAT = "55555555-5555-4555-8555-555555555555";
const YEAR = new Date().getFullYear();
const LEAK = "connect ECONNREFUSED hub-interno:5432 password=secreto";

function loginAs(over: Record<string, unknown> = {}) {
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
      ...over,
    },
  ]);
}

async function get(resource: string, query = "") {
  const res = await handleDataRequest(resource, new URLSearchParams(query));
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as unknown };
}

beforeEach(() => {
  state.session = null;
  state.selects = [];
  state.queries = [];
  state.hubRows = [];
  state.hubError = null;
  state.salesRows = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("autorización", () => {
  it("401 JSON sin sesión, sin consultar nada", async () => {
    const { res, body } = await get("customer-item", `tipo=INVOICE&anio=${YEAR}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ error: "Debes iniciar sesión.", code: "UNAUTHORIZED" });
    expect(state.queries).toHaveLength(0);
  });

  it("403 JSON a una cuenta pendiente", async () => {
    loginAs({ is_approved: false });
    const { res, body } = await get("customer-item", `tipo=INVOICE&anio=${YEAR}`);
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ code: "NOT_APPROVED" });
    expect(state.queries).toHaveLength(0);
  });

  it("403 JSON a una cuenta rechazada o inactiva", async () => {
    loginAs({ is_rejected: true });
    expect((await get("categories")).res.status).toBe(403);
    loginAs({ is_active: false });
    expect((await get("categories")).res.status).toBe(403);
  });

  it("sin sesión, un recurso desconocido también es 401 (no se revela qué existe)", async () => {
    expect((await get("no-existe")).res.status).toBe(401);
  });
});

describe("cabeceras", () => {
  it.each([
    ["200", () => loginAs(), "categories", ""],
    ["401", () => {}, "categories", ""],
    ["400", () => loginAs(), "customer-item", "tipo=INVOICE&anio=1"],
  ])("%s: privada y sin caché", async (_s, prep, resource, query) => {
    prep();
    const { res } = await get(resource, query);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("recurso y parámetros", () => {
  it("404 JSON para un recurso desconocido", async () => {
    loginAs();
    const { res, body } = await get("no-existe");
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Recurso no encontrado.", code: "NOT_FOUND" });
  });

  it.each([
    ["año fuera de rango", "customer-item", "tipo=INVOICE&anio=2014"],
    ["año no numérico", "customer-item", "tipo=INVOICE&anio=abc"],
    ["año decimal", "margin-by-item", "tipo=INVOICE&anio=2025.5"],
    ["falta el tipo", "customer-month", `anio=${YEAR}`],
    ["tipo desconocido", "category-month", `tipo=FOO&anio=${YEAR}`],
    ["parámetro desconocido", "customer-item", `tipo=INVOICE&anio=${YEAR}&x=1`],
    ["cliente vacío", "customer-item", `tipo=INVOICE&anio=${YEAR}&customer=`],
    ["cliente demasiado largo", "margin-by-customer", `tipo=INVOICE&anio=${YEAR}&customer=${"a".repeat(301)}`],
    ["rango de años invertido", "customer-sales", `tipo=INVOICE&desdeAnio=${YEAR}&hastaAnio=2021`],
    ["includeHistory no booleano", "customer-sales", `tipo=INVOICE&desdeAnio=2021&hastaAnio=${YEAR}&includeHistory=si`],
    ["fechas invertidas", "item-sales", `tipo=INVOICE&desde=${YEAR}-06-01&hasta=${YEAR}-01-01`],
    ["fecha inválida", "item-sales", `tipo=INVOICE&desde=${YEAR}-13-01&hasta=${YEAR}-12-31`],
    ["mes fuera de rango", "sales", "month=13"],
    ["categoría no uuid", "sales", "category_id=1"],
    ["año de metas no numérico", "kpi-targets", "year=x"],
    ["año de tickets fuera de rango", "kpi-tickets", "anio=2014"],
  ])("400 JSON (%s) sin consultar el hub", async (_n, resource, query) => {
    loginAs();
    const { res, body, text } = await get(resource, query);
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: "VALIDATION" });
    expect(typeof (body as { error: unknown }).error).toBe("string");
    expect(text).not.toMatch(/ZodError|stack|issues/);
    expect(state.queries).toHaveLength(0);
  });
});

describe("200: misma lectura que la Server Action", () => {
  it("customer-item por cliente: filtros tipados y el nombre como parámetro", async () => {
    loginAs();
    state.hubRows = [{ customer: "Cliente A", sku: "S1", marca: null, nombre: "Bomba", categoria: "Aguas", cantidad: "2", importe: 10.5 }];
    const { res, body } = await get("customer-item", `tipo=SALES_ORDER&anio=${YEAR}&customer=${encodeURIComponent("Cliente A & Cía")}`);
    expect(res.status).toBe(200);
    expect(body).toEqual([
      { customer: "Cliente A", sku: "S1", marca: null, nombre: "Bomba", categoria: "Aguas", cantidad: 2, importe: 10.5 },
    ]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].params).toEqual([YEAR, "Cliente A & Cía"]);
    expect(state.queries[0].sql).toContain("books.sales_orders");
  });

  it("sales: registros de la empresa de la sesión, filtrados por año", async () => {
    loginAs();
    state.selects.push([{ id: CAT, name: "Aguas", color: "#000000" }]);
    state.salesRows = [
      { category_name: "aguas", record_type: "INVOICE", record_month: 3, record_year: YEAR, amount_usd: 100 },
      { category_name: "Aguas", record_type: "INVOICE", record_month: 3, record_year: YEAR - 1, amount_usd: 7 },
      { category_name: "Otra", record_type: "INVOICE", record_month: 3, record_year: YEAR, amount_usd: 9 },
    ];
    const { res, body } = await get("sales", `year=${YEAR}`);
    expect(res.status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({
        id: `${CAT}:INVOICE:${YEAR}:3`,
        company_id: COMPANY,
        category_id: CAT,
        amount_usd: 100,
        record_year: YEAR,
        categories: { name: "Aguas", color: "#000000" },
      }),
    ]);
  });

  it("sales sin filtros devuelve todo el histórico (año anterior al del hub incluido)", async () => {
    loginAs();
    state.selects.push([{ id: CAT, name: "Aguas", color: null }]);
    state.salesRows = [{ category_name: "Aguas", record_type: "BACKLOG", record_month: 1, record_year: 2014, amount_usd: 1 }];
    const { res, body } = await get("sales");
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it("kpi-monthly-sales sin owner pide el total de la compañía (null)", async () => {
    loginAs();
    const { res } = await get("kpi-monthly-sales", `tipo=INVOICE&anio=${YEAR}`);
    expect(res.status).toBe(200);
    expect(state.queries[0].params).toEqual([YEAR, null]);
  });

  it("kpi-won-deals con owner lo pasa tal cual", async () => {
    loginAs();
    await get("kpi-won-deals", `anio=${YEAR}&owner=${encodeURIComponent("Comercial A")}`);
    expect(state.queries[0].params?.[2]).toBe("Comercial A");
  });

  it("customer-sales con includeHistory=true y OV no consulta el histórico", async () => {
    loginAs();
    state.hubRows = [{ customer: "Cliente A", year: YEAR, ventas: 5 }];
    const { res, body } = await get("customer-sales", `tipo=SALES_ORDER&desdeAnio=2015&hastaAnio=${YEAR}&includeHistory=true`);
    expect(res.status).toBe(200);
    expect(body).toEqual([{ customer: "Cliente A", year: YEAR, ventas: 5, source: "hub" }]);
    expect(state.queries[0].params).toEqual([2015, YEAR]);
  });

  it("categories devuelve las filas de la BD de la app", async () => {
    loginAs();
    state.selects.push([{ id: CAT, name: "Aguas", is_active: true }]);
    const { res, body } = await get("categories");
    expect(res.status).toBe(200);
    expect(body).toEqual([{ id: CAT, name: "Aguas", is_active: true }]);
  });

  it("dashboard-layout: null si el usuario no lo personalizó", async () => {
    loginAs();
    const { res, body } = await get("dashboard-layout");
    expect(res.status).toBe(200);
    expect(body).toBeNull();
  });

  it("dashboard-layout: el guardado, ya saneado", async () => {
    loginAs();
    state.selects.push([{ state: { items: [{ id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 }, { id: "retirado", x: 0, y: 0, w: 1, h: 1 }] } }]);
    const { body } = await get("dashboard-layout");
    expect(body).toEqual([{ id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 }]);
  });

  it("kpi-targets convierte los numeric de la BD sin volver 0 un plazo nulo", async () => {
    loginAs();
    state.selects.push([{ kpi_key: "ventas", target_value: "100.50", weight_pct: "40", plazo_horas: null }]);
    const { res, body } = await get("kpi-targets", `year=${YEAR}&salesperson=${encodeURIComponent("Comercial A")}`);
    expect(res.status).toBe(200);
    expect(body).toEqual([{ kpi_key: "ventas", target_value: 100.5, weight_pct: 40, plazo_horas: null }]);
  });

  it("kpi-project-orders sin órdenes marcadas no consulta el hub", async () => {
    loginAs();
    const { res, body } = await get("kpi-project-orders");
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
    expect(state.queries).toHaveLength(0);
  });

  it.each([
    ["tech-service-categories", ""],
    ["salespeople", ""],
    ["customer-month", `tipo=INVOICE&anio=${YEAR}`],
    ["category-month", `tipo=SALES_ORDER&anio=${YEAR}`],
    ["item-sales", `tipo=INVOICE&desde=${YEAR}-01-01&hasta=${YEAR}-12-31`],
    ["margin-by-item", `tipo=INVOICE&anio=${YEAR}`],
    ["margin-by-customer", `tipo=INVOICE&anio=${YEAR}`],
    ["kpi-deals", `anio=${YEAR}`],
    ["kpi-tickets", `anio=${YEAR}`],
  ])("%s responde 200 con la lectura compartida", async (resource, query) => {
    loginAs();
    const { res, body } = await get(resource, query);
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe("errores inesperados", () => {
  it("500 genérico: ni el mensaje de Postgres ni la traza salen al cliente; sí al log", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    loginAs();
    state.hubError = new Error(LEAK);
    const { res, body, text } = await get("margin-by-year", "tipo=INVOICE");
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Ocurrió un error interno. Inténtalo de nuevo.", code: "INTERNAL" });
    expect(text).not.toContain("hub-interno");
    expect(text).not.toContain("secreto");
    expect(consola).toHaveBeenCalledTimes(1);
    const linea = JSON.parse(String(consola.mock.calls[0][0])) as Record<string, unknown>;
    expect(linea).toMatchObject({ level: "error", resource: "margin-by-year" });
  });
});

describe("GET /api/data/[resource]", () => {
  it("es dinámica y delega en handleDataRequest con el recurso de la URL", async () => {
    const { GET, dynamic } = await import("@/app/api/data/[resource]/route");
    expect(dynamic).toBe("force-dynamic");
    loginAs();
    state.selects.push([]);
    const res = await GET(new NextRequest("http://localhost/api/data/macro-categorias"), {
      params: Promise.resolve({ resource: "macro-categorias" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

/**
 * SEC-006: límite por usuario de las lecturas. Cuenta tras resolver la sesión (por id
 * de usuario, no por IP) y responde 429 con el JSON de error de siempre y Retry-After.
 */
describe("límite de peticiones por usuario", () => {
  beforeEach(() => {
    vi.stubEnv("RATE_LIMIT_READS_PER_MINUTE", "2");
    resetRateLimits();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetRateLimits();
  });

  it("429 JSON con Retry-After al pasar el límite, sin consultar nada", async () => {
    for (let i = 0; i < 2; i++) {
      loginAs();
      expect((await get("categories")).res.status).toBe(200);
    }
    loginAs();
    const selectsAntes = state.selects.length;
    const { res, body } = await get("macro-categorias");
    expect(res.status).toBe(429);
    expect(body).toEqual({
      error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
      code: "RATE_LIMITED",
    });
    const retry = Number(res.headers.get("retry-after"));
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // Solo se leyó el perfil del guard: la lectura en sí no llegó a ejecutarse.
    expect(state.selects.length).toBe(selectsAntes - 1);
  });

  it("sin sesión responde 401 (no 429) y no gasta el cupo de nadie", async () => {
    for (let i = 0; i < 5; i++) expect((await get("categories")).res.status).toBe(401);
    loginAs();
    expect((await get("categories")).res.status).toBe(200);
  });

  it("el cupo es por usuario: otro usuario sigue leyendo", async () => {
    for (let i = 0; i < 3; i++) {
      loginAs();
      await get("categories");
    }
    state.session = { user: { id: "22222222-2222-4222-8222-222222222222", email: "otro@example.test" } };
    state.selects.push([
      {
        id: "22222222-2222-4222-8222-222222222222",
        company_id: COMPANY,
        role: "lector",
        is_active: true,
        is_approved: true,
        is_rejected: false,
        has_avatar: false,
      },
    ]);
    expect((await get("categories")).res.status).toBe(200);
  });
});
