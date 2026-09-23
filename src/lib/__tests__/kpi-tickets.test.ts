import { describe, it, expect } from "vitest";
import {
  FASE_NOTIFICACION_COMERCIAL,
  clasificarEpisodio,
  contarTicketsEnPlazo,
  detalleTicketsMes,
  episodiosNotificacionComercial,
  festivosColombia,
  horasLaborables,
  normalizarFase,
  ticketsEnPlazoPorMes,
  type CambioFase,
  type Episodio,
} from "@/lib/kpi-tickets";

describe("festivosColombia", () => {
  it("2025 coincide con la lista oficial completa", () => {
    // San Pedro y San Pablo (29 jun, domingo) pasa al lunes 30, el mismo dia que el
    // Sagrado Corazon (Pascua 20 abr + 71): dos festivos en una fecha, 17 fechas.
    expect([...festivosColombia(2025)].sort()).toEqual([
      "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18",
      "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20",
      "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17",
      "2025-12-08", "2025-12-25",
    ]);
  });

  it("2026 coincide con la lista oficial completa", () => {
    // Pascua 5 abr. 29 jun y 12 oct caen en lunes y no se trasladan.
    expect([...festivosColombia(2026)].sort()).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
      "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
      "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02",
      "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("un festivo trasladable que ya cae en lunes se queda en su fecha", () => {
    expect(festivosColombia(2026).has("2026-10-12")).toBe(true);
    expect(festivosColombia(2026).has("2026-10-19")).toBe(false);
  });
});

/** Instante de una hora de pared de Bogota (UTC-5 fijo). Date.UTC con +5 h lo hace
 *  independiente de la zona horaria de quien ejecuta los tests. */
const bog = (anio: number, mes: number, dia: number, hora: number, minuto = 0) =>
  Date.UTC(anio, mes - 1, dia, hora + 5, minuto);

describe("horasLaborables", () => {
  it("mismo dia dentro del horario", () => {
    // Lunes 21 sep 2026.
    expect(horasLaborables(bog(2026, 9, 21, 9), bog(2026, 9, 21, 11, 30))).toBe(2.5);
  });

  it("recorta lo anterior a las 8:00 y lo posterior a las 17:00", () => {
    expect(horasLaborables(bog(2026, 9, 21, 6), bog(2026, 9, 21, 19))).toBe(9);
  });

  it("de viernes a lunes no cuenta el fin de semana", () => {
    // Viernes 25 sep 15:00 -> lunes 28 sep 10:00: 2 h + 2 h.
    expect(horasLaborables(bog(2026, 9, 25, 15), bog(2026, 9, 28, 10))).toBe(4);
  });

  it("un festivo no suma horas", () => {
    // Viernes 9 oct 16:00 -> martes 13 oct 9:00; el lunes 12 es festivo: 1 h + 1 h.
    expect(horasLaborables(bog(2026, 10, 9, 16), bog(2026, 10, 13, 9))).toBe(2);
  });

  it("jueves y viernes santo no suman horas", () => {
    // Miercoles 1 abr 16:00 -> lunes 6 abr 9:00 de 2026: 1 h + 1 h.
    expect(horasLaborables(bog(2026, 4, 1, 16), bog(2026, 4, 6, 9))).toBe(2);
  });

  it("un episodio que empieza en fin de semana arranca el lunes a las 8:00", () => {
    // Sabado 26 sep 10:00 -> lunes 28 sep 12:00.
    expect(horasLaborables(bog(2026, 9, 26, 10), bog(2026, 9, 28, 12))).toBe(4);
  });

  it("cuenta la jornada completa sin descontar el almuerzo", () => {
    expect(horasLaborables(bog(2026, 9, 21, 8), bog(2026, 9, 22, 17))).toBe(18);
  });

  it("devuelve 0 si hasta no es posterior a desde", () => {
    expect(horasLaborables(bog(2026, 9, 21, 10), bog(2026, 9, 21, 10))).toBe(0);
    expect(horasLaborables(bog(2026, 9, 21, 11), bog(2026, 9, 21, 10))).toBe(0);
  });

  it("usa la hora de Bogota aunque el dia UTC sea otro", () => {
    // Lunes 21 sep 16:00 en Bogota son las 21:00 UTC; hasta el martes 22 a las 9:00
    // de Bogota (14:00 UTC) hay 1 h + 1 h.
    expect(horasLaborables(bog(2026, 9, 21, 16), bog(2026, 9, 22, 9))).toBe(2);
  });
});

