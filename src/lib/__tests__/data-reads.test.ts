import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DATA-046: la ficha /clientes/[customer] pide al servidor solo las filas de su cliente
 * en vez de toda la empresa. Caracterización: con las MISMAS filas de origen, lo que
 * pinta la ficha (KPIs, evolución, mezcla, top artículos, estacionalidad, margen) es
 * idéntico por los dos caminos: «traer todo y filtrar en el navegador» (antes) y
 * «filtrar en el servidor» (ahora).
 *
 * El pool del hub es un doble que aplica el único predicado que añade la variante por
 * cliente (`h.customer_name = $n`, comprobado al pie de la letra en
 * src/db/__tests__/hub-sql-characterization.test.ts) sobre un juego de filas fijo. El
 * histórico (BD de la app) es otro doble que filtra igual por el cliente recibido.
 */

type Row = Record<string, unknown> & { customer: string };

const state = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  historicalCalls: [] as unknown[][],
}));

const FILAS = vi.hoisted(() => ({
  // Cliente × año (facturas y órdenes comparten forma: el doble no distingue tablas).
  year: [
    { customer: "Cliente A", year: 2020, ventas: 70 },
    { customer: "Cliente A", year: 2021, ventas: 120.5 },
    { customer: "Cliente A", year: 2024, ventas: 300 },
    { customer: "Cliente B", year: 2021, ventas: 999 },
    { customer: "Cliente B", year: 2022, ventas: 10 },
    { customer: "cliente a", year: 2023, ventas: 5 }, // otra mayúscula: OTRO cliente
    { customer: "Cliente A ", year: 2023, ventas: 6 }, // espacio final: OTRO cliente
  ],
  item: [
    { customer: "Cliente A", sku: "S1", marca: "M", nombre: "Bomba", categoria: "Aguas", cantidad: 2, importe: 400 },
    { customer: "Cliente A", sku: null, marca: null, nombre: "Filtro", categoria: "Aire", cantidad: 1, importe: 50 },
    { customer: "Cliente A", sku: "S3", marca: "M", nombre: "Servicio", categoria: "Suelos", cantidad: 3, importe: 50 },
    { customer: "Cliente B", sku: "S1", marca: "M", nombre: "Bomba", categoria: "Aguas", cantidad: 9, importe: 9000 },
  ],
  month: [
    { customer: "Cliente A", mes: 1, importe: 10 },
    { customer: "Cliente A", mes: 12, importe: 20 },
    { customer: "Cliente B", mes: 1, importe: 500 },
  ],
  margin: [
    { customer: "Cliente A", ventas: 1000, costo: 600 },
    { customer: "Cliente B", ventas: 50, costo: 10 },
  ],
  historical: [
    { customer: "Cliente A", year: 2016, ventas: 40, source: "historical" as const },
    { customer: "Cliente B", year: 2015, ventas: 80, source: "historical" as const },
  ],
}));

/** Qué juego de filas devuelve cada consulta, por su lista de columnas. */
function juegoDe(sql: string): Row[] {
  if (sql.includes("AS marca")) return FILAS.item;
  if (sql.includes("AS costo")) return FILAS.margin;
  if (sql.includes("AS year")) return FILAS.year;
  if (sql.includes("AS mes")) return FILAS.month;
  throw new Error(`consulta inesperada: ${sql}`);
}

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/hub", () => ({
  hubEnabled: () => true,
  getHubPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      const filtro = /h\.customer_name = \$(\d+)/.exec(sql);
      const filas = juegoDe(sql);
      const rows = filtro ? filas.filter((r) => r.customer === params[Number(filtro[1]) - 1]) : filas;
      return { rows: rows.map((r) => ({ ...r })) };
    },
  }),
}));
vi.mock("@/db/historical-customer-sales", () => ({
  HISTORICAL_LAST_YEAR: 2020,
  getHistoricalCustomerSales: async (...args: unknown[]) => {
    state.historicalCalls.push(args);
    const customer = args[3] as string | undefined;
    return FILAS.historical.filter((r) => customer === undefined || r.customer === customer);
  },
}));

import {
  readCustomerItemSales,
  readCustomerMonthSales,
  readCustomerSales,
  readMarginByCustomer,
} from "@/lib/data-reads";
import {
  customerBuckets,
  customerMarginKpi,
  customerMonths,
  customerSinceYear,
  customerTopItems,
  customerTotalVentas,
  customerYearSeries,
} from "@/lib/customer-detail";
import { mapaMacroCategorias } from "@/lib/customer-item";

const COMPANY = "99999999-9999-4999-8999-999999999999";
const CLIENTES = ["Cliente A", "Cliente B", "cliente a", "Cliente A ", "Sin ventas"];
const MAPA = mapaMacroCategorias([
  { name: "Aguas", macro_categoria: "mano_obra" },
  { name: "Aire", macro_categoria: "cr" },
]);

