import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Caracterización del SQL que envía cada consulta de src/db/hub-*.ts (AI-081).
 * El pool del hub se sustituye por un doble que guarda la sentencia y los parámetros;
 * las funciones corren tal cual. El snapshot fija el texto, así que extraer piezas
 * compartidas (SOURCES, importe neto) no puede cambiar lo que llega a Postgres.
 *
 * El texto se normaliza antes de comparar: los espacios y saltos de línea en torno a
 * signos de puntuación no significan nada en SQL (no hay literales con espacios en
 * estas consultas), y cada módulo tenía su propio sangrado. Todo lo demás —tablas,
 * columnas, alias, filtros, orden de parámetros— se compara literal.
 */

const state = vi.hoisted(() => ({
  queries: [] as { sql: string; params?: unknown[] }[],
}));

vi.mock("@/db/hub", () => ({
  hubEnabled: () => true,
  getHubPool: () => ({
    query: async (sql: string, params?: unknown[]) => {
      state.queries.push({ sql, params });
      return { rows: [] };
    },
  }),
}));

import { getHubCategoryMonthSales } from "@/db/hub-category-month-sales";
import { getHubCustomerItemSales } from "@/db/hub-customer-item-sales";
import { getHubCustomerMonthSales } from "@/db/hub-customer-month-sales";
import { getHubCustomerSales } from "@/db/hub-customer-sales";
import { getHubItemSales } from "@/db/hub-item-sales";
import {
  getHubCommercialNotificationChanges,
  getHubCustomerMonthByOwner,
  getHubDealsMonth,
  getHubOrdersByIds,
  getHubSalespeople,
  getHubWonDealsMonth,
  searchHubSalesOrders,
} from "@/db/hub-kpi";
import { getHubMarginByCustomer, getHubMarginByItem, getHubMarginByYear } from "@/db/hub-margin";
import { getHubSalesRows } from "@/db/hub-sales";

