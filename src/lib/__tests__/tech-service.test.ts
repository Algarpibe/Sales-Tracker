import { describe, it, expect } from "vitest";
import { buildTechServiceData, stGrowthByQuarter, yoy, ST_CATEGORIES, CR_CATEGORIES } from "@/lib/tech-service";

const rec = (record_month: number, amount_usd: number, category_id: string, record_type = "INVOICE") =>
  ({ record_month, amount_usd, category_id, record_type }) as never;

// c1 → categoría ST, c2 → categoría C&R, c9 → desconocida
const catMap = new Map<string, string>([["c1", ST_CATEGORIES[0]], ["c2", CR_CATEGORIES[0]], ["c9", "Otra"]]);

describe("buildTechServiceData", () => {
  it("agrega ST y C&R por trimestre y acumula", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(4, 10, "c1")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "QUARTERLY");
    expect(r).toHaveLength(4);
    expect(r[0].st).toBe(100);
    expect(r[0].cr).toBe(50);
    expect(r[0].total).toBe(150);
    expect(r[0].acum).toBe(150);
    expect(r[1].st).toBe(10);
    expect(r[1].acum).toBe(160); // acumulado corriente
  });
  it("separa año A de año B", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [rec(1, 40, "c1")], catMap, "INVOICE", "ANNUAL");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
    expect(r[0].total_prev).toBe(40);
    expect(r[0].acum_prev).toBe(40);
  });
  it("ignora categorías desconocidas y otro record_type", () => {
    const a = [rec(1, 999, "c9"), rec(1, 500, "c1", "SALES_ORDER")];
    const r = buildTechServiceData(a, [], catMap, "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("MONTHLY devuelve 12 slots", () => {
    expect(buildTechServiceData([], [], catMap, "INVOICE", "MONTHLY")).toHaveLength(12);
  });
});

// recordsA es el anio analizado y recordsB el de referencia, igual que en
// buildTechServiceData: la funcion no filtra por record_year, los separa el array.
describe("stGrowthByQuarter", () => {
  it("compara el acumulado de cada trimestre con el del anio anterior", () => {
    const a = [rec(1, 120, "c1")];
    const b = [rec(1, 100, "c1")];
    // Acumulado T1: 120 frente a 100 = +20 %. El acumulado se arrastra, asi que
    // los trimestres siguientes repiten mientras no entren mas ventas.
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")).toEqual([20, 20, 20, 20]);
  });

  it("si el anio de referencia no tiene ventas pero el analizado si, es +100%", () => {
    // Mismo convenio que getYoY() en el Analisis de Servicio Tecnico: sin base
    // pero con ventas nuevas no es "sin datos", es un crecimiento del 100%.
    expect(stGrowthByQuarter([rec(1, 50, "c1")], [], catMap, "INVOICE")).toEqual([
      100, 100, 100, 100,
    ]);
  });

  it("sin ventas en ninguno de los dos anios no hay variacion que calcular", () => {
    expect(stGrowthByQuarter([], [], catMap, "INVOICE")).toEqual([null, null, null, null]);
  });

  it("ignora categorias que no son ni ST ni C&R", () => {
    const a = [rec(1, 1000, "c9")];
    const b = [rec(1, 100, "c1")];
    // Las mil de la categoria desconocida no entran: el acumulado del anio A sigue a cero.
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")[0]).toBe(-100);
  });

  it("cuenta tambien las ventas de C&R, igual que el Analisis de Servicio Tecnico", () => {
    // c1 es ST, c2 es C&R: el acumulado combina las dos, igual que buildTechServiceData.
    const a = [rec(1, 100, "c1"), rec(1, 50, "c2")];
    const b = [rec(1, 100, "c1"), rec(1, 25, "c2")];
    // 150 frente a 125 = +20 %.
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")[0]).toBe(20);
  });

  it("respeta el tipo de registro pedido", () => {
    const a = [rec(1, 200, "c1", "SALES_ORDER")];
    const b = [rec(1, 100, "c1")];
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")[0]).toBe(-100);
  });

  it("devuelve siempre cuatro trimestres", () => {
    expect(stGrowthByQuarter([], [], catMap, "INVOICE")).toHaveLength(4);
  });
});

describe("yoy", () => {
  it("variacion normal", () => {
    expect(yoy(120, 100)).toBe(20);
  });
  it("sin base pero con valor actual es +100%", () => {
    expect(yoy(50, 0)).toBe(100);
  });
  it("sin base y sin valor actual no hay variacion", () => {
    expect(yoy(0, 0)).toBeNull();
  });
});

describe("stGrowthByQuarter coincide con VAR. ACUMULADA de Analisis de Servicio Tecnico", () => {
  // Es la garantia de que las dos tablas nunca puedan volver a divergir: la misma
  // funcion yoy() sobre el mismo acumulado de buildTechServiceData.
  it("el KPI trimestral es exactamente el yoy del acumulado ST+C&R", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(5, 30, "c1"), rec(8, 20, "c2")];
    const b = [rec(1, 80, "c1"), rec(4, 40, "c2")];
    const trimestres = buildTechServiceData(a, b, catMap, "INVOICE", "QUARTERLY");
    const kpi = stGrowthByQuarter(a, b, catMap, "INVOICE");
    trimestres.forEach((t, i) => {
      expect(kpi[i]).toBe(yoy(t.acum, t.acum_prev));
    });
  });
});