const NC = FASE_NOTIFICACION_COMERCIAL;
const cambio = (ticketId: string, instante: number, desde: string | null, hacia: string | null): CambioFase =>
  ({ ticketId, instante, desde, hacia, numero: null, cliente: null });

/** Episodio esperado de un ticket sin número ni cliente, que es lo que construye `cambio`. */
const esperado = (
  inicio: number,
  fin: number | null,
  estado: Episodio["estado"],
  faseSalida: string | null,
  ticketId = "T-FICT-1"
): Episodio => ({ ticketId, numero: null, cliente: null, inicio, fin, faseSalida, estado });

describe("normalizarFase", () => {
  it("colapsa espacios, espacios duros y extremos, y respeta tildes y mayusculas", () => {
    expect(normalizarFase("Notificación  Comercial")).toBe("Notificación Comercial");
    expect(normalizarFase(" Notificación cliente\t")).toBe("Notificación cliente");
    expect(normalizarFase("En espera de SKU inventario")).toBe("En espera de SKU inventario");
  });
  it("une la o con tilde escrita como dos caracteres", () => {
    expect(normalizarFase("Notificación Comercial")).toBe("Notificación Comercial");
  });
  it("deja pasar null", () => {
    expect(normalizarFase(null)).toBeNull();
  });
});

describe("episodiosNotificacionComercial", () => {
  it("una entrada y su salida a Notificacion cliente es un episodio medible", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
    ]);
    expect(e).toEqual([esperado(100, 200, "medible", "Notificación cliente")]);
  });

  it("la salida a En espera de SKU inventario tambien es medible", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, NC, "En espera de SKU inventario"),
    ]);
    expect(e[0].estado).toBe("medible");
  });

  it("la salida a cualquier otra fase es excluida", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, NC, "Por Facturar"),
    ]);
    expect(e).toEqual([esperado(100, 200, "excluido", "Por Facturar")]);
  });

  // En Zoho la fase se llama "Notificación  Comercial", con dos espacios: el nombre que
  // teclea una persona en el Blueprint no tiene por qué coincidir carácter a carácter
  // con el que escribimos aquí.
  it("reconoce las fases aunque Zoho las escriba con espacios de mas o espacios duros", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", "Notificación  Comercial"),
      cambio("T-FICT-1", 200, "Notificación  Comercial", "Notificación cliente "),
    ]);
    expect(e).toEqual([esperado(100, 200, "medible", "Notificación cliente")]);
  });

  // Zoho puede fechar en el mismo instante la entrada y la salida (una automatización
  // del Blueprint, o el redondeo al segundo), y el hub no garantiza en qué orden llegan.
  // Si la salida se leyera primero, la entrada abriría un episodio que nunca se cierra y
  // contaría fuera de plazo para siempre.
  it("una entrada y su salida en el mismo instante cierran el episodio aunque la salida llegue antes", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, NC, "Notificación cliente"),
      cambio("T-FICT-1", 100, "Notificado", NC),
    ]);
    expect(e).toEqual([esperado(100, 100, "medible", "Notificación cliente")]);
  });

  it("con un episodio abierto, una salida y una re-entrada en el mismo instante son dos episodios", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, "Continuación del proceso", NC),
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
    ]);
    expect(e).toEqual([
      esperado(100, 200, "medible", "Notificación cliente"),
      esperado(200, null, "abierto", null),
    ]);
  });

  it("sin salida el episodio queda abierto", () => {
    const e = episodiosNotificacionComercial([cambio("T-FICT-1", 100, "Notificado", NC)]);
    expect(e).toEqual([esperado(100, null, "abierto", null)]);
  });

  it("cada re-entrada abre un episodio nuevo", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
      cambio("T-FICT-1", 300, "Continuación del proceso", NC),
      cambio("T-FICT-1", 400, NC, "Notificación cliente"),
    ]);
    expect(e.map((x) => [x.inicio, x.fin])).toEqual([[100, 200], [300, 400]]);
  });

  it("una entrada repetida con el episodio abierto no reinicia el reloj", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 150, "Notificación a Compras", NC),
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
    ]);
    expect(e).toEqual([esperado(100, 200, "medible", "Notificación cliente")]);
  });

  it("una salida sin entrada previa se ignora", () => {
    // Episodio que entro antes de la ventana consultada: su salida llega sola.
    const e = episodiosNotificacionComercial([cambio("T-FICT-1", 100, NC, "Notificación cliente")]);
    expect(e).toEqual([]);
  });

  it("ordena por instante aunque los cambios lleguen desordenados", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
      cambio("T-FICT-1", 100, "Notificado", NC),
    ]);
    expect(e).toEqual([esperado(100, 200, "medible", "Notificación cliente")]);
  });

  // El detalle de la celda enseña el ticket y el cliente: salen del hub con cada cambio y
  // se toman del primero, porque un ticket tiene un solo número y una sola cuenta.
  it("el episodio lleva el numero y el cliente del ticket y la fase de salida normalizada", () => {
    const e = episodiosNotificacionComercial([
      { ticketId: "T-FICT-1", instante: 100, desde: "Notificado", hacia: NC, numero: 9001, cliente: "Cliente Ficticio A" },
      { ticketId: "T-FICT-1", instante: 200, desde: NC, hacia: "En espera de SKU  inventario", numero: 9001, cliente: "Cliente Ficticio A" },
    ]);
    expect(e).toEqual([
      {
        ticketId: "T-FICT-1",
        numero: 9001,
        cliente: "Cliente Ficticio A",
        inicio: 100,
        fin: 200,
        faseSalida: "En espera de SKU inventario",
        estado: "medible",
      },
    ]);
  });

  it("no mezcla los cambios de tickets distintos", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-2", 150, NC, "Notificación cliente"),
      cambio("T-FICT-2", 120, "Notificado", NC),
    ]);
    expect(e).toEqual([
      esperado(100, null, "abierto", null),
      esperado(120, 150, "medible", "Notificación cliente", "T-FICT-2"),
    ]);
  });
});