/** Colapsa espacios y quita los que rodean a signos de puntuación. */
function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/ ?([^\w\s'"]) ?/g, "$1")
    .trim();
}

const TIPOS = ["SALES_ORDER", "INVOICE"] as const;
const CLIENTE = "Cliente A";

async function capturar(run: () => Promise<unknown>) {
  state.queries = [];
  await run();
  expect(state.queries).toHaveLength(1);
  const [{ sql, params }] = state.queries;
  return { sql: normalizeSql(sql), params };
}

beforeEach(() => {
  state.queries = [];
});

describe("normalizeSql", () => {
  it("ignora el sangrado y los espacios junto a puntuación, no los de entre palabras", () => {
    expect(normalizeSql("round( sum(a,b) )::numeric , 2\n  AS  importe")).toBe("round(sum(a,b))::numeric,2 AS importe");
  });
});

describe("SQL del hub (caracterización)", () => {
  for (const tipo of TIPOS) {
    it(`getHubCategoryMonthSales ${tipo}`, async () => {
      expect(await capturar(() => getHubCategoryMonthSales({ tipo, anio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubCustomerItemSales ${tipo}`, async () => {
      expect(await capturar(() => getHubCustomerItemSales({ tipo, anio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubCustomerMonthSales ${tipo}`, async () => {
      expect(await capturar(() => getHubCustomerMonthSales({ tipo, anio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubCustomerSales ${tipo}`, async () => {
      expect(await capturar(() => getHubCustomerSales({ tipo, desdeAnio: 2021, hastaAnio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubItemSales ${tipo}`, async () => {
      expect(
        await capturar(() => getHubItemSales({ tipo, desde: "2025-01-01", hasta: "2025-12-31" })),
      ).toMatchSnapshot();
    });
    it(`getHubMarginByYear ${tipo}`, async () => {
      expect(await capturar(() => getHubMarginByYear({ tipo }))).toMatchSnapshot();
    });
    it(`getHubMarginByItem ${tipo}`, async () => {
      expect(await capturar(() => getHubMarginByItem({ tipo, anio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubMarginByCustomer ${tipo}`, async () => {
      expect(await capturar(() => getHubMarginByCustomer({ tipo, anio: 2025 }))).toMatchSnapshot();
    });
    it(`getHubCustomerMonthByOwner ${tipo}`, async () => {
      expect(await capturar(() => getHubCustomerMonthByOwner({ tipo, anio: 2025, owner: "Comercial A" }))).toMatchSnapshot();
    });
  }

  it("getHubSalesRows", async () => {
    expect(await capturar(() => getHubSalesRows())).toMatchSnapshot();
  });
  it("getHubSalespeople", async () => {
    expect(await capturar(() => getHubSalespeople())).toMatchSnapshot();
  });
  it("getHubDealsMonth", async () => {
    expect(await capturar(() => getHubDealsMonth({ anio: 2025, owner: null }))).toMatchSnapshot();
  });
  it("getHubWonDealsMonth", async () => {
    expect(await capturar(() => getHubWonDealsMonth({ anio: 2025, owner: null }))).toMatchSnapshot();
  });
  it("searchHubSalesOrders", async () => {
    expect(await capturar(() => searchHubSalesOrders("Cliente A", 2025))).toMatchSnapshot();
  });
  it("getHubOrdersByIds", async () => {
    expect(await capturar(() => getHubOrdersByIds(["so-1", "so-2"]))).toMatchSnapshot();
  });
  it("getHubCommercialNotificationChanges", async () => {
    expect(await capturar(() => getHubCommercialNotificationChanges(2025))).toMatchSnapshot();
  });

  // DATA-046: variantes filtradas por cliente de la ficha /clientes/[customer].
  for (const tipo of TIPOS) {
    it(`getHubCustomerItemSales ${tipo} por cliente`, async () => {
      expect(await capturar(() => getHubCustomerItemSales({ tipo, anio: 2025, customer: CLIENTE }))).toMatchSnapshot();
    });
    it(`getHubCustomerMonthSales ${tipo} por cliente`, async () => {
      expect(await capturar(() => getHubCustomerMonthSales({ tipo, anio: 2025, customer: CLIENTE }))).toMatchSnapshot();
    });
    it(`getHubCustomerSales ${tipo} por cliente`, async () => {
      expect(
        await capturar(() => getHubCustomerSales({ tipo, desdeAnio: 2015, hastaAnio: 2025, customer: CLIENTE })),
      ).toMatchSnapshot();
    });
    it(`getHubMarginByCustomer ${tipo} por cliente`, async () => {
      expect(await capturar(() => getHubMarginByCustomer({ tipo, anio: 2025, customer: CLIENTE }))).toMatchSnapshot();
    });
  }
});

/**
 * DATA-046: la consulta por cliente es la de toda la empresa con UN predicado más
 * (`h.customer_name = $n`, con el nombre como parámetro) y nada más. Así, filtrar en
 * el servidor da exactamente las filas de ese cliente que antes se filtraban en el
 * navegador: mismas columnas, misma agregación y mismo resto de filtros.
 */
describe("consulta por cliente = consulta de la empresa + un predicado", () => {
  const casos: [string, () => Promise<unknown>, () => Promise<unknown>][] = TIPOS.flatMap(
    (tipo): [string, () => Promise<unknown>, () => Promise<unknown>][] => [
      [
        `getHubCustomerItemSales ${tipo}`,
        () => getHubCustomerItemSales({ tipo, anio: 2025 }),
        () => getHubCustomerItemSales({ tipo, anio: 2025, customer: CLIENTE }),
      ],
      [
        `getHubCustomerMonthSales ${tipo}`,
        () => getHubCustomerMonthSales({ tipo, anio: 2025 }),
        () => getHubCustomerMonthSales({ tipo, anio: 2025, customer: CLIENTE }),
      ],
      [
        `getHubCustomerSales ${tipo}`,
        () => getHubCustomerSales({ tipo, desdeAnio: 2015, hastaAnio: 2025 }),
        () => getHubCustomerSales({ tipo, desdeAnio: 2015, hastaAnio: 2025, customer: CLIENTE }),
      ],
      [
        `getHubMarginByCustomer ${tipo}`,
        () => getHubMarginByCustomer({ tipo, anio: 2025 }),
        () => getHubMarginByCustomer({ tipo, anio: 2025, customer: CLIENTE }),
      ],
    ],
  );

  it.each(casos)("%s", async (_n, empresa, cliente) => {
    const base = await capturar(empresa);
    const filtrada = await capturar(cliente);
    const predicado = `AND h.customer_name=$${(base.params ?? []).length + 1}`;
    expect(filtrada.params).toEqual([...(base.params ?? []), CLIENTE]);
    expect(filtrada.sql.split(predicado)).toHaveLength(2);
    expect(normalizeSql(filtrada.sql.replace(predicado, ""))).toBe(base.sql);
  });

  it("sin cliente no se añade ni predicado ni parámetro", async () => {
    const { sql, params } = await capturar(() => getHubCustomerItemSales({ tipo: "INVOICE", anio: 2025 }));
    expect(sql).not.toContain("customer_name=$");
    expect(params).toEqual([2025]);
  });
});

/**
 * DATA-045: ningún filtro por año envuelve la columna de fecha en extract(): con un
 * rango, Postgres puede usar un índice B-tree sobre ella. extract() sigue en el SELECT
 * y en el GROUP BY (agrupar por mes), no en el WHERE.
 */
describe("filtros de fecha sargables", () => {
  const consultas: [string, () => Promise<unknown>][] = [
    ...TIPOS.flatMap((tipo): [string, () => Promise<unknown>][] => [
      [`getHubCategoryMonthSales ${tipo}`, () => getHubCategoryMonthSales({ tipo, anio: 2025 })],
      [`getHubCustomerItemSales ${tipo}`, () => getHubCustomerItemSales({ tipo, anio: 2025 })],
      [`getHubCustomerMonthSales ${tipo}`, () => getHubCustomerMonthSales({ tipo, anio: 2025 })],
      [`getHubCustomerSales ${tipo}`, () => getHubCustomerSales({ tipo, desdeAnio: 2021, hastaAnio: 2025 })],
      [`getHubMarginByItem ${tipo}`, () => getHubMarginByItem({ tipo, anio: 2025 })],
      [`getHubMarginByCustomer ${tipo}`, () => getHubMarginByCustomer({ tipo, anio: 2025 })],
      [`getHubCustomerMonthByOwner ${tipo}`, () => getHubCustomerMonthByOwner({ tipo, anio: 2025, owner: null })],
    ]),
    ["getHubDealsMonth", () => getHubDealsMonth({ anio: 2025, owner: null })],
    ["getHubWonDealsMonth", () => getHubWonDealsMonth({ anio: 2025, owner: null })],
    ["searchHubSalesOrders", () => searchHubSalesOrders("Cliente A", 2025)],
  ];

  it.each(consultas)("%s filtra el año con un rango, no con extract()", async (_n, run) => {
    const { sql } = await capturar(run);
    const desde = sql.indexOf(" WHERE ");
    const hasta = sql.slice(desde).search(/GROUP BY|ORDER BY/);
    const where = hasta === -1 ? sql.slice(desde) : sql.slice(desde, desde + hasta);
    expect(where).not.toMatch(/extract\(year/);
    expect(where).toMatch(/>=make_(date|timestamptz)\(/);
  });
});
