import { describe, it, expect } from "vitest";
import {
  acumuladoServicioTecnico,
  buildTechServiceData,
  gruposServicioTecnico,
  stGrowthByQuarter,
  yoy,
  type TechServiceBucket,
} from "@/lib/tech-service";
import type { TechServiceCategory } from "@/types/database";

const rec = (record_month: number, amount_usd: number, category_id: string, record_type = "INVOICE") =>
  ({ record_month, amount_usd, category_id, record_type }) as never;

const cat = (
  id: string,
  tech_service_bucket: TechServiceBucket | null,
  is_active = true,
  name = `Categoria ${id}`
): TechServiceCategory => ({ id, name, color: "#000000", is_active, tech_service_bucket });

// c1 -> ST, c2 -> C&R, c9 -> sin clasificar (no esta en el mapa)
const grupos = new Map<string, TechServiceBucket>([["c1", "st"], ["c2", "cr"]]);

const TODO_EL_ANIO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("gruposServicioTecnico", () => {
  it("devuelve solo las categorias clasificadas, con su grupo", () => {
    const r = gruposServicioTecnico([cat("c1", "st"), cat("c2", "cr"), cat("c3", null)]);
    expect(r.size).toBe(2);
    expect(r.get("c1")).toBe("st");
    expect(r.get("c2")).toBe("cr");
    expect(r.has("c3")).toBe(false);
  });

  it("incluye las inactivas clasificadas: sus ventas historicas siguen contando", () => {
    const r = gruposServicioTecnico([cat("c4", "st", false), cat("c5", null, false)]);
    expect(r.get("c4")).toBe("st");
    expect(r.has("c5")).toBe(false);
  });

  it("clasifica por id: renombrar una categoria no la saca de su grupo", () => {
    const antes = gruposServicioTecnico([cat("c1", "st", true, "Nombre viejo")]);
    const despues = gruposServicioTecnico([cat("c1", "st", true, "Nombre nuevo")]);
    expect(despues).toEqual(antes);
  });

  it("ignora un valor de grupo desconocido", () => {
    const r = gruposServicioTecnico([{ id: "c1", tech_service_bucket: "xx" as never }]);
    expect(r.size).toBe(0);
  });
});

describe("buildTechServiceData", () => {
  it("agrega ST y C&R por trimestre y acumula", () => {
    const a = [rec(1, 100, "c1"), rec(2, 50, "c2"), rec(4, 10, "c1")];
    const r = buildTechServiceData(a, [], grupos, "INVOICE", "QUARTERLY");
    expect(r).toHaveLength(4);
    expect(r[0].st).toBe(100);
    expect(r[0].cr).toBe(50);
    expect(r[0].total).toBe(150);
    expect(r[0].acum).toBe(150);
    expect(r[1].st).toBe(10);
    expect(r[1].acum).toBe(160); // acumulado corriente
  });
  it("separa anio A de anio B", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [rec(1, 40, "c1")], grupos, "INVOICE", "ANNUAL");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
    expect(r[0].total_prev).toBe(40);
    expect(r[0].acum_prev).toBe(40);
  });
  it("ignora categorias sin clasificar y otro record_type", () => {
    const a = [rec(1, 999, "c9"), rec(1, 500, "c1", "SALES_ORDER")];
    const r = buildTechServiceData(a, [], grupos, "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("con el mapa vacio todo suma 0", () => {
    const r = buildTechServiceData([rec(1, 100, "c1")], [], new Map(), "INVOICE", "ANNUAL");
    expect(r[0].total).toBe(0);
  });
  it("MONTHLY devuelve 12 slots", () => {
    expect(buildTechServiceData([], [], grupos, "INVOICE", "MONTHLY")).toHaveLength(12);
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
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")).toEqual([20, 20, 20, 20]);
  });

  it("si el anio de referencia no tiene ventas pero el analizado si, es +100%", () => {
    // Mismo convenio que getYoY() en el Analisis de Servicio Tecnico: sin base
    // pero con ventas nuevas no es "sin datos", es un crecimiento del 100%.
    expect(stGrowthByQuarter([rec(1, 50, "c1")], [], grupos, "INVOICE")).toEqual([
      100, 100, 100, 100,
    ]);
  });

  it("sin ventas en ninguno de los dos anios no hay variacion que calcular", () => {
    expect(stGrowthByQuarter([], [], grupos, "INVOICE")).toEqual([null, null, null, null]);
  });

  it("ignora categorias que no son ni ST ni C&R", () => {
    const a = [rec(1, 1000, "c9")];
    const b = [rec(1, 100, "c1")];
    // Las mil de la categoria sin clasificar no entran: el acumulado del anio A sigue a cero.
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(-100);
  });

  it("cuenta tambien las ventas de C&R, igual que el Analisis de Servicio Tecnico", () => {
    // c1 es ST, c2 es C&R: el acumulado combina las dos, igual que buildTechServiceData.
    const a = [rec(1, 100, "c1"), rec(1, 50, "c2")];
    const b = [rec(1, 100, "c1"), rec(1, 25, "c2")];
    // 150 frente a 125 = +20 %.
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(20);
  });

  it("respeta el tipo de registro pedido", () => {
    const a = [rec(1, 200, "c1", "SALES_ORDER")];
    const b = [rec(1, 100, "c1")];
    expect(stGrowthByQuarter(a, b, grupos, "INVOICE")[0]).toBe(-100);
  });

  it("devuelve siempre cuatro trimestres", () => {
    expect(stGrowthByQuarter([], [], grupos, "INVOICE")).toHaveLength(4);
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
    const trimestres = buildTechServiceData(a, b, grupos, "INVOICE", "QUARTERLY");
    const kpi = stGrowthByQuarter(a, b, grupos, "INVOICE");
    trimestres.forEach((t, i) => {
      expect(kpi[i]).toBe(yoy(t.acum, t.acum_prev));
    });
  });
});

describe("coherencia entre el grafico y el KPI con la clasificacion guardada", () => {
  // El grafico y el KPI construyen el mapa con la misma funcion a partir de las
  // mismas categorias: con la misma clasificacion, el acumulado anual tiene que ser
  // identico, incluidas las ventas de una categoria inactiva clasificada.
  it("el acumulado anual del grafico es el mismo que suma el KPI", () => {
    const categorias = [cat("c1", "st"), cat("c2", "cr"), cat("c3", "st", false), cat("c9", null)];
    const g = gruposServicioTecnico(categorias);
    const a = [rec(1, 100, "c1"), rec(3, 40, "c2"), rec(6, 25, "c3"), rec(9, 999, "c9"), rec(12, 10, "c2")];
    const b = [rec(2, 70, "c1"), rec(7, 30, "c3"), rec(11, 500, "c9")];

    const [anual] = buildTechServiceData(a, b, g, "INVOICE", "ANNUAL");
    expect(anual.acum).toBe(acumuladoServicioTecnico(a, TODO_EL_ANIO, g, "INVOICE"));
    expect(anual.acum_prev).toBe(acumuladoServicioTecnico(b, TODO_EL_ANIO, g, "INVOICE"));
    expect(anual.acum).toBe(175);
    expect(anual.acum_prev).toBe(100);
    // Y el KPI al cierre (T4) es el yoy de ese mismo acumulado anual.
    expect(stGrowthByQuarter(a, b, g, "INVOICE")[3]).toBe(yoy(anual.acum, anual.acum_prev));
  });
});