// La fase de salida no influye en la clasificación (ya la resume `estado`): se rellena
// con una coherente con el estado para que el episodio sea verosímil.
const episodio = (inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio => ({
  ticketId: "T-FICT-1",
  numero: null,
  cliente: null,
  inicio,
  fin,
  faseSalida: estado === "medible" ? "Notificación cliente" : estado === "excluido" ? "Por Facturar" : null,
  estado,
});

// Lunes 2 mar 2026 a las 9:00 en Bogota: ninguna de las fechas de estos tests es festiva.
const LUNES_MARZO = bog(2026, 3, 2, 9);
const AHORA = bog(2026, 9, 23, 12);

describe("ticketsEnPlazoPorMes", () => {
  it("un medible de menos de 12 horas laborables esta en plazo", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible")], 2026, AHORA);
    expect(v[2]).toBe(100);
  });

  it("12 horas laborables justas ya estan fuera de plazo", () => {
    // Lunes 9:00 -> martes 12:00: 8 h + 4 h. El plazo es "menos de 12".
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 3, 12), "medible")], 2026, AHORA);
    expect(v[2]).toBe(0);
  });

  it("el valor del mes es en plazo entre contables", () => {
    const v = ticketsEnPlazoPorMes(
      [
        episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
        episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "medible"),
      ],
      2026,
      AHORA
    );
    expect(v[2]).toBe(50);
  });

  it("los excluidos no cuentan y un mes sin contables vale null, no 0", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "excluido")], 2026, AHORA);
    expect(v[2]).toBeNull();
  });

  it("un abierto que ya consumio el plazo cuenta como fuera de plazo", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, null, "abierto")], 2026, AHORA);
    expect(v[2]).toBe(0);
  });

  it("un abierto que aun no consumio el plazo todavia no cuenta", () => {
    const v = ticketsEnPlazoPorMes([episodio(LUNES_MARZO, null, "abierto")], 2026, bog(2026, 3, 2, 15));
    expect(v[2]).toBeNull();
  });

  it("cuenta en el mes de entrada en hora de Bogota, no en UTC", () => {
    // Martes 31 mar 22:00 en Bogota ya es 1 de abril en UTC.
    const v = ticketsEnPlazoPorMes(
      [episodio(bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible")],
      2026,
      AHORA
    );
    expect(v[2]).toBe(100);
    expect(v[3]).toBeNull();
  });

  it("descarta los episodios de otros anios", () => {
    const v = ticketsEnPlazoPorMes([episodio(bog(2025, 12, 30, 9), bog(2025, 12, 30, 10), "medible")], 2026, AHORA);
    expect(v).toEqual(new Array(12).fill(null));
  });

  it("devuelve siempre doce valores", () => {
    expect(ticketsEnPlazoPorMes([], 2026, AHORA)).toHaveLength(12);
  });

  it("los contadores de los doce meses suman los episodios del anio que cuentan", () => {
    const episodios = [
      episodio(LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // cuenta: en plazo
      episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "medible"), // cuenta: fuera
      episodio(bog(2026, 5, 4, 9), bog(2026, 5, 4, 10), "excluido"), // no cuenta
      episodio(bog(2026, 6, 1, 9), null, "abierto"), // cuenta: fuera
      episodio(bog(2026, 9, 23, 11), null, "abierto"), // no cuenta todavia
      episodio(bog(2025, 7, 1, 9), bog(2025, 7, 1, 10), "medible"), // otro anio
    ];
    const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, 2026, AHORA);
    const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(suma(enPlazo)).toBe(1);
    expect(suma(fueraDePlazo)).toBe(2);
  });
});

