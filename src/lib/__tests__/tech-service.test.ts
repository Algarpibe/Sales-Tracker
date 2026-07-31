import { describe, it, expect } from "vitest";
import { buildTechServiceData, ST_CATEGORIES, CR_CATEGORIES } from "@/lib/tech-service";

const rec = (record_month: number, amount_usd: number, category_id: string, record_type = "INVOICE") =>
  ({ record_month, amount_usd, category_id, record_type }) as never;

// c1 → categoría ST, c2 → categoría C&R, c9 → desconocida
const catMap = new Map<string, string>([["c1", ST_CATEGORIES[0]], ["c2", CR_CATEGORIES[0]], ["c9", "Otra"]]);

describe("buildTechServiceData", () => {
  it("agrega ST y C&R por trimestre y acumula", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(4, 10, "c1")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "QUARTERLY");
    expect(r).toHaveLength(4);
    expect(r[0].st).toBe(100);
    expect(r[0].cr).toBe(50);
    expect(r[0].total).toBe(150);
    expect(r[0].acum).toBe(150);
    expect(r[1].st).toBe(10);
    expect(r[1].acum).toBe(160); // acumulado corriente
  });
  it("separa año A de año B", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [rec(1, 40, "c1")], catMap, "INVOICE", "ANNUAL");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
    expect(r[0].total_prev).toBe(40);
    expect(r[0].acum_prev).toBe(40);
  });
  it("ignora categorías desconocidas y otro record_type", () => {
    const a = [rec(1, 999, "c9"), rec(1, 500, "c1", "SALES_ORDER")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("MONTHLY devuelve 12 slots", () => {
    expect(buildTechServiceData([], [], catMap, "INVOICE", "MONTHLY")).toHaveLength(12);
  });
});
