import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireApproved } from "@/lib/auth/guards";
import { AppError, authErrorStatus, RATE_LIMITED_CODE, RATE_LIMITED_MESSAGE } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recordTypeSchema, uuidSchema } from "@/lib/validation";
import {
  readCategories,
  readCategoryMonthSales,
  readCustomerItemSales,
  readCustomerMonthSales,
  readCustomerSales,
  readDashboardLayout,
  readItemSales,
  readKpiDealsMonthly,
  readKpiMonthlySales,
  readKpiProjectOrders,
  readKpiTargets,
  readKpiTicketsChanges,
  readKpiWonDealsMonthly,
  readMacroCategorias,
  readMarginByCustomer,
  readMarginByItem,
  readMarginByYear,
  readSalesData,
  readSalespeople,
  readTechServiceCategories,
} from "@/lib/data-reads";

/**
 * Lecturas por GET /api/data/[resource] (DATA-043). Next despacha las Server Actions
 * del navegador DE UNA EN UNA, así que una página con siete lecturas las encadenaba;
 * por GET, react-query las lanza en paralelo. Cada recurso valida su query string y
 * llama a la MISMA lectura que su Server Action (src/lib/data-reads.ts).
 *
 * Contrato de la respuesta, siempre JSON y nunca cacheable (datos por usuario):
 *  - 401 / 403  sin sesión / cuenta sin aprobar (el proxy ya lo corta antes; esto es
 *               defensa en profundidad). También 403 FORBIDDEN si la lectura es del hub
 *               y la empresa de la sesión no es la de HUB_COMPANY_ID (SEC-035).
 *  - 404        recurso desconocido (solo con sesión aprobada: no se revela qué existe).
 *  - 400        filtros inválidos; no se llega a consultar.
 *  - 429        límite de lecturas por usuario superado (SEC-006), con Retry-After.
 *  - 500        error inesperado: mensaje genérico; el detalle solo va al log.
 */

type Session = Awaited<ReturnType<typeof requireApproved>>;

function route<S extends z.ZodType, R>(params: S, run: (session: Session, p: z.output<S>) => Promise<R>) {
  return { params, run };
}

// Los valores de la query string llegan como texto. Los números se convierten aquí y
// los rangos (años del hub, fechas, cliente) los valida la lectura compartida, igual
// que cuando la llama la Server Action.
const num = z.coerce.number();
const tipo = recordTypeSchema;
const customer = z.string().optional();
const scope = z
  .string()
  .optional()
  .transform((v) => v ?? null);
const bool = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));
const empty = z.strictObject({});