describe("clasificarEpisodio", () => {
  it("un medible de menos de 12 horas laborables esta en plazo y lleva sus horas", () => {
    // Lunes 9:00 -> martes 11:30: 8 h + 3,5 h.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 3, 11, 30), "medible"), AHORA))
      .toEqual({ estado: "en_plazo", horas: 11.5 });
  });

  it("un medible de 12 horas justas esta fuera de plazo", () => {
    // Lunes 9:00 -> martes 12:00: 8 h + 4 h. El plazo es "menos de 12".
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 3, 12), "medible"), AHORA))
      .toEqual({ estado: "fuera_de_plazo", horas: 12 });
  });

  it("un abierto que a fecha de ahora llega justo a 12 horas esta fuera de plazo", () => {
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 3, 12)))
      .toEqual({ estado: "fuera_de_plazo", horas: 12 });
  });

  it("un abierto con menos de 12 horas todavia no vence y cuenta sus horas hasta ahora", () => {
    // Lunes 9:00 -> lunes 15:00.
    expect(clasificarEpisodio(episodio(LUNES_MARZO, null, "abierto"), bog(2026, 3, 2, 15)))
      .toEqual({ estado: "abierto_sin_vencer", horas: 6 });
  });

  it("un excluido no mide horas", () => {
    expect(clasificarEpisodio(episodio(LUNES_MARZO, bog(2026, 3, 4, 9), "excluido"), AHORA))
      .toEqual({ estado: "excluido", horas: 0 });
  });
});

