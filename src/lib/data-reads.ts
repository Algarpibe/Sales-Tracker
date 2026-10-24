import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, kpiProjectOrders, kpiTargets, salesRecords, savedViews } from "@/db/schema";
import { hubEnabled } from "@/db/hub";
import { getHubSalesRows } from "@/db/hub-sales";
import { getHubCategoryMonthSales } from "@/db/hub-category-month-sales";
import { getHubCustomerItemSales } from "@/db/hub-customer-item-sales";
import { getHubCustomerMonthSales } from "@/db/hub-customer-month-sales";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import { getHubItemSales } from "@/db/hub-item-sales";
import { getHubMarginByCustomer, getHubMarginByItem, getHubMarginByYear } from "@/db/hub-margin";
import {
  getHubCommercialNotificationChanges,
  getHubCustomerMonthByOwner,
  getHubDealsMonth,
  getHubOrdersByIds,
  getHubSalespeople,
  getHubWonDealsMonth,
  searchHubSalesOrders,
  type HubOrderRow,
} from "@/db/hub-kpi";
import type { HubSalesRow } from "@/db/hub-sales";

export type { HubOrderRow };
import { getHistoricalCustomerSales, HISTORICAL_LAST_YEAR } from "@/db/historical-customer-sales";
import { mergeWithHistory } from "@/lib/customer-sales";
import { findByHubCategoryName, indexCategoriesByName } from "@/lib/hub-category";
import { assertHubCompany } from "@/lib/hub-company";
import { parseDashboardLayout, type DashboardItem } from "@/lib/dashboard-layout";
import { filaDeMeta } from "@/lib/kpi-metas";
import { logError, logWarn } from "@/lib/logger";
import { hubCustomerSchema, hubDateRangeSchema, hubYearRangeSchema, hubYearSchema } from "@/lib/validation";
import type { KpiScope, KpiTargetRow } from "@/actions/kpi-actions";
import type { DealMonthRow } from "@/lib/kpi-score";
import type { CambioFase } from "@/lib/kpi-tickets";
import type {
  CategoryMonthFilters,
  CategoryMonthRow,
  CustomerItemFilters,
  CustomerItemRow,
  CustomerMonthFilters,
  CustomerMonthRow,
  CustomerSalesFilters,
  CustomerYearRow,
  ItemSalesFilters,
  ItemSalesRow,
  MacroCategoria,
  MarginByYearFilters,
  MarginCustomerFilters,
  MarginCustomerRow,
  MarginFilters,
  MarginItemRow,
  MarginYearRow,
  RecordType,
  SalesFilters,
  SalesRecord,
  TechServiceCategory,
} from "@/types/database";

/**
 * Lecturas compartidas por las Server Actions (src/actions/*) y por las rutas GET de
 * /api/data (src/lib/data-api.ts), DATA-043. Aquí va todo lo que pasa DESPUÉS de
 * autorizar: validación de filtros, consulta y transformación. Ninguna función de este
 * módulo comprueba la sesión: el llamador ya llamó a requireApproved() y le pasa la
 * empresa o el usuario de ESA sesión. Por eso este módulo no es "use server" y no se
 * importa desde el cliente (AGENTS.md, regla 1).
 *
 * Es también el ÚNICO módulo de la app que importa las consultas del hub (src/db/hub-*):
 * toda lectura del hub recibe la empresa de la sesión y llama a assertHubCompany() antes
 * de consultar (SEC-035, HUB_COMPANY_ID). Lo vigila hub-company-scope.test.ts.
 */

/**
 * Agregado de ventas del hub (categoría × tipo × año × mes) para la empresa de la
 * sesión. Lo usan readSalesData y el análisis de agrupaciones (grouping-actions).
 */
export async function readHubSalesRows(companyId: string): Promise<HubSalesRow[]> {
  assertHubCompany(companyId);
  return getHubSalesRows();
}

// ── Ventas agregadas (sales_records o el hub) ────────────────────────────────

