import { describe, it, expect } from "vitest";
import { throwOnlyWithoutData } from "@/lib/query-errors";

describe("throwOnlyWithoutData", () => {
  it("sube el error al boundary si la consulta no tiene datos que mostrar", () => {
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: undefined } })).toBe(true);
  });

  it("un refetch fallido con datos previos no tira la tarjeta", () => {
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: [] } })).toBe(false);
    expect(throwOnlyWithoutData(new Error("x"), { state: { data: null } })).toBe(false);
  });
});