/** Episodio de un ticket concreto, para los tests que comprueban qué filas salen. */
const ep = (ticketId: string, inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio =>
  ({ ...episodio(inicio, fin, estado), ticketId });

describe("detalleTicketsMes", () => {
  it("toma los episodios por su mes de entrada en hora de Bogota y descarta otros anios", () => {
    const episodios = [
      // Martes 31 mar 22:00 en Bogota ya es 1 de abril en UTC: es de marzo.
      ep("T-FICT-MAR", bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible"),
      ep("T-FICT-ABR", bog(2026, 4, 1, 9), bog(2026, 4, 1, 10), "medible"),
      ep("T-FICT-2025", bog(2025, 3, 10, 9), bog(2025, 3, 10, 10), "medible"),
    ];
    expect(detalleTicketsMes(episodios, 2026, 3, AHORA).cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-MAR"]);
    expect(detalleTicketsMes(episodios, 2026, 4, AHORA).cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-ABR"]);
  });

  it("cuentan: primero los fuera de plazo y despues los en plazo, de mas horas a menos", () => {
    const d = detalleTicketsMes(
      [
        ep("T-FICT-EN-1", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"), // 1 h
        ep("T-FICT-FUERA-12", LUNES_MARZO, bog(2026, 3, 3, 12), "medible"), // 12 h
        ep("T-FICT-EN-8", LUNES_MARZO, bog(2026, 3, 2, 17), "medible"), // 8 h
        ep("T-FICT-FUERA-18B", bog(2026, 3, 3, 9), bog(2026, 3, 5, 9), "medible"), // 18 h, entra el martes
        ep("T-FICT-ABIERTO", bog(2026, 3, 9, 9), null, "abierto"), // meses abierto: fuera
        ep("T-FICT-FUERA-18", LUNES_MARZO, bog(2026, 3, 4, 9), "medible"), // 18 h, entra el lunes
      ],
      2026,
      3,
      AHORA
    );
    // A igualdad de horas desempata la entrada: el orden no puede depender de cómo
    // lleguen los cambios del hub.
    expect(d.cuentan.map((f) => f.ticketId)).toEqual([
      "T-FICT-ABIERTO", "T-FICT-FUERA-18", "T-FICT-FUERA-18B", "T-FICT-FUERA-12", "T-FICT-EN-8", "T-FICT-EN-1",
    ]);
    expect([d.enPlazo, d.total]).toEqual([2, 6]);
  });

  it("no cuentan: los excluidos y los abiertos sin vencer, por orden de entrada", () => {
    const ahora = bog(2026, 3, 10, 12);
    const d = detalleTicketsMes(
      [
        ep("T-FICT-X1", bog(2026, 3, 5, 9), bog(2026, 3, 5, 10), "excluido"),
        ep("T-FICT-AB", bog(2026, 3, 10, 9), null, "abierto"), // 3 h a fecha de ahora
        ep("T-FICT-X0", bog(2026, 3, 2, 9), bog(2026, 3, 2, 10), "excluido"),
        ep("T-FICT-M", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
      ],
      2026,
      3,
      ahora
    );
    expect(d.noCuentan.map((f) => [f.ticketId, f.estado, f.horas])).toEqual([
      ["T-FICT-X0", "excluido", 0],
      ["T-FICT-X1", "excluido", 0],
      ["T-FICT-AB", "abierto_sin_vencer", 3],
    ]);
    expect(d.cuentan.map((f) => f.ticketId)).toEqual(["T-FICT-M"]);
    expect([d.enPlazo, d.total]).toEqual([1, 1]);
  });

  it("cada fila lleva el ticket, el cliente, la salida y las horas del episodio", () => {
    const e: Episodio = {
      ticketId: "T-FICT-1",
      numero: 9001,
      cliente: "Cliente Ficticio A",
      inicio: LUNES_MARZO,
      fin: bog(2026, 3, 2, 11),
      faseSalida: "Notificación cliente",
      estado: "medible",
    };
    expect(detalleTicketsMes([e], 2026, 3, AHORA)).toEqual({
      cuentan: [
        {
          ticketId: "T-FICT-1",
          numero: 9001,
          cliente: "Cliente Ficticio A",
          inicio: LUNES_MARZO,
          fin: bog(2026, 3, 2, 11),
          faseSalida: "Notificación cliente",
          horas: 2,
          estado: "en_plazo",
        },
      ],
      noCuentan: [],
      enPlazo: 1,
      total: 1,
    });
  });

  // La celda y el diálogo tienen que decir lo mismo: si esto falla, el pie del detalle
  // enseñaría un porcentaje distinto del de la celda pulsada.
  it("para cada mes, en plazo y total coinciden con los contadores de la celda", () => {
    const episodios = [
      ep("T-FICT-A", LUNES_MARZO, bog(2026, 3, 2, 10), "medible"),
      ep("T-FICT-B", LUNES_MARZO, bog(2026, 3, 4, 9), "medible"),
      ep("T-FICT-C", bog(2026, 5, 4, 9), bog(2026, 5, 4, 10), "excluido"),
      ep("T-FICT-D", bog(2026, 6, 1, 9), null, "abierto"),
      ep("T-FICT-E", bog(2026, 9, 23, 11), null, "abierto"),
      ep("T-FICT-F", bog(2026, 3, 31, 22), bog(2026, 4, 1, 9), "medible"),
      ep("T-FICT-G", bog(2025, 7, 1, 9), bog(2025, 7, 1, 10), "medible"),
    ];
    const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, 2026, AHORA);
    for (let mes = 1; mes <= 12; mes++) {
      const d = detalleTicketsMes(episodios, 2026, mes, AHORA);
      expect([d.enPlazo, d.total]).toEqual([enPlazo[mes - 1], enPlazo[mes - 1] + fueraDePlazo[mes - 1]]);
    }
  });
});
