import { describe, it, expect } from "vitest";
import { kpiTargetsSchema } from "@/lib/validation";

const year = new Date().getFullYear();
const dos = [
  { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 60 },
  { kpi_key: "ventas_existentes", target_value: 200, weight_pct: 40 },
];

describe("kpiTargetsSchema", () => {
  it("acepta el ambito del total de compania", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items: dos }).success).toBe(true);
  });
  it("acepta el ambito de un vendedor", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: "Vendedor Ficticio", items: dos }).success).toBe(true);
  });
  it("rechaza un vendedor vacio", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: "   ", items: dos }).success).toBe(false);
  });
  it("acepta decimales que suman 100", () => {
    const items = [
      { kpi_key: "ventas_nuevos", target_value: 1, weight_pct: 33.33 },
      { kpi_key: "ventas_existentes", target_value: 1, weight_pct: 33.33 },
      { kpi_key: "incremento_st", target_value: 1, weight_pct: 33.34 },
    ];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(true);
  });
  it("rechaza pesos que no suman 100", () => {
    const items = [{ kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 99 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza pesos con mas de dos decimales", () => {
    // numeric(5,2) redondea al guardar: 33.334 + 33.333 + 33.333 suma 100 aqui,
    // pero se almacena como 99.99 y la pantalla ya no dejaria volver a guardar.
    const items = [
      { kpi_key: "ventas_nuevos", target_value: 1, weight_pct: 33.334 },
      { kpi_key: "ventas_existentes", target_value: 1, weight_pct: 33.333 },
      { kpi_key: "incremento_st", target_value: 1, weight_pct: 33.333 },
    ];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza una clave que no esta en el catalogo", () => {
    const items = [{ kpi_key: "inventado", target_value: 100, weight_pct: 100 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza metas que no son positivas", () => {
    const items = [{ kpi_key: "ventas_nuevos", target_value: 0, weight_pct: 100 }];
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success).toBe(false);
  });
  it("rechaza una lista vacia", () => {
    expect(kpiTargetsSchema.safeParse({ year, salesperson: null, items: [] }).success).toBe(false);
  });
});
