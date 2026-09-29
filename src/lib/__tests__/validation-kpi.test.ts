import { describe, it, expect } from "vitest";
import { kpiTargetsSchema } from "@/lib/validation";
import { KPI_FIRST_YEAR } from "@/lib/commercial-kpis";

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

  // La pantalla ya no ofrece esos anios, pero la accion es la que protege el dato:
  // sin este limite se podrian guardar metas de un anio en el que los KPIs no existian.
  it("rechaza un anio anterior al primero con KPIs", () => {
    expect(
      kpiTargetsSchema.safeParse({ year: KPI_FIRST_YEAR - 1, salesperson: null, items: dos }).success
    ).toBe(false);
  });
  it("acepta el primer anio con KPIs", () => {
    expect(
      kpiTargetsSchema.safeParse({ year: KPI_FIRST_YEAR, salesperson: null, items: dos }).success
    ).toBe(true);
  });
});

describe("kpiTargetsSchema: plazo de tickets", () => {
  // Pesos que suman 100 con tickets_st medido: solo cambia el plazo o en qué KPI va.
  const conPlazo = (plazo_horas: number | null, kpi_key = "tickets_st") => [
    { kpi_key: "ventas_nuevos", target_value: 100, weight_pct: 60, plazo_horas: null },
    { kpi_key, target_value: 80, weight_pct: 40, plazo_horas },
  ];
  const total = (items: unknown[]) => kpiTargetsSchema.safeParse({ year, salesperson: null, items }).success;
  const vendedor = (items: unknown[]) =>
    kpiTargetsSchema.safeParse({ year, salesperson: "Vendedor Ficticio", items }).success;

  it("acepta el plazo en tickets_st del total", () => {
    expect(total(conPlazo(8))).toBe(true);
  });
  it("acepta un plazo con dos decimales", () => {
    expect(total(conPlazo(4.5))).toBe(true);
    expect(total(conPlazo(12.25))).toBe(true);
  });
  it("acepta un plazo nulo", () => {
    expect(total(conPlazo(null))).toBe(true);
  });
  it("acepta plazos nulos en el ambito de un vendedor", () => {
    expect(vendedor(conPlazo(null))).toBe(true);
  });
  it("rechaza el plazo en otro KPI", () => {
    expect(total(conPlazo(8, "ventas_existentes"))).toBe(false);
  });
  // Cada comercial tiene su propio plazo, independiente del total.
  it("acepta el plazo en tickets_st del ambito de un vendedor", () => {
    expect(vendedor(conPlazo(8))).toBe(true);
  });
  it("en el ambito de un vendedor sigue rechazando el plazo en otro KPI", () => {
    expect(vendedor(conPlazo(8, "ventas_existentes"))).toBe(false);
  });
  it("rechaza un plazo de 0 o negativo", () => {
    expect(total(conPlazo(0))).toBe(false);
    expect(total(conPlazo(-4))).toBe(false);
  });
  // numeric(6,2) redondearía al guardar: lo guardado no cuadraría con lo validado.
  it("rechaza un plazo con mas de dos decimales", () => {
    expect(total(conPlazo(4.125))).toBe(false);
  });
  it("rechaza un plazo de mas de 999 horas", () => {
    expect(total(conPlazo(1000))).toBe(false);
  });
});
