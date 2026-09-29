import { describe, it, expect } from "vitest";
import type { KpiTargetRow } from "@/actions/kpi-actions";
import {
  AVISO_PLAZO_INVALIDO,
  AVISO_PLAZO_SIN_FILA,
  evaluarBorrador,
  filaDeMeta,
  parsePlazo,
  plazoInicial,
  toDraft,
  type Draft,
} from "@/lib/kpi-metas";

const meta = (kpi_key: string, plazo_horas: number | null): KpiTargetRow =>
  ({ kpi_key, target_value: 80, weight_pct: 40, plazo_horas });

describe("filaDeMeta", () => {
  it("convierte a numero los numeric que Drizzle devuelve como texto", () => {
    expect(filaDeMeta({ kpi_key: "tickets_st", target_value: "80.00", weight_pct: "40.00", plazo_horas: "4.50" }))
      .toEqual({ kpi_key: "tickets_st", target_value: 80, weight_pct: 40, plazo_horas: 4.5 });
  });

  // Number(null) es 0: sin este cuidado, un anio sin plazo guardado mediria con plazo 0
  // y todos sus tickets saldrian fuera de plazo.
  it("un plazo nulo sigue siendo nulo, no 0", () => {
    expect(
      filaDeMeta({ kpi_key: "ventas_nuevos", target_value: "1000.00", weight_pct: "60.00", plazo_horas: null }).plazo_horas
    ).toBeNull();
  });
});

describe("toDraft", () => {
  it("rellena como texto los KPIs guardados y deja vacios los demas", () => {
    const d = toDraft([{ kpi_key: "ventas_nuevos", target_value: 1000, weight_pct: 60, plazo_horas: null }]);
    expect(d.ventas_nuevos).toEqual({ target: "1000", weight: "60" });
    expect(d.tickets_st).toEqual({ target: "", weight: "" });
  });

  it("ignora claves que no estan en el catalogo", () => {
    const d = toDraft([{ kpi_key: "inventado", target_value: 1, weight_pct: 1, plazo_horas: null }]);
    expect(d).not.toHaveProperty("inventado");
  });
});

describe("plazoInicial", () => {
  it("sin plazo guardado propone el de por defecto", () => {
    expect(plazoInicial([])).toBe("12");
    expect(plazoInicial([meta("tickets_st", null)])).toBe("12");
  });

  it("con plazo guardado lo propone tal cual", () => {
    expect(plazoInicial([meta("ventas_nuevos", null), meta("tickets_st", 4.5)])).toBe("4.5");
  });
});

describe("parsePlazo", () => {
  it("acepta enteros y hasta dos decimales, con punto o con coma", () => {
    expect(parsePlazo("12")).toBe(12);
    expect(parsePlazo(" 8 ")).toBe(8);
    expect(parsePlazo("4.5")).toBe(4.5);
    expect(parsePlazo("4,5")).toBe(4.5);
    expect(parsePlazo("7,25")).toBe(7.25);
    expect(parsePlazo("999")).toBe(999);
  });

  it("rechaza vacio, texto, cero, negativos, mas de dos decimales y mas de 999", () => {
    for (const texto of ["", "  ", "abc", "0", "0.00", "-4", "4.125", "1000", "1e2", "4."]) {
      expect(parsePlazo(texto)).toBeNull();
    }
  });
});

/** Borrador con los KPIs indicados rellenos y el resto vacío, como lo deja la pantalla. */
function borrador(valores: Record<string, [string, string]>): Draft {
  const d = toDraft([]);
  for (const [clave, [target, weight]] of Object.entries(valores)) d[clave] = { target, weight };
  return d;
}

const CON_TICKETS = borrador({
  ventas_nuevos: ["1000", "50"],
  ventas_existentes: ["2000", "40"],
  tickets_st: ["80", "10"],
});
// Como la semilla de E2E: tickets sin meta ni peso.
const SIN_TICKETS = borrador({ ventas_nuevos: ["1000", "60"], ventas_existentes: ["2000", "40"] });

describe("evaluarBorrador", () => {
  it("en el total, el plazo viaja solo en la fila de tickets", () => {
    const e = evaluarBorrador(CON_TICKETS, null, "8");
    expect(e.items).toEqual([
      { kpi_key: "ventas_nuevos", target_value: 1000, weight_pct: 50, plazo_horas: null },
      { kpi_key: "ventas_existentes", target_value: 2000, weight_pct: 40, plazo_horas: null },
      { kpi_key: "tickets_st", target_value: 80, weight_pct: 10, plazo_horas: 8 },
    ]);
    expect(e.suma).toBe(100);
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
  });

  it("acepta la coma decimal en el plazo", () => {
    const tickets = evaluarBorrador(CON_TICKETS, null, "4,5").items.find((i) => i.kpi_key === "tickets_st");
    expect(tickets?.plazo_horas).toBe(4.5);
  });

  // El KPI de tickets solo se mide a nivel compañía: el servidor rechaza un plazo de vendedor.
  it("en el ambito de un vendedor no envia plazo aunque el campo tenga uno", () => {
    const e = evaluarBorrador(CON_TICKETS, "Vendedor Ficticio", "8");
    expect(e.items.every((i) => i.plazo_horas === null)).toBe(true);
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
  });

  it("un plazo que no es un numero mayor que 0 impide guardar", () => {
    for (const texto of ["", "0", "-1", "abc", "4.125"]) {
      const e = evaluarBorrador(CON_TICKETS, null, texto);
      expect(e.valido).toBe(false);
      expect(e.pesosValidos).toBe(true);
      expect(e.avisoPlazo).toBe(AVISO_PLAZO_INVALIDO);
    }
  });

  it("sin fila de tickets deja guardar con el plazo por defecto", () => {
    const e = evaluarBorrador(SIN_TICKETS, null, "12");
    expect(e.valido).toBe(true);
    expect(e.avisoPlazo).toBeNull();
    expect(e.items.map((i) => i.kpi_key)).toEqual(["ventas_nuevos", "ventas_existentes"]);
  });

  // saveKpiTargets borra la fila de un KPI sin peso: otro plazo se perdería sin avisar.
  it("sin fila de tickets no deja guardar otro plazo que el de por defecto", () => {
    const e = evaluarBorrador(SIN_TICKETS, null, "8");
    expect(e.valido).toBe(false);
    expect(e.avisoPlazo).toBe(AVISO_PLAZO_SIN_FILA);
  });

  it("unos pesos que no suman 100 impiden guardar sin culpar al plazo", () => {
    const e = evaluarBorrador(borrador({ ventas_nuevos: ["1000", "10"], ventas_existentes: ["2000", "40"] }), null, "12");
    expect(e.suma).toBe(50);
    expect(e.pesosValidos).toBe(false);
    expect(e.valido).toBe(false);
    expect(e.avisoPlazo).toBeNull();
  });

  it("un KPI con peso y sin meta impide guardar", () => {
    const e = evaluarBorrador(borrador({ ventas_nuevos: ["", "60"], ventas_existentes: ["2000", "40"] }), null, "12");
    expect(e.pesosValidos).toBe(false);
    expect(e.valido).toBe(false);
  });
});
