import { describe, it, expect } from "vitest";
import { parseStoredPeriod, type Period } from "@/lib/period";

const fb: Period = { tipo: "INVOICE", year: 2026 };

describe("parseStoredPeriod", () => {
  it("JSON válido → valores", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }), fb)).toEqual({ tipo: "SALES_ORDER", year: 2024 });
  });
  it("tipo inválido → fallback.tipo", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "X", year: 2024 }), fb)).toEqual({ tipo: "INVOICE", year: 2024 });
  });
  it("year no numérico → fallback.year", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "SALES_ORDER", year: "x" }), fb)).toEqual({ tipo: "SALES_ORDER", year: 2026 });
  });
  it("null → fallback", () => {
    expect(parseStoredPeriod(null, fb)).toEqual(fb);
  });
  it("JSON corrupto → fallback sin lanzar", () => {
    expect(parseStoredPeriod("{not json", fb)).toEqual(fb);
  });
});
