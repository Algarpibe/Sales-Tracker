import { describe, it, expect } from "vitest";
import { cumulativeSeries, executionByMonth, bucketMix, topCustomers, yoyChange } from "@/lib/dashboard-insights";

const rec = (record_type: string, record_month: number, amount_usd: number, category_id = "c1") =>
  ({ category_id, record_type, record_month, amount_usd });

describe("cumulativeSeries", () => {
  it("running total por record_type, longitud 12, meses vacíos mantienen acumulado", () => {
    const s = cumulativeSeries([rec("INVOICE", 1, 100), rec("INVOICE", 3, 50), rec("SALES_ORDER", 1, 999)], "INVOICE");
    expect(s).toHaveLength(12);
    expect(s[0]).toBe(100);
    expect(s[1]).toBe(100);
    expect(s[2]).toBe(150);
    expect(s[11]).toBe(150);
  });
});

describe("executionByMonth", () => {
  it("pct = inv/ov*100; OV=0 → 0", () => {
    const r = executionByMonth([
      { month: "Ene", sales_orders: 200, invoices: 100 },
      { month: "Feb", sales_orders: 0, invoices: 50 },
    ]);
    expect(r[0].pct).toBe(50);
    expect(r[1].pct).toBe(0);
  });
});

describe("bucketMix", () => {
  it("agrega por bucket; 4 entradas; pct suma ~100; filtra record_type", () => {
    const cats = new Map([["c1", "C&R Algo"], ["c2", "Equipos X"]]);
    const mix = bucketMix([rec("INVOICE", 1, 100, "c1"), rec("INVOICE", 2, 300, "c2"), rec("SALES_ORDER", 1, 999, "c1")], cats, "INVOICE");
    expect(mix).toHaveLength(4);
    expect(mix.find((m) => m.bucket === "cr")!.amount).toBe(100);
    expect(mix.find((m) => m.bucket === "equipos")!.amount).toBe(300);
    expect(Math.round(mix.reduce((s, m) => s + m.pct, 0))).toBe(100);
  });
});

describe("topCustomers", () => {
  it("ordena desc, agrega duplicados, cumPct llega a 100 con todos", () => {
    const rows = [
      { customer: "A", ventas: 100 }, { customer: "B", ventas: 300 },
      { customer: "A", ventas: 100 }, { customer: "C", ventas: 100 },
    ];
    const top = topCustomers(rows, 3);
    expect(top.map((t) => t.customer)).toEqual(["B", "A", "C"]);
    expect(top[1].amount).toBe(200);
    expect(Math.round(top[2].cumPct)).toBe(100);
  });
  it("respeta N", () => {
    expect(topCustomers([{ customer: "A", ventas: 1 }, { customer: "B", ventas: 2 }, { customer: "C", ventas: 3 }], 2)).toHaveLength(2);
  });
});

describe("yoyChange", () => {
  it("(a-b)/b*100; b<=0 → null", () => {
    expect(yoyChange(120, 100)).toBeCloseTo(20);
    expect(yoyChange(80, 100)).toBeCloseTo(-20);
    expect(yoyChange(100, 0)).toBeNull();
  });
});
