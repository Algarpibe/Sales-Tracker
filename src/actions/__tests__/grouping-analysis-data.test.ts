import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Caracterización (ARQ-079) de getGroupingAnalysisData: categoría → grupo, sumas por
 * grupo/año/mes, % sobre el total del año y promedios (contando los años a cero). La BD
 * es un doble en memoria: cada db.select() consume la siguiente respuesta de la cola, en
 * el orden en que la acción lanza las consultas (grupos, asignaciones, ventas/categorías).
 */

const state = vi.hoisted(() => ({
  queue: [] as unknown[][],
  hub: false,
  hubRows: [] as Record<string, unknown>[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireRole: async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "admin" } }),
  requireApproved: async () => ({ user: { id: "u1" }, profile: { id: "u1", company_id: "c1", role: "viewer" } }),
}));
vi.mock("@/db/hub", () => ({ hubEnabled: () => state.hub }));
vi.mock("@/db/hub-sales", () => ({ getHubSalesRows: async () => state.hubRows }));
vi.mock("@/db", () => {
  const db = {
    select: () => {
      const result = state.queue.shift() ?? [];
      const whereResult = {
        orderBy: async () => result,
        then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko),
      };
      return { from: () => ({ where: () => whereResult }) };
    },
  };
  return { db };
});

import { getGroupingAnalysisData } from "@/actions/grouping-actions";

const G1 = { id: "g1", name: "Grupo Uno", color: "#111111", sort_order: 0 };
const G2 = { id: "g2", name: "Grupo Dos", color: null, sort_order: 1 };
const rec = (category_id: string, record_year: number, record_month: number, amount_usd: number | string) => ({
  category_id,
  record_year,
  record_month,
  amount_usd,
});

beforeEach(() => {
  state.queue = [];
  state.hub = false;
  state.hubRows = [];
});

describe("getGroupingAnalysisData (caracterización)", () => {
  it("sin grupos devuelve el resultado vacío", async () => {
    state.queue = [[]];
    expect(await getGroupingAnalysisData("INVOICE")).toEqual({ rows: [], years: [], yearTotals: {} });
  });

  it("suma por grupo, año y mes; las categorías sin grupo cuentan solo en el total del año", async () => {
    state.queue = [
      [G1, G2],
      [
        { group_id: "g1", category_id: "a" },
        { group_id: "g1", category_id: "b" },
        { group_id: "g2", category_id: "c" },
      ],
      [
        rec("a", 2024, 1, 100),
        rec("b", 2024, 1, "50"), // NUMERIC llega como texto
        rec("c", 2024, 2, 50),
        rec("libre", 2024, 3, 800), // sin grupo: solo en yearTotals
        rec("a", 2025, 6, 300),
        rec("libre", 2025, 6, 100),
      ],
    ];
    const r = await getGroupingAnalysisData("INVOICE");

    expect(r.years).toEqual([2024, 2025]);
    expect(r.yearTotals).toEqual({ 2024: 1000, 2025: 400 });
    expect(r.rows.map((row) => [row.groupId, row.groupName, row.color])).toEqual([
      ["g1", "Grupo Uno", "#111111"],
      ["g2", "Grupo Dos", "#6366f1"], // color por defecto
    ]);

    const [g1, g2] = r.rows;
    expect(g1.months).toEqual({ 2024: { 1: 150 }, 2025: { 6: 300 } });
    expect(g1.years).toEqual({
      2024: { amount: 150, percentage: 15 },
      2025: { amount: 300, percentage: 75 },
    });
    // Promedio: (150 + 300) / 2 años; % = 450 / (1000 + 400).
    expect(g1.average.amount).toBe(225);
    expect(g1.average.percentage).toBeCloseTo((450 / 1400) * 100);

    // g2 no vende en 2025: el año cuenta en el promedio con 0.
    expect(g2.months).toEqual({ 2024: { 2: 50 } });
    expect(g2.years).toEqual({
      2024: { amount: 50, percentage: 5 },
      2025: { amount: 0, percentage: 0 },
    });
    expect(g2.average.amount).toBe(25);
    expect(g2.average.percentage).toBeCloseTo((50 / 1400) * 100);
  });

  it("grupo sin ventas: todo a cero y sin meses", async () => {
    state.queue = [[G1], [], [rec("a", 2025, 1, 10)]];
    const r = await getGroupingAnalysisData("SALES_ORDER");
    expect(r.rows[0].months).toEqual({});
    expect(r.rows[0].years).toEqual({ 2025: { amount: 0, percentage: 0 } });
    expect(r.rows[0].average).toEqual({ amount: 0, percentage: 0 });
  });

  it("hub: casa la categoría por nombre sin distinguir mayúsculas, filtra el tipo y descarta las desconocidas", async () => {
    state.hub = true;
    state.hubRows = [
      { category_name: "AIRE", record_type: "INVOICE", record_year: 2025, record_month: 3, amount_usd: 70 },
      { category_name: "aire", record_type: "SALES_ORDER", record_year: 2025, record_month: 3, amount_usd: 999 },
      { category_name: "Inexistente", record_type: "INVOICE", record_year: 2025, record_month: 3, amount_usd: 500 },
    ];
    state.queue = [[G1], [{ group_id: "g1", category_id: "cat-aire" }], [{ id: "cat-aire", name: "Aire" }]];
    const r = await getGroupingAnalysisData("INVOICE");
    expect(r.yearTotals).toEqual({ 2025: 70 });
    expect(r.rows[0].months).toEqual({ 2025: { 3: 70 } });
    expect(r.rows[0].years[2025]).toEqual({ amount: 70, percentage: 100 });
  });
});