// F3-06: vigilar el tamaño del payload de getSalesData (callers como analytics piden
// todo el histórico). No se capa (los charts multi-año lo necesitan); se registra un
// aviso si supera el umbral para detectar crecimiento.
const SALES_PAYLOAD_WARN_THRESHOLD = 5000;
function warnIfLargeSalesPayload(count: number, filters: SalesFilters) {
  if (count > SALES_PAYLOAD_WARN_THRESHOLD) {
    // PRIV-017: `search` es texto libre (puede ser un cliente); solo se registra si hubo.
    const { search, ...rest } = filters;
    logWarn("getSalesData payload grande", {
      count,
      threshold: SALES_PAYLOAD_WARN_THRESHOLD,
      filters: { ...rest, hasSearch: Boolean(search) },
    });
  }
}

export async function readSalesData(companyId: string, filters: SalesFilters): Promise<SalesRecord[]> {
  // --- Lectura directa del zoho-hub (si HUB_DB_URL está configurado) ---
  // Agrega en vivo desde el hub y mapea por NOMBRE de categoría a las categorías
  // de la app. Mismo resultado que sales_records (validado al céntimo) pero en
  // tiempo real. Si HUB_DB_URL no está → fallback a sales_records (abajo).
  if (hubEnabled()) {
    // SEC-035: antes de lanzar ninguna consulta (ni la de categorías).
    assertHubCompany(companyId);
    const [hubRows, cats] = await Promise.all([
      readHubSalesRows(companyId),
      db
        .select({ id: categories.id, name: categories.name, color: categories.color })
        .from(categories)
        .where(eq(categories.company_id, companyId)),
    ]);
    const byName = indexCategoriesByName(cats);
    const out: SalesRecord[] = [];
    for (const r of hubRows) {
      const cat = findByHubCategoryName(byName, r.category_name);
      if (!cat) continue; // categoría del hub que no existe en la app (igual que el transform)
      if (filters.year && r.record_year !== filters.year) continue;
      if (filters.month && r.record_month !== filters.month) continue;
      if (filters.record_type && r.record_type !== filters.record_type) continue;
      if (filters.category_id && cat.id !== filters.category_id) continue;
      out.push({
        id: `${cat.id}:${r.record_type}:${r.record_year}:${r.record_month}`,
        company_id: companyId,
        category_id: cat.id,
        record_type: r.record_type,
        amount_usd: r.amount_usd,
        record_month: r.record_month,
        record_year: r.record_year,
        notes: null,
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
        categories: { name: cat.name, color: cat.color ?? "" },
      } as unknown as SalesRecord);
    }
    warnIfLargeSalesPayload(out.length, filters);
    return out;
  }

  // --- Fallback: sales_records (poblado por el transform de n8n) ---
  const conditions = [eq(salesRecords.company_id, companyId)];
  if (filters.year) conditions.push(eq(salesRecords.record_year, filters.year));
  if (filters.month) conditions.push(eq(salesRecords.record_month, filters.month));
  if (filters.category_id) conditions.push(eq(salesRecords.category_id, filters.category_id));
  if (filters.record_type) conditions.push(eq(salesRecords.record_type, filters.record_type));

  const rows = await db
    .select({
      record: salesRecords,
      category_name: categories.name,
      category_color: categories.color,
    })
    .from(salesRecords)
    .leftJoin(categories, eq(salesRecords.category_id, categories.id))
    .where(and(...conditions))
    .orderBy(desc(salesRecords.record_year), asc(salesRecords.record_month));

  const result = rows.map((row) => ({
    ...row.record,
    amount_usd: Number(row.record.amount_usd),
    categories: {
      name: row.category_name ?? "",
      color: row.category_color ?? "",
    },
  })) as SalesRecord[];
  warnIfLargeSalesPayload(result.length, filters);
  return result;
}

// ── Categorías de la app ─────────────────────────────────────────────────────

/** Categorías activas de la empresa, en el orden de la pantalla. */
export async function readCategories(companyId: string) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.company_id, companyId), eq(categories.is_active, true)))
    .orderBy(asc(categories.sort_order), asc(categories.name));
}

/**
 * Categorías de la compañía con su grupo de Servicio Técnico, activas e inactivas.
 * A diferencia de readCategories(), no filtra por is_active: una categoría desactivada
 * que sigue clasificada tiene ventas históricas que el gráfico y el KPI deben seguir
 * contando al comparar años.
 */