const ROUTES = {
  sales: route(
    z.strictObject({
      year: num.pipe(z.number().int()).optional(),
      month: num.pipe(z.number().int().min(1).max(12)).optional(),
      record_type: tipo.optional(),
      category_id: uuidSchema.optional(),
    }),
    (s, p) => readSalesData(s.profile.company_id, p)
  ),
  categories: route(empty, (s) => readCategories(s.profile.company_id)),
  "tech-service-categories": route(empty, (s) => readTechServiceCategories(s.profile.company_id)),
  "macro-categorias": route(empty, (s) => readMacroCategorias(s.profile.company_id)),
  "dashboard-layout": route(empty, (s) => readDashboardLayout(s.profile.id)),
  "customer-sales": route(
    z.strictObject({ tipo, desdeAnio: num, hastaAnio: num, includeHistory: bool, customer }),
    (s, p) => readCustomerSales(s.profile.company_id, p)
  ),
  "customer-item": route(z.strictObject({ tipo, anio: num, customer }), (s, p) =>
    readCustomerItemSales(s.profile.company_id, p)
  ),
  "customer-month": route(z.strictObject({ tipo, anio: num, customer }), (s, p) =>
    readCustomerMonthSales(s.profile.company_id, p)
  ),
  "category-month": route(z.strictObject({ tipo, anio: num }), (s, p) => readCategoryMonthSales(s.profile.company_id, p)),
  "item-sales": route(z.strictObject({ tipo, desde: z.string(), hasta: z.string() }), (s, p) =>
    readItemSales(s.profile.company_id, p)
  ),
  "margin-by-year": route(z.strictObject({ tipo }), (s, p) => readMarginByYear(s.profile.company_id, p)),
  "margin-by-item": route(z.strictObject({ tipo, anio: num }), (s, p) => readMarginByItem(s.profile.company_id, p)),
  "margin-by-customer": route(z.strictObject({ tipo, anio: num, customer }), (s, p) =>
    readMarginByCustomer(s.profile.company_id, p)
  ),
  salespeople: route(empty, (s) => readSalespeople(s.profile.company_id)),
  "kpi-targets": route(
    z.strictObject({ year: num.pipe(z.number().int()), salesperson: scope }),
    (s, p) => readKpiTargets(s.profile.company_id, p.year, p.salesperson)
  ),
  "kpi-monthly-sales": route(z.strictObject({ tipo, anio: num, owner: scope }), (s, p) =>
    readKpiMonthlySales(s.profile.company_id, p.tipo, p.anio, p.owner)
  ),
  "kpi-deals": route(z.strictObject({ anio: num, owner: scope }), (s, p) =>
    readKpiDealsMonthly(s.profile.company_id, p.anio, p.owner)
  ),
  "kpi-won-deals": route(z.strictObject({ anio: num, owner: scope }), (s, p) =>
    readKpiWonDealsMonthly(s.profile.company_id, p.anio, p.owner)
  ),
  "kpi-tickets": route(z.strictObject({ anio: num }), (s, p) => readKpiTicketsChanges(s.profile.company_id, p.anio)),
  "kpi-project-orders": route(empty, (s) => readKpiProjectOrders(s.profile.company_id)),
};

export type DataResource = keyof typeof ROUTES;

/** Lo que devuelve (ya como JSON) cada recurso: el tipo de su lectura compartida. */
export type DataResult<K extends DataResource> = Awaited<ReturnType<(typeof ROUTES)[K]["run"]>>;

const GENERIC_ERROR = "Ocurrió un error interno. Inténtalo de nuevo.";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function errorResponse(e: unknown, resource: string): NextResponse {
  const status = authErrorStatus(e);
  if (status && e instanceof AppError) return json({ error: e.message, code: e.code }, status);
  if (e instanceof ZodError) {
    return json({ error: e.issues[0]?.message ?? "Datos inválidos", code: "VALIDATION" }, 400);
  }
  if (e instanceof AppError) return json({ error: e.message, code: e.code ?? "ERROR" }, 400);
  logError("GET /api/data falló (error inesperado)", e, { resource, code: "INTERNAL" });
  return json({ error: GENERIC_ERROR, code: "INTERNAL" }, 500);
}

export async function handleDataRequest(resource: string, search: URLSearchParams): Promise<NextResponse> {
  try {
    const session = await requireApproved();
    // SEC-006: límite por usuario (id de sesión), después de autorizar: sin sesión es
    // 401 y no gasta el cupo de nadie.
    const limit = consumeRateLimit("read", session.user.id);
    if (!limit.ok) {
      return NextResponse.json(
        { error: RATE_LIMITED_MESSAGE, code: RATE_LIMITED_CODE },
        { status: 429, headers: { ...HEADERS, "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    // hasOwn: "constructor" o "__proto__" no son recursos.
    if (!Object.hasOwn(ROUTES, resource)) return json({ error: "Recurso no encontrado.", code: "NOT_FOUND" }, 404);
    const def = ROUTES[resource as DataResource] as {
      params: z.ZodType;
      run: (s: Session, p: unknown) => Promise<unknown>;
    };
    const params = def.params.parse(Object.fromEntries(search));
    return json(await def.run(session, params));
  } catch (e) {
    return errorResponse(e, resource);
  }
}
