import { describe, it, expect } from "vitest";
import {
  COMMERCIAL_KPIS,
  KPI_FIRST_YEAR,
  KPI_KEYS,
  WON_DEAL_STAGES,
  getKpiYearRange,
  isExcludedSalesperson,
  kpiDef,
  parseExcludedSalespeople,
} from "@/lib/commercial-kpis";

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
  it("hay exactamente 6 KPIs automaticos", () => {
    expect(COMMERCIAL_KPIS.filter((k) => k.source === "auto")).toHaveLength(6);
  });
});

describe("rango de anios para las metas de KPIs", () => {
  it("empieza en el anio actual", () => {
    expect(getKpiYearRange()[0]).toBe(new Date().getFullYear());
  });
  it("termina en el primer anio con KPIs", () => {
    const anios = getKpiYearRange();
    expect(anios[anios.length - 1]).toBe(KPI_FIRST_YEAR);
  });
  it("va en orden descendente sin saltos", () => {
    const anios = getKpiYearRange();
    for (let i = 1; i < anios.length; i++) expect(anios[i]).toBe(anios[i - 1] - 1);
  });
  it("nunca devuelve una lista vacia", () => {
    expect(getKpiYearRange().length).toBeGreaterThan(0);
  });
});

describe("comerciales excluidos del selector de propietario", () => {
  it("sin variable de entorno no excluye a nadie", () => {
    expect(parseExcludedSalespeople(undefined)).toEqual([]);
  });
  it("con la cadena vacia no excluye a nadie", () => {
    expect(parseExcludedSalespeople("")).toEqual([]);
  });
  it("separa por comas y recorta los espacios", () => {
    expect(parseExcludedSalespeople(" Ana Inventada , Bruno Ficticio ")).toEqual([
      "Ana Inventada",
      "Bruno Ficticio",
    ]);
  });
  it("descarta las entradas vacias entre comas", () => {
    expect(parseExcludedSalespeople("Ana Inventada,, ,Bruno Ficticio,")).toEqual([
      "Ana Inventada",
      "Bruno Ficticio",
    ]);
  });
  it("excluye ignorando mayusculas", () => {
    expect(isExcludedSalesperson("ANA INVENTADA", ["Ana Inventada"])).toBe(true);
  });
  it("excluye ignorando tildes, que Zoho manda con ellas o sin ellas", () => {
    expect(isExcludedSalesperson("Andres Ficticio", ["Andrés Ficticio"])).toBe(true);
    expect(isExcludedSalesperson("Andrés Ficticio", ["Andres Ficticio"])).toBe(true);
  });
  it("no excluye a quien no esta en la lista", () => {
    expect(isExcludedSalesperson("Carla Imaginaria", ["Ana Inventada"])).toBe(false);
  });
});

describe("fases ganadoras", () => {
  it("hay al menos una fase que cuenta como ganada", () => {
    expect(WON_DEAL_STAGES.length).toBeGreaterThan(0);
  });
  it("ninguna fase ganadora esta vacia", () => {
    for (const f of WON_DEAL_STAGES) expect(f.trim()).not.toBe("");
  });
});