export async function readTechServiceCategories(companyId: string): Promise<TechServiceCategory[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      is_active: categories.is_active,
      tech_service_bucket: categories.tech_service_bucket,
    })
    .from(categories)
    .where(eq(categories.company_id, companyId))
    .orderBy(asc(categories.sort_order), asc(categories.name));
}

/**
 * Categorías de la compañía con su macro-categoría, activas e inactivas. Las inactivas
 * hacen falta porque sus ventas de años anteriores siguen en los gráficos y deben caer
 * en la misma macro-categoría que cuando estaban activas.
 */
export async function readMacroCategorias(companyId: string): Promise<MacroCategoria[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      is_active: categories.is_active,
      macro_categoria: categories.macro_categoria,
    })
    .from(categories)
    .where(eq(categories.company_id, companyId))
    .orderBy(asc(categories.sort_order), asc(categories.name));
}

// ── Layout del dashboard ─────────────────────────────────────────────────────

export const DASHBOARD_VIEW_KEY = "dashboard";
export const DASHBOARD_LAYOUT_NAME = "layout";

// null = el usuario no ha personalizado (el llamante usa DEFAULT_LAYOUT).
export async function readDashboardLayout(userId: string): Promise<DashboardItem[] | null> {
  try {
    const rows = await db
      .select({ state: savedViews.state })
      .from(savedViews)
      .where(and(
        eq(savedViews.user_id, userId),
        eq(savedViews.view_key, DASHBOARD_VIEW_KEY),
        eq(savedViews.name, DASHBOARD_LAYOUT_NAME),
      ))
      .limit(1);
    if (rows.length === 0) return null;
    return parseDashboardLayout(rows[0].state);
  } catch (e) {
    // Degrada al layout por defecto para no romper el dashboard, pero deja rastro del
    // fallo real (ARQ-077: antes se tragaba en silencio).
    logError("getDashboardLayout falló; degradando a null", e);
    return null;
  }
}

// ── Lecturas del zoho-hub ────────────────────────────────────────────────────
// Validan los filtros ANTES de consultar: un filtro absurdo no debe llegar a Postgres.
// Lanzan si no validan (ZodError): la acción lo deja subir a react-query y la ruta GET
// lo convierte en 400.
// Todas reciben la empresa de la sesión y la comprueban lo primero (SEC-035): una
// empresa que no es la dueña del hub recibe FORBIDDEN (403) sin llegar a consultar.

function checkCustomer(customer: string | undefined) {
  if (customer !== undefined) hubCustomerSchema.parse(customer);
}

export async function readCustomerSales(companyId: string, filters: CustomerSalesFilters): Promise<CustomerYearRow[]> {
  assertHubCompany(companyId);
  hubYearRangeSchema.parse(filters);
  checkCustomer(filters.customer);

  const hubRows = (await getHubCustomerSales(filters)).map((r) => ({
    ...r,
    source: "hub" as const,
  }));

  // El histórico solo se sirve a quien lo pide explícitamente (hoy: /clientes y la
  // ficha). Además es facturación consolidada, así que no aplica a Órdenes de Venta,
  // y no existe por encima de 2020: fuera de ese rango ni se consulta.
  const aplica =
    filters.includeHistory === true &&
    filters.tipo === "INVOICE" &&
    filters.desdeAnio <= HISTORICAL_LAST_YEAR;

  if (!aplica) return hubRows;

  const histRows = await getHistoricalCustomerSales(
    companyId,
    filters.desdeAnio,
    filters.hastaAnio,
    filters.customer
  );

  // El historico manda en su rango: el 2020 del hub es parcial (Zoho se empezo
  // a usar a mediados de 2020) y sumar ambas fuentes duplicaria ese anio.
  return mergeWithHistory(hubRows, histRows, HISTORICAL_LAST_YEAR);
}

export async function readCustomerItemSales(companyId: string, f: CustomerItemFilters): Promise<CustomerItemRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(f.anio);
  checkCustomer(f.customer);
  return getHubCustomerItemSales(f);
}

export async function readCustomerMonthSales(companyId: string, f: CustomerMonthFilters): Promise<CustomerMonthRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(f.anio);
  checkCustomer(f.customer);
  return getHubCustomerMonthSales(f);
}

