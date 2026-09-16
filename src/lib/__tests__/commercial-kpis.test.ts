import { describe, it, expect } from "vitest";
import { COMMERCIAL_KPIS, KPI_KEYS, kpiDef } from "@/lib/commercial-kpis";

describe("catalogo de KPIs comerciales", () => {
  it("tiene los 8 KPIs del modelo", () => {
    expect(COMMERCIAL_KPIS).toHaveLength(8);
  });
  it("las claves no se repiten", () => {
    expect(new Set(KPI_KEYS).size).toBe(KPI_KEYS.length);
  });
  it("kpiDef encuentra por clave y devuelve undefined si no existe", () => {
    expect(kpiDef("ventas_nuevos")?.label).toBe("Ventas clientes nuevos");
    expect(kpiDef("no_existe")).toBeUndefined();
  });
  it("los KPIs pendientes explican su motivo y los automaticos no", () => {
    for (const k of COMMERCIAL_KPIS) {
      if (k.source === "pendiente") expect(k.pendingReason).toBeTruthy();
      else expect(k.pendingReason).toBeUndefined();
    }
  });
  it("hay exactamente 3 KPIs automaticos", () => {
    expect(COMMERCIAL_KPIS.filter((k) => k.source === "auto")).toHaveLength(3);
  });
});
