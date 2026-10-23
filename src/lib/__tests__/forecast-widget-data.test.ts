import { describe, it, expect } from "vitest";
import { monthlyTotals } from "@/lib/forecast-widget-data";

const rec = (record_year: number, record_month: number, amount_usd: number, record_type = "INVOICE") =>
  ({ record_year, record_month, amount_usd, record_type, category_id: "c1" }) as never;

describe("monthlyTotals", () => {
  it("filtra por año y tipo, longitud 12", () => {
    const r = monthlyTotals([rec(2026, 1, 100), rec(2025, 1, 999), rec(2026, 1, 50, "SALES_ORDER")], 2026, "INVOICE");
    expect(r).toHaveLength(12);
    expect(r[0]).toBe(100);
    expect(r[11]).toBe(0);
  });
});