export async function readCategoryMonthSales(companyId: string, f: CategoryMonthFilters): Promise<CategoryMonthRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(f.anio);
  return getHubCategoryMonthSales(f);
}

export async function readItemSales(companyId: string, f: ItemSalesFilters): Promise<ItemSalesRow[]> {
  assertHubCompany(companyId);
  hubDateRangeSchema.parse(f);
  return getHubItemSales(f);
}

export async function readMarginByYear(companyId: string, f: MarginByYearFilters): Promise<MarginYearRow[]> {
  assertHubCompany(companyId);
  return getHubMarginByYear(f);
}

export async function readMarginByItem(companyId: string, f: MarginFilters): Promise<MarginItemRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(f.anio);
  return getHubMarginByItem(f);
}

export async function readMarginByCustomer(companyId: string, f: MarginCustomerFilters): Promise<MarginCustomerRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(f.anio);
  checkCustomer(f.customer);
  return getHubMarginByCustomer(f);
}

// ── KPIs comerciales ─────────────────────────────────────────────────────────

export async function readSalespeople(companyId: string): Promise<string[]> {
  assertHubCompany(companyId);
  return getHubSalespeople();
}

export async function readKpiTargets(companyId: string, year: number, salesperson: KpiScope): Promise<KpiTargetRow[]> {
  const rows = await db
    .select({
      kpi_key: kpiTargets.kpi_key,
      target_value: kpiTargets.target_value,
      weight_pct: kpiTargets.weight_pct,
      plazo_horas: kpiTargets.plazo_horas,
    })
    .from(kpiTargets)
    .where(
      and(
        eq(kpiTargets.company_id, companyId),
        eq(kpiTargets.record_year, year),
        // eq(col, null) genera "= NULL" y no casa nunca: hace falta IS NOT DISTINCT FROM.
        sql`${kpiTargets.salesperson} IS NOT DISTINCT FROM ${salesperson}`
      )
    );

  // numeric llega como string desde Drizzle: filaDeMeta lo convierte sin volver 0 un plazo nulo.
  return rows.map(filaDeMeta);
}

/** Ventas por cliente y mes del año, opcionalmente de un solo comercial. */
export async function readKpiMonthlySales(companyId: string, tipo: RecordType, anio: number, owner: KpiScope) {
  assertHubCompany(companyId);
  hubYearSchema.parse(anio);
  return getHubCustomerMonthByOwner({ tipo, anio, owner });
}

/** Tratos por cuenta y mes del año, opcionalmente de un solo comercial. */
export async function readKpiDealsMonthly(companyId: string, anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(anio);
  return getHubDealsMonth({ anio, owner });
}

/** Tratos ganados por cuenta y mes del año, opcionalmente de un solo comercial. */
export async function readKpiWonDealsMonthly(companyId: string, anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  assertHubCompany(companyId);
  hubYearSchema.parse(anio);
  return getHubWonDealsMonth({ anio, owner });
}

/** Cambios de fase de "Notificación Comercial" del año (de compañía). */
export async function readKpiTicketsChanges(companyId: string, year: number): Promise<CambioFase[]> {
  assertHubCompany(companyId);
  const anio = hubYearSchema.parse(year);
  return getHubCommercialNotificationChanges(anio);
}

/**
 * Órdenes de venta del año que casan con la búsqueda, para marcarlas como ingresos de
 * proyecto. La búsqueda y el año ya llegan validados por la acción.
 */
export async function readSalesOrderSearch(companyId: string, query: string, anio: number): Promise<HubOrderRow[]> {
  assertHubCompany(companyId);
  return searchHubSalesOrders(query, anio);
}

/** Órdenes ya marcadas como ingresos de proyecto de la empresa, con su importe en vivo. */
export async function readKpiProjectOrders(companyId: string): Promise<HubOrderRow[]> {
  assertHubCompany(companyId);
  const marcadas = await db
    .select({ hub_order_id: kpiProjectOrders.hub_order_id })
    .from(kpiProjectOrders)
    .where(eq(kpiProjectOrders.company_id, companyId));
  return getHubOrdersByIds(marcadas.map((m) => m.hub_order_id));
}
