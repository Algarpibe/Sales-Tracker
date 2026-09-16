import { describe, it, expect } from "vitest";
import {
  splitNewExisting,
  periodTotals,
  attainment,
  kpiAverage,
  kpiContribution,
  scoreboard,
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
