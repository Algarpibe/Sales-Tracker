import { describe, it, expect } from "vitest";
import { salesRecordSchema, categoryCreateSchema, uuidSchema } from "@/lib/validation";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("salesRecordSchema", () => {
  const base = {
    category_id: UUID,
    record_type: "INVOICE" as const,
    amount_usd: 100,
    record_month: 6,
    record_year: 2026,
  };

  it("acepta un registro válido", () => {
    expect(salesRecordSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza mes fuera de rango", () => {
    expect(salesRecordSchema.safeParse({ ...base, record_month: 13 }).success).toBe(false);
    expect(salesRecordSchema.safeParse({ ...base, record_month: 0 }).success).toBe(false);
  });

  it("rechaza monto negativo", () => {
    expect(salesRecordSchema.safeParse({ ...base, amount_usd: -1 }).success).toBe(false);
  });

  it("rechaza tipo de registro inválido", () => {
    expect(salesRecordSchema.safeParse({ ...base, record_type: "FOO" }).success).toBe(false);
  });

  it("rechaza category_id no-UUID", () => {
    expect(salesRecordSchema.safeParse({ ...base, category_id: "abc" }).success).toBe(false);
  });
});

describe("categoryCreateSchema", () => {
  it("acepta nombre válido y color hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "NH3", color: "#00ff88" }).success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    expect(categoryCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rechaza color no hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "X", color: "rojo" }).success).toBe(false);
  });
});

describe("uuidSchema", () => {
  it("valida UUID y rechaza basura", () => {
    expect(uuidSchema.safeParse(UUID).success).toBe(true);
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
