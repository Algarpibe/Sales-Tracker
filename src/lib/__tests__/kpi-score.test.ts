import { describe, it, expect } from "vitest";
import {
  splitNewExisting,
  normalizeCustomerKey,
  splitDealsNewExisting,
  toMonthlySeries,
  periodTotals,
  attainment,
  kpiAverage,
  kpiContribution,
  scoreboard,
  esVentaDeClienteNuevo,
  esTratoDeClienteNuevo,
  monthBreakdown,
} from "@/lib/kpi-score";

const primerAnio = new Map<string, number>([
  ["Alfa", 2024],
  ["Beta", 2026],
]);

describe("splitNewExisting", () => {
  it("manda cada importe a su serie segun el primer anio del cliente", () => {
    const rows = [
      { customer: "Alfa", mes: 1, importe: 100 },
      { customer: "Beta", mes: 1, importe: 300 },
    ];
    const s = splitNewExisting(rows, primerAnio, 2026);
    expect(s.nuevos[0]).toBe(300);
    expect(s.existentes[0]).toBe(100);
  });

  it("devuelve doce meses aunque solo llegue uno", () => {
    const s = splitNewExisting([{ customer: "Alfa", mes: 3, importe: 10 }], primerAnio, 2026);
    expect(s.nuevos).toHaveLength(12);
    expect(s.existentes).toHaveLength(12);
    expect(s.existentes[2]).toBe(10);
  });

  it("suma los importes que caen en el mismo mes", () => {
    const rows = [
      { customer: "Alfa", mes: 5, importe: 10 },
      { customer: "Alfa", mes: 5, importe: 15 },
    ];
    expect(splitNewExisting(rows, primerAnio, 2026).existentes[4]).toBe(25);
  });

  it("trata como existente al cliente que no esta en el mapa", () => {
    // Si no aparece en la ventana consultada, no es su primer anio: no puede ser nuevo.
    const s = splitNewExisting([{ customer: "Gamma", mes: 1, importe: 40 }], primerAnio, 2026);
    expect(s.nuevos[0]).toBe(0);
    expect(s.existentes[0]).toBe(40);
  });

  it("ignora los meses fuera de rango", () => {
    const rows = [
      { customer: "Alfa", mes: 0, importe: 10 },
      { customer: "Alfa", mes: 13, importe: 10 },
    ];
    const s = splitNewExisting(rows, primerAnio, 2026);
    expect(s.existentes.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("periodTotals", () => {
  const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("mensual devuelve los doce meses tal cual", () => {
    expect(periodTotals(meses, "mensual")).toEqual(meses);
  });

  it("trimestral agrupa de tres en tres", () => {
    expect(periodTotals(meses, "trimestral")).toEqual([6, 15, 24, 33]);
  });

  it("semestral agrupa de seis en seis", () => {
    expect(periodTotals(meses, "semestral")).toEqual([21, 57]);
  });
});

describe("attainment", () => {
  it("es el porcentaje del valor sobre la meta", () => {
    expect(attainment(50, 200)).toBe(25);
  });

  it("no se topa: superar la meta se ve", () => {
    expect(attainment(300, 200)).toBe(150);
  });

  it("sin meta util no hay cumplimiento que calcular", () => {
    expect(attainment(50, 0)).toBeNull();
    expect(attainment(50, -1)).toBeNull();
  });
});

describe("kpiAverage", () => {
  it("promedia solo los periodos con cumplimiento", () => {
    expect(kpiAverage([100, null, 50, null])).toBe(75);
  });

  it("sin ningun periodo medible no hay promedio", () => {
    expect(kpiAverage([null, null])).toBeNull();
    expect(kpiAverage([])).toBeNull();
  });
});

describe("kpiContribution", () => {
  it("aporta la parte del peso que corresponde al cumplimiento", () => {
    expect(kpiContribution(50, 20)).toBe(10);
  });

  it("el exceso sobre la meta no aporta de mas", () => {
    // Sin tope, un KPI desbordado taparia el incumplimiento de los demas.
    expect(kpiContribution(300, 20)).toBe(20);
  });
});

describe("scoreboard", () => {
  it("renormaliza sobre los KPIs que si se pueden medir", () => {
    // 60 de peso medible con 50% de cumplimiento: el total es ese 50,
    // no el 30 que saldria de repartir sobre los 100 puntos completos.
    const r = scoreboard([
      { average: 50, weight: 60 },
      { average: null, weight: 40 },
    ]);
    expect(r.total).toBe(50);
    expect(r.coverage).toBe(60);
  });

  it("con todo medible el total es la suma de aportes", () => {
    const r = scoreboard([
      { average: 100, weight: 70 },
      { average: 50, weight: 30 },
    ]);
    expect(r.total).toBe(85);
    expect(r.coverage).toBe(100);
  });

  it("sin nada medible no hay puntuacion", () => {
    const r = scoreboard([{ average: null, weight: 100 }]);
    expect(r.total).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("un peso a cero no cuenta como cobertura", () => {
    const r = scoreboard([
      { average: 80, weight: 0 },
      { average: 40, weight: 50 },
    ]);
    expect(r.coverage).toBe(50);
    expect(r.total).toBe(40);
  });
});

describe("normalizeCustomerKey", () => {
  it("ignora mayusculas y espacios", () => {
    expect(normalizeCustomerKey("  Alfa Industrial ")).toBe(normalizeCustomerKey("ALFA INDUSTRIAL"));
  });
  it("ignora tildes", () => {
    expect(normalizeCustomerKey("Compañia Energética")).toBe(normalizeCustomerKey("Compania Energetica"));
  });
  it("ignora la puntuacion", () => {
    expect(normalizeCustomerKey("Beta, S.A.")).toBe(normalizeCustomerKey("Beta SA"));
  });
  it("no funde empresas distintas", () => {
    expect(normalizeCustomerKey("Alfa Industrial")).not.toBe(normalizeCustomerKey("Alfa Industrias"));
  });
});

describe("splitDealsNewExisting", () => {
  const primerAnioCuentas = new Map<string, number>([
    ["Alfa Industrial", 2023],
    ["Beta Minera", 2026],
  ]);

  it("la cuenta que ya compraba antes va a existentes", () => {
    const r = splitDealsNewExisting([{ account_name: "Alfa Industrial", mes: 1, tratos: 3 }], primerAnioCuentas, 2026);
    expect(r.existentes[0]).toBe(3);
    expect(r.nuevos[0]).toBe(0);
  });

  it("la cuenta cuya primera compra es el anio analizado va a nuevos", () => {
    const r = splitDealsNewExisting([{ account_name: "Beta Minera", mes: 2, tratos: 1 }], primerAnioCuentas, 2026);
    expect(r.nuevos[1]).toBe(1);
  });

  it("la cuenta que nunca compro va a nuevos", () => {
    // La mitad de las cuentas con trato no existe en Books: son prospectos.
    const r = splitDealsNewExisting([{ account_name: "Prospecto", mes: 3, tratos: 2 }], primerAnioCuentas, 2026);
    expect(r.nuevos[2]).toBe(2);
  });

  it("cruza aunque la grafia no coincida", () => {
    const r = splitDealsNewExisting([{ account_name: "ALFA INDUSTRIAL", mes: 4, tratos: 1 }], primerAnioCuentas, 2026);
    expect(r.existentes[3]).toBe(1);
  });

  it("acumula los tratos del mismo mes", () => {
    const rows = [
      { account_name: "Alfa Industrial", mes: 5, tratos: 2 },
      { account_name: "Alfa Industrial", mes: 5, tratos: 3 },
    ];
    expect(splitDealsNewExisting(rows, primerAnioCuentas, 2026).existentes[4]).toBe(5);
  });

  it("ignora los meses fuera de rango y devuelve doce posiciones", () => {
    const rows = [
      { account_name: "Alfa Industrial", mes: 0, tratos: 9 },
      { account_name: "Alfa Industrial", mes: 13, tratos: 9 },
    ];
    const r = splitDealsNewExisting(rows, primerAnioCuentas, 2026);
    expect(r.nuevos).toHaveLength(12);
    expect(r.existentes).toHaveLength(12);
    expect(r.existentes.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("toMonthlySeries", () => {
  it("coloca cada conteo en su mes", () => {
    const s = toMonthlySeries([{ mes: 1, tratos: 4 }, { mes: 12, tratos: 7 }]);
    expect(s[0]).toBe(4);
    expect(s[11]).toBe(7);
  });
  it("acumula los que caen en el mismo mes", () => {
    expect(toMonthlySeries([{ mes: 3, tratos: 2 }, { mes: 3, tratos: 5 }])[2]).toBe(7);
  });
  it("los meses sin datos quedan a cero", () => {
    expect(toMonthlySeries([{ mes: 5, tratos: 1 }])[0]).toBe(0);
  });
  it("ignora los meses fuera de rango", () => {
    const s = toMonthlySeries([{ mes: 0, tratos: 9 }, { mes: 13, tratos: 9 }]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("devuelve siempre doce posiciones", () => {
    expect(toMonthlySeries([])).toHaveLength(12);
  });
});

describe("esVentaDeClienteNuevo", () => {
  const primerAnio = new Map<string, number>([["Alfa", 2023], ["Beta", 2026]]);
  it("es nuevo quien compra por primera vez el anio analizado", () => {
    expect(esVentaDeClienteNuevo("Beta", primerAnio, 2026)).toBe(true);
  });
  it("no es nuevo quien ya compraba antes", () => {
    expect(esVentaDeClienteNuevo("Alfa", primerAnio, 2026)).toBe(false);
  });
  it("quien no esta en el mapa no es nuevo por esta via", () => {
    // Para ventas, si no hay fila de ventas tampoco hay importe que repartir.
    expect(esVentaDeClienteNuevo("Gamma", primerAnio, 2026)).toBe(false);
  });
});

describe("esTratoDeClienteNuevo", () => {
  const primerAnio = new Map<string, number>([["Alfa Industrial", 2023], ["Beta", 2026]]);
  it("no es nuevo quien ya compraba en un anio anterior", () => {
    expect(esTratoDeClienteNuevo("Alfa Industrial", primerAnio, 2026)).toBe(false);
  });
  it("es nuevo quien compro por primera vez este anio", () => {
    expect(esTratoDeClienteNuevo("Beta", primerAnio, 2026)).toBe(true);
  });
  it("es nuevo quien nunca compro", () => {
    expect(esTratoDeClienteNuevo("Prospecto", primerAnio, 2026)).toBe(true);
  });
  it("cruza aunque la grafia no coincida", () => {
    expect(esTratoDeClienteNuevo("ALFA INDUSTRIAL", primerAnio, 2026)).toBe(false);
  });
});

describe("monthBreakdown", () => {
  const filas = [
    { nombre: "Alfa", mes: 3, valor: 100, nuevo: false },
    { nombre: "Beta", mes: 3, valor: 300, nuevo: true },
    { nombre: "Alfa", mes: 3, valor: 50, nuevo: false },
    { nombre: "Alfa", mes: 4, valor: 999, nuevo: false },
  ];

  it("solo devuelve la serie pedida", () => {
    expect(monthBreakdown(filas, 3, "nuevos").map((r) => r.nombre)).toEqual(["Beta"]);
  });
  it("agrupa por nombre y suma", () => {
    const r = monthBreakdown(filas, 3, "existentes");
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ nombre: "Alfa", valor: 150 });
  });
  it("ordena de mayor a menor", () => {
    const rows = [
      { nombre: "Pequeno", mes: 1, valor: 10, nuevo: true },
      { nombre: "Grande", mes: 1, valor: 90, nuevo: true },
    ];
    expect(monthBreakdown(rows, 1, "nuevos").map((r) => r.nombre)).toEqual(["Grande", "Pequeno"]);
  });
  it("un mes sin filas devuelve la lista vacia", () => {
    expect(monthBreakdown(filas, 12, "nuevos")).toEqual([]);
  });
});

describe("el desglose cuadra con la celda", () => {
  // Es la garantia que justifica extraer los predicados: si el reparto y el
  // desglose usaran criterios distintos, el detalle mostraria otra cosa que la
  // cifra sin que nada fallase.
  const primerAnio = new Map<string, number>([["Alfa", 2023], ["Beta", 2026]]);
  const ventas = [
    { customer: "Alfa", mes: 2, importe: 100 },
    { customer: "Beta", mes: 2, importe: 300 },
    { customer: "Beta", mes: 2, importe: 50 },
  ];

  it("la suma del desglose es el valor de ese mes en la serie", () => {
    const split = splitNewExisting(ventas, primerAnio, 2026);
    const entrada = ventas.map((v) => ({
      nombre: v.customer,
      mes: v.mes,
      valor: v.importe,
      nuevo: esVentaDeClienteNuevo(v.customer, primerAnio, 2026),
    }));
    for (const serie of ["nuevos", "existentes"] as const) {
      const suma = monthBreakdown(entrada, 2, serie).reduce((s, r) => s + r.valor, 0);
      expect(suma).toBe(split[serie][1]);
    }
  });
});
