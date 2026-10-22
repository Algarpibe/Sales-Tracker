import { describe, it, expect } from "vitest";
import {
  HISTORY_FIRST_YEAR,
  hubYearSchema,
  hubYearRangeSchema,
  hubDateRangeSchema,
  hubOrderSearchSchema,
} from "@/lib/validation";

const year = new Date().getFullYear();

describe("hubYearSchema", () => {
  it("el primer año con historia real es 2015", () => {
    expect(HISTORY_FIRST_YEAR).toBe(2015);
  });
  it.each([2015, 2021, year, year + 1])("acepta %i", (y) => {
    expect(hubYearSchema.safeParse(y).success).toBe(true);
  });
  it.each([2014, 0, -1, year + 2, 9999, 2025.5, Number.NaN, Infinity])("rechaza %s", (y) => {
    expect(hubYearSchema.safeParse(y).success).toBe(false);
  });
  it.each(["2025", null, undefined])("rechaza lo que no es un número (%j)", (y) => {
    expect(hubYearSchema.safeParse(y).success).toBe(false);
  });
});

describe("hubYearRangeSchema", () => {
  it("acepta un rango ordenado y uno de un solo año", () => {
    expect(hubYearRangeSchema.safeParse({ desdeAnio: 2015, hastaAnio: year }).success).toBe(true);
    expect(hubYearRangeSchema.safeParse({ desdeAnio: 2024, hastaAnio: 2024 }).success).toBe(true);
  });
  it("deja pasar el resto de campos del filtro", () => {
    const r = hubYearRangeSchema.safeParse({ tipo: "INVOICE", desdeAnio: 2021, hastaAnio: 2022, includeHistory: true });
    expect(r.success).toBe(true);
  });
  it("rechaza desde > hasta", () => {
    const r = hubYearRangeSchema.safeParse({ desdeAnio: 2024, hastaAnio: 2022 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("El año inicial no puede ser posterior al final");
  });
  it("rechaza años fuera de rango en cualquiera de los extremos", () => {
    expect(hubYearRangeSchema.safeParse({ desdeAnio: 1900, hastaAnio: 2022 }).success).toBe(false);
    expect(hubYearRangeSchema.safeParse({ desdeAnio: 2021, hastaAnio: 99999 }).success).toBe(false);
  });
});

describe("hubDateRangeSchema", () => {
  it("acepta un rango de fechas ISO ordenado", () => {
    expect(hubDateRangeSchema.safeParse({ desde: "2015-01-01", hasta: `${year}-12-31` }).success).toBe(true);
    expect(hubDateRangeSchema.safeParse({ desde: "2024-02-29", hasta: "2024-02-29" }).success).toBe(true);
  });
  it.each(["2025-02-30", "2025-13-01", "25-01-01", "2025/01/01", "", "2025-01-01T00:00:00Z"])(
    "rechaza una fecha mal formada (%j)",
    (d) => {
      expect(hubDateRangeSchema.safeParse({ desde: d, hasta: "2025-12-31" }).success).toBe(false);
    }
  );
  it("rechaza fechas fuera de los años admitidos", () => {
    expect(hubDateRangeSchema.safeParse({ desde: "2014-12-31", hasta: "2025-12-31" }).success).toBe(false);
    expect(hubDateRangeSchema.safeParse({ desde: "2025-01-01", hasta: `${year + 2}-01-01` }).success).toBe(false);
  });
  it("rechaza desde > hasta", () => {
    const r = hubDateRangeSchema.safeParse({ desde: "2025-06-01", hasta: "2025-05-31" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("La fecha inicial no puede ser posterior a la final");
  });
});

describe("hubOrderSearchSchema", () => {
  it("acepta hasta 100 caracteres", () => {
    expect(hubOrderSearchSchema.safeParse("a".repeat(100)).success).toBe(true);
  });
  it("rechaza más de 100 caracteres", () => {
    expect(hubOrderSearchSchema.safeParse("a".repeat(101)).success).toBe(false);
  });
});
