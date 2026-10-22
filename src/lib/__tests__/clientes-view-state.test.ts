import { describe, it, expect } from "vitest";
import { parseClientesState } from "@/lib/clientes-view-state";

const valid = {
  tipo: "INVOICE" as const, desdeAnio: 2021, hastaAnio: 2026, search: "acme",
  sortKey: "total" as const, sortDir: "desc" as const, compareMode: true, compareA: 2026, compareB: 2025, onlyFav: true,
};

describe("parseClientesState", () => {
  it("estado válido → objeto", () => { expect(parseClientesState(valid)).toEqual(valid); });
  it("sortKey numérico (año) válido", () => { expect(parseClientesState({ ...valid, sortKey: 2024 })?.sortKey).toBe(2024); });
  it("tipo inválido → null", () => { expect(parseClientesState({ ...valid, tipo: "X" })).toBeNull(); });
  it("compareMode ausente (preset antiguo) → false, no null", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.compareMode;
    expect(parseClientesState(rest)?.compareMode).toBe(false);
  });
  it("falta un campo requerido → null", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.onlyFav;
    expect(parseClientesState(rest)).toBeNull();
  });
  it("null / no-objeto → null", () => {
    expect(parseClientesState(null)).toBeNull();
    expect(parseClientesState("x")).toBeNull();
  });
});