beforeEach(() => {
  state.queries = [];
  state.historicalCalls = [];
});

describe("ficha de cliente: filtrar en el servidor = traer todo y filtrar en el navegador", () => {
  it.each(CLIENTES)("ventas por año con histórico (%s)", async (customer) => {
    const base = { desdeAnio: 2015, hastaAnio: 2025, includeHistory: true } as const;
    const [facTodo, ovTodo, facUno, ovUno] = await Promise.all([
      readCustomerSales(COMPANY, { ...base, tipo: "INVOICE" }),
      readCustomerSales(COMPANY, { ...base, tipo: "SALES_ORDER" }),
      readCustomerSales(COMPANY, { ...base, tipo: "INVOICE", customer }),
      readCustomerSales(COMPANY, { ...base, tipo: "SALES_ORDER", customer }),
    ]);

    // Las filas que llegan son exactamente las de ese cliente, en el mismo orden.
    expect(facUno).toEqual(facTodo.filter((r) => r.customer === customer));
    expect(ovUno).toEqual(ovTodo.filter((r) => r.customer === customer));
    // Y lo que pinta la ficha no cambia.
    expect(customerYearSeries(facUno, customer)).toEqual(customerYearSeries(facTodo, customer));
    expect(customerTotalVentas(facUno, customer)).toBe(customerTotalVentas(facTodo, customer));
    expect(customerTotalVentas(ovUno, customer)).toBe(customerTotalVentas(ovTodo, customer));
    expect(customerSinceYear(facUno, ovUno, customer)).toBe(customerSinceYear(facTodo, ovTodo, customer));
  });

  it("el histórico también se pide filtrado por el cliente", async () => {
    await readCustomerSales(COMPANY, { tipo: "INVOICE", desdeAnio: 2015, hastaAnio: 2025, includeHistory: true, customer: "Cliente A" });
    expect(state.historicalCalls).toEqual([[COMPANY, 2015, 2025, "Cliente A"]]);
  });

  it.each(CLIENTES)("artículos: mezcla y top (%s)", async (customer) => {
    const todo = await readCustomerItemSales({ tipo: "INVOICE", anio: 2025 });
    const uno = await readCustomerItemSales({ tipo: "INVOICE", anio: 2025, customer });
    expect(uno).toEqual(todo.filter((r) => r.customer === customer));
    expect(customerTopItems(uno, customer, 15)).toEqual(customerTopItems(todo, customer, 15));
    expect(customerBuckets(uno, customer, MAPA)).toEqual(customerBuckets(todo, customer, MAPA));
  });

  it.each(CLIENTES)("estacionalidad (%s)", async (customer) => {
    const todo = await readCustomerMonthSales({ tipo: "SALES_ORDER", anio: 2025 });
    const uno = await readCustomerMonthSales({ tipo: "SALES_ORDER", anio: 2025, customer });
    expect(customerMonths(uno, customer)).toEqual(customerMonths(todo, customer));
  });

  it.each(CLIENTES)("margen (%s)", async (customer) => {
    const todo = await readMarginByCustomer({ tipo: "INVOICE", anio: 2025 });
    const uno = await readMarginByCustomer({ tipo: "INVOICE", anio: 2025, customer });
    expect(customerMarginKpi(uno, customer)).toEqual(customerMarginKpi(todo, customer));
  });
});

describe("validación de las lecturas compartidas", () => {
  const year = new Date().getFullYear();

  it("rechaza un cliente vacío o demasiado largo sin consultar", async () => {
    await expect(readCustomerItemSales({ tipo: "INVOICE", anio: year, customer: "" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(readCustomerMonthSales({ tipo: "INVOICE", anio: year, customer: "x".repeat(301) })).rejects.toMatchObject({ name: "ZodError" });
    await expect(readMarginByCustomer({ tipo: "INVOICE", anio: year, customer: "" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      readCustomerSales(COMPANY, { tipo: "INVOICE", desdeAnio: 2021, hastaAnio: year, customer: "" }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(state.queries).toHaveLength(0);
    expect(state.historicalCalls).toHaveLength(0);
  });

  it("rechaza años fuera de rango sin consultar", async () => {
    await expect(readCustomerItemSales({ tipo: "INVOICE", anio: 2014 })).rejects.toMatchObject({ name: "ZodError" });
    await expect(readMarginByCustomer({ tipo: "INVOICE", anio: year + 2 })).rejects.toMatchObject({ name: "ZodError" });
    expect(state.queries).toHaveLength(0);
  });

  it("sin includeHistory no consulta el histórico", async () => {
    await readCustomerSales(COMPANY, { tipo: "INVOICE", desdeAnio: 2015, hastaAnio: year, customer: "Cliente A" });
    expect(state.historicalCalls).toHaveLength(0);
  });
});
