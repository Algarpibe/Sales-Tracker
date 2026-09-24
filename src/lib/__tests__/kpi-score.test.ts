import { describe, it, expect } from "vitest";
import {
  splitNewExisting,
  normalizeCustomerKey,
  splitDealsNewExisting,
  toMonthlySeries,
  sumByMonth,
  ofYear,
  valorAlCierre,
  valorAlCierreDelAnio,
  periodTotals,
  periodosTranscurridos,
  attainment,
  attainmentTodoONada,
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

  it("trata como nuevo al cliente sin ninguna factura, aunque tenga importe este anio", () => {
    // Antes se trataba como existente por descarte, y clasificaba mal a quien nunca
    // ha comprado: una orden de venta sin ninguna factura previa (caso real detectado
    // en produccion, con nombres inventados aqui) solo puede ser una primera compra.
    const s = splitNewExisting([{ customer: "Gamma", mes: 1, importe: 40 }], primerAnio, 2026);
    expect(s.nuevos[0]).toBe(40);
    expect(s.existentes[0]).toBe(0);
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

describe("attainmentTodoONada", () => {
  it("por debajo de la meta no cumple nada, aunque el valor sea positivo", () => {
    expect(attainmentTodoONada(9.9, 10)).toBe(0);
    expect(attainmentTodoONada(5, 10)).toBe(0);
  });
  it("un valor negativo no resta: cumple 0, no un porcentaje negativo", () => {
    expect(attainmentTodoONada(-8.3, 10)).toBe(0);
  });
  it("alcanzar o superar la meta cumple el 100 %, sin pasarse", () => {
    expect(attainmentTodoONada(10, 10)).toBe(100);
    expect(attainmentTodoONada(26.4, 10)).toBe(100);
  });
  it("sin meta no hay con que comparar, igual que attainment", () => {
    expect(attainmentTodoONada(26.4, 0)).toBeNull();
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

describe("sumByMonth", () => {
  it("coloca cada importe en su mes", () => {
    const s = sumByMonth([{ mes: 1, importe: 100 }, { mes: 12, importe: 50 }]);
    expect(s[0]).toBe(100);
    expect(s[11]).toBe(50);
  });
  it("acumula los que caen en el mismo mes", () => {
    expect(sumByMonth([{ mes: 3, importe: 20 }, { mes: 3, importe: 5 }])[2]).toBe(25);
  });
  it("los meses sin datos quedan a cero", () => {
    expect(sumByMonth([{ mes: 5, importe: 1 }])[0]).toBe(0);
  });
  it("ignora los meses fuera de rango", () => {
    const s = sumByMonth([{ mes: 0, importe: 9 }, { mes: 13, importe: 9 }]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("devuelve siempre doce posiciones", () => {
    expect(sumByMonth([])).toHaveLength(12);
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
  it("es nuevo quien no aparece en el historico de facturas", () => {
    // Sin factura nunca, no puede tener un primer anio de factura. Si ademas
    // tiene importe este anio (una orden de venta sin factura, por ejemplo),
    // solo puede ser porque es la primera vez que compra.
    expect(esVentaDeClienteNuevo("Gamma", primerAnio, 2026)).toBe(true);
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

describe("ofYear", () => {
  const ordenes = [
    { id: "a", date: "2025-11-15" },
    { id: "b", date: "2026-11-15" },
    { id: "c", date: "2026-01-02" },
  ];
  it("se queda solo con las del anio pedido", () => {
    expect(ofYear(ordenes, 2026).map((o) => o.id)).toEqual(["b", "c"]);
  });
  it("no mezcla el mismo mes de otro anio", () => {
    // El fallo que motivo esta funcion: noviembre de 2025 sumaba en noviembre de 2026.
    expect(ofYear(ordenes, 2025).map((o) => o.id)).toEqual(["a"]);
  });
  it("sin ordenes devuelve la lista vacia", () => {
    expect(ofYear([], 2026)).toEqual([]);
  });
});

describe("valorAlCierre", () => {
  // Incremento acumulado por trimestre: el valor que cuenta es el del trimestre
  // en curso, no la media de los cuatro, que contaria varias veces las mismas ventas.
  const serie = [106, 67, 26.4, -8.3];
  it("en enero, febrero y marzo es el de marzo", () => {
    expect(valorAlCierre(serie, 2026, new Date(2026, 0, 10))).toBe(106);
    expect(valorAlCierre(serie, 2026, new Date(2026, 2, 31))).toBe(106);
  });
  it("en abril, mayo y junio es el de junio", () => {
    expect(valorAlCierre(serie, 2026, new Date(2026, 3, 1))).toBe(67);
  });
  it("en septiembre es el de septiembre, aunque diciembre tenga valor", () => {
    expect(valorAlCierre(serie, 2026, new Date(2026, 8, 22))).toBe(26.4);
  });
  it("en diciembre es el de diciembre", () => {
    expect(valorAlCierre(serie, 2026, new Date(2026, 11, 31))).toBe(-8.3);
  });
  it("un anio ya cerrado usa diciembre", () => {
    expect(valorAlCierre(serie, 2025, new Date(2026, 8, 22))).toBe(-8.3);
  });
  it("un anio futuro no tiene valor", () => {
    expect(valorAlCierre(serie, 2027, new Date(2026, 8, 22))).toBeNull();
  });
  it("sin dato en ese trimestre no inventa uno", () => {
    expect(valorAlCierre([10, null, 5, 5], 2026, new Date(2026, 4, 1))).toBeNull();
  });
});

describe("periodosTranscurridos", () => {
  // Las fechas se construyen en hora local, igual que las lee la funcion con getMonth():
  // es el mismo criterio que valorAlCierre.
  const cuenta = (hoy: Date, year = 2026) => [
    periodosTranscurridos("mensual", year, hoy),
    periodosTranscurridos("trimestral", year, hoy),
    periodosTranscurridos("semestral", year, hoy),
  ];

  it("un anio ya cerrado cuenta todos sus periodos", () => {
    expect(cuenta(new Date(2026, 8, 24), 2025)).toEqual([12, 4, 2]);
  });
  it("un anio futuro no cuenta ninguno", () => {
    expect(cuenta(new Date(2026, 8, 24), 2027)).toEqual([0, 0, 0]);
  });
  it("en enero cuenta el primer periodo de cada clase, que ya esta en curso", () => {
    expect(cuenta(new Date(2026, 0, 1))).toEqual([1, 1, 1]);
  });
  it("el ultimo dia de marzo sigue en el primer trimestre", () => {
    expect(cuenta(new Date(2026, 2, 31))).toEqual([3, 1, 1]);
  });
  it("el primer dia de abril ya cuenta el segundo trimestre", () => {
    expect(cuenta(new Date(2026, 3, 1))).toEqual([4, 2, 1]);
  });
  it("el ultimo dia de junio sigue en el primer semestre", () => {
    expect(cuenta(new Date(2026, 5, 30))).toEqual([6, 2, 1]);
  });
  it("el primer dia de julio ya cuenta el segundo semestre", () => {
    expect(cuenta(new Date(2026, 6, 1))).toEqual([7, 3, 2]);
  });
  it("en diciembre cuenta todo el anio, igual que uno cerrado", () => {
    expect(cuenta(new Date(2026, 11, 31))).toEqual([12, 4, 2]);
  });
});

describe("promedio a la fecha", () => {
  // Cumplimiento trimestral de un anio en curso: los dos trimestres que aun no han
  // llegado valen 0 % y hunden la media anual.
  const cumplimiento = [120, 80, 0, 0];
  const aLaFecha = (hoy: Date, year = 2026) =>
    kpiAverage(cumplimiento.slice(0, periodosTranscurridos("trimestral", year, hoy)));

  it("excluye los periodos futuros que valen 0", () => {
    expect(kpiAverage(cumplimiento)).toBe(50);
    expect(aLaFecha(new Date(2026, 5, 15))).toBe(100);
  });
  it("en un anio cerrado es igual que el anual", () => {
    expect(aLaFecha(new Date(2027, 1, 1))).toBe(kpiAverage(cumplimiento));
  });
  it("en un anio futuro no hay nada que promediar", () => {
    expect(aLaFecha(new Date(2025, 5, 15))).toBeNull();
  });
});

describe("valorAlCierreDelAnio", () => {
  // Es la cifra anual del incremento de Servicio Tecnico: la del T4, no la del
  // trimestre en curso, que es la de a la fecha.
  const serie = [106, 67, 26.4, -8.3];
  it("en el anio en curso es el de diciembre aunque estemos en septiembre", () => {
    expect(valorAlCierreDelAnio(serie, 2026, new Date(2026, 8, 24))).toBe(-8.3);
  });
  it("en un anio cerrado es el de diciembre, igual que a la fecha", () => {
    expect(valorAlCierreDelAnio(serie, 2025, new Date(2026, 8, 24))).toBe(-8.3);
    expect(valorAlCierre(serie, 2025, new Date(2026, 8, 24))).toBe(-8.3);
  });
  it("un anio futuro no tiene valor, aunque la serie traiga diciembre", () => {
    expect(valorAlCierreDelAnio(serie, 2027, new Date(2026, 8, 24))).toBeNull();
  });
});
