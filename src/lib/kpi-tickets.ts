/**
 * KPI "Tickets de Servicio Técnico en plazo": cuánto tarda Comercial en cotizar un
 * ticket que Servicio Técnico le escala. Todo es puro y trabaja con instantes en
 * milisegundos desde epoch: la hora de Bogotá se obtiene sumando un desfase fijo y
 * leyendo los campos UTC, así el resultado no depende de la zona horaria del proceso
 * (el servidor, el navegador o el runner de CI).
 */

import type { KpiTargetRow } from "@/actions/kpi-actions";
import { KPI_CON_PLAZO } from "@/lib/commercial-kpis";

/** Fase de Zoho Desk en la que Comercial tiene el ticket. Literal exacto de Desk.
 *  El mismo literal está repetido en e2e/db/seed-hub.mjs, que no puede importar de
 *  aquí por ser .mjs: si se cambia aquí, hay que cambiarlo allí. */
export const FASE_NOTIFICACION_COMERCIAL = "Notificación Comercial";

/**
 * Salidas que paran el reloj: Comercial cotizó al cliente, o pidió un SKU a Compras
 * (la espera posterior ya no depende de Comercial). Cualquier otra salida, como el
 * rechazo a "Por Facturar", no tiene cotización que medir y se excluye.
 */
export const FASES_FIN_RELOJ: readonly string[] = ["Notificación cliente", "En espera de SKU inventario"];

/** Plazo, en horas laborables, de un año sin plazo guardado en sus metas: el que había
 *  fijo antes de hacerlo configurable, para que esos años no cambien de cifra. */
export const PLAZO_HORAS_POR_DEFECTO = 12;
export const HORA_INICIO = 8;
export const HORA_FIN = 17;
/** Colombia no cambia de horario: el desfase es fijo todo el año. */
export const OFFSET_BOGOTA_HORAS = -5;

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
const MS_OFFSET = OFFSET_BOGOTA_HORAS * MS_HORA;

/** 'YYYY-MM-DD' de un instante leído en UTC. */
function claveDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Medianoche UTC del Domingo de Pascua (algoritmo anónimo gregoriano). */
function domingoDePascua(anio: number): number {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(anio, mes - 1, dia);
}

/** Ley 51 de 1983 (Ley Emiliani): si no cae en lunes, pasa al lunes siguiente. */
function alLunesSiguiente(ms: number): number {
  const diaSemana = new Date(ms).getUTCDay(); // 0 domingo, 1 lunes...
  return ms + ((8 - diaSemana) % 7) * MS_DIA;
}

/** Festivos nacionales de Colombia de ese año, como 'YYYY-MM-DD'. */
export function festivosColombia(anio: number): Set<string> {
  const fecha = (mes: number, dia: number) => Date.UTC(anio, mes - 1, dia);
  const pascua = domingoDePascua(anio);
  const desdePascua = (dias: number) => pascua + dias * MS_DIA;

  const fijos = [fecha(1, 1), fecha(5, 1), fecha(7, 20), fecha(8, 7), fecha(12, 8), fecha(12, 25)];
  const trasladables = [
    fecha(1, 6), fecha(3, 19), fecha(6, 29), fecha(8, 15), fecha(10, 12), fecha(11, 1), fecha(11, 11),
  ].map(alLunesSiguiente);
  // Ascensión, Corpus Christi y Sagrado Corazón ya caen en lunes al contarlos desde
  // el domingo: la ley los traslada, pero el resultado es el mismo que sumar días.
  const deSemanaSanta = [desdePascua(-3), desdePascua(-2), desdePascua(43), desdePascua(64), desdePascua(71)];

  return new Set([...fijos, ...trasladables, ...deSemanaSanta].map(claveDia));
}

// Los festivos de un año no cambian: se calculan una vez por año y proceso, porque
// horasLaborables recorre día a día y un episodio abierto puede abarcar meses.
const festivosPorAnio = new Map<number, Set<string>>();
function esFestivo(dia: number): boolean {
  const anio = new Date(dia).getUTCFullYear();
  let festivos = festivosPorAnio.get(anio);
  if (!festivos) {
    festivos = festivosColombia(anio);
    festivosPorAnio.set(anio, festivos);
  }
  return festivos.has(claveDia(dia));
}

/**
 * Horas laborables entre dos instantes: lunes a viernes de 8:00 a 17:00 en Bogotá,
 * jornada continua, sin festivos. Horas decimales; 0 si `hasta` no es posterior.
 */
export function horasLaborables(desde: number, hasta: number): number {
  if (!(hasta > desde)) return 0;
  // "Reloj de pared" de Bogotá expresado como si fuera UTC: a partir de aquí todos
  // los getUTC* devuelven la fecha y la hora locales de Bogotá.
  const inicio = desde + MS_OFFSET;
  const fin = hasta + MS_OFFSET;
  let total = 0;
  for (let dia = Math.floor(inicio / MS_DIA) * MS_DIA; dia < fin; dia += MS_DIA) {
    const diaSemana = new Date(dia).getUTCDay();
    if (diaSemana === 0 || diaSemana === 6 || esFestivo(dia)) continue;
    const abre = Math.max(inicio, dia + HORA_INICIO * MS_HORA);
    const cierra = Math.min(fin, dia + HORA_FIN * MS_HORA);
    if (cierra > abre) total += cierra - abre;
  }
  return total / MS_HORA;
}

/** Un cambio de fase de un ticket, tal y como lo lee el hub. */
export interface CambioFase {
  ticketId: string;
  /** Milisegundos desde epoch. Sin Date para no reinterpretar la zona horaria. */
  instante: number;
  desde: string | null;
  hacia: string | null;
  /** Número visible del ticket en Desk. null si el ticket todavía no está en el hub:
   *  la consulta usa LEFT JOIN para no perder el episodio por eso. */
  numero: number | null;
  /** Nombre de la cuenta del ticket. null si no tiene cuenta o no está en el hub. */
  cliente: string | null;
}

export interface Episodio {
  ticketId: string;
  numero: number | null;
  cliente: string | null;
  inicio: number;
  /** null si sigue abierto. */
  fin: number | null;
  /** Fase a la que salió, ya normalizada; null si sigue abierto. El estado ya dice si
   *  la salida es medible, pero el detalle enseña a qué fase fue. */
  faseSalida: string | null;
  /** "medible": salió a una fase de FASES_FIN_RELOJ; "excluido": salió a otra; "abierto": no ha salido. */
  estado: "medible" | "excluido" | "abierto";
}

/**
 * Nombre de fase comparable. En Zoho la fase se llama "Notificación  Comercial", con
 * dos espacios: los nombres del Blueprint los teclea una persona, así que se comparan
 * con los espacios colapsados (incluido el duro), sin espacios en los extremos y con
 * las tildes en su forma compuesta (NFC).
 */
export function normalizarFase(fase: string | null): string | null {
  if (fase === null) return null;
  return fase.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Cada entrada en "Notificación Comercial" abre un episodio y la primera salida lo
 * cierra. Una entrada con un episodio ya abierto no reinicia el reloj, y una salida
 * sin entrada previa (un episodio que empezó antes de la ventana consultada) se ignora.
 */
export function episodiosNotificacionComercial(cambiosCrudos: CambioFase[]): Episodio[] {
  const cambios = cambiosCrudos.map((c) => ({ ...c, desde: normalizarFase(c.desde), hacia: normalizarFase(c.hacia) }));
  const porTicket = new Map<string, CambioFase[]>();
  for (const c of cambios) {
    const lista = porTicket.get(c.ticketId);
    if (lista) lista.push(c);
    else porTicket.set(c.ticketId, [c]);
  }

  const episodios: Episodio[] = [];
  for (const [ticketId, lista] of porTicket) {
    const ordenados = [...lista].sort((a, b) => a.instante - b.instante);
    // Un ticket tiene un solo número y una sola cuenta: todos sus cambios traen los mismos.
    const { numero, cliente } = ordenados[0];
    let abierto: number | null = null;
    const procesar = (c: CambioFase) => {
      if (c.desde === FASE_NOTIFICACION_COMERCIAL) {
        if (abierto === null) return;
        const medible = c.hacia !== null && FASES_FIN_RELOJ.includes(c.hacia);
        episodios.push({
          ticketId,
          numero,
          cliente,
          inicio: abierto,
          fin: c.instante,
          faseSalida: c.hacia,
          estado: medible ? "medible" : "excluido",
        });
        abierto = null;
      } else if (c.hacia === FASE_NOTIFICACION_COMERCIAL && abierto === null) {
        abierto = c.instante;
      }
    };
    // Los cambios del mismo instante no traen un orden fiable. Se resuelven según el
    // estado: con un episodio abierto va primero la salida (lo cierra) y después la
    // entrada (abre otro); sin episodio, primero la entrada. Así una salida leída antes
    // que su entrada no deja un episodio abierto para siempre.
    for (let i = 0; i < ordenados.length; ) {
      let j = i;
      while (j < ordenados.length && ordenados[j].instante === ordenados[i].instante) j++;
      const salidas = ordenados.slice(i, j).filter((c) => c.desde === FASE_NOTIFICACION_COMERCIAL);
      const resto = ordenados.slice(i, j).filter((c) => c.desde !== FASE_NOTIFICACION_COMERCIAL);
      const grupo = abierto === null ? [...resto, ...salidas] : [...salidas, ...resto];
      for (const c of grupo) procesar(c);
      i = j;
    }
    if (abierto !== null) {
      episodios.push({ ticketId, numero, cliente, inicio: abierto, fin: null, faseSalida: null, estado: "abierto" });
    }
  }
  return episodios;
}

export interface ConteoTickets {
  enPlazo: number[];
  fueraDePlazo: number[];
}

/** Cómo cuenta un episodio para el porcentaje. Solo los dos primeros cuentan. */
export type EstadoPlazo = "en_plazo" | "fuera_de_plazo" | "excluido" | "abierto_sin_vencer";

export interface Clasificacion {
  estado: EstadoPlazo;
  /** Horas laborables hasta la salida o, si sigue abierto, hasta `ahora`. 0 en un excluido. */
  horas: number;
}

/**
 * Única regla de plazo del KPI (spec base, §2): de aquí salen la cifra de la celda y
 * el detalle, así que no pueden discrepar. Un medible se mide hasta su salida; un
 * abierto, hasta `ahora`, y solo cuenta (fuera de plazo) cuando ya consumió el plazo
 * entero, porque antes todavía puede acabar en plazo. Cualquier otro caso se trata como
 * excluido, igual que hacía el contador antes de apoyarse en esta función.
 * `plazoHoras` es obligatorio a propósito: ningún consumidor puede quedarse con el de
 * por defecto sin darse cuenta.
 */
export function clasificarEpisodio(e: Episodio, ahora: number, plazoHoras: number): Clasificacion {
  if (e.estado === "medible" && e.fin !== null) {
    const horas = horasLaborables(e.inicio, e.fin);
    return { estado: horas < plazoHoras ? "en_plazo" : "fuera_de_plazo", horas };
  }
  if (e.estado === "abierto") {
    const horas = horasLaborables(e.inicio, ahora);
    return { estado: horas >= plazoHoras ? "fuera_de_plazo" : "abierto_sin_vencer", horas };
  }
  return { estado: "excluido", horas: 0 };
}

/**
 * Plazo del año a partir de las metas del TOTAL de la compañía: el KPI de tickets solo
 * se mide a ese nivel, así que las metas de un vendedor no traen plazo. Sin fila de
 * tickets o con el plazo nulo vale el de por defecto.
 */
export function plazoTicketsDelAnio(metasTotal: KpiTargetRow[]): number {
  return metasTotal.find((m) => m.kpi_key === KPI_CON_PLAZO)?.plazo_horas ?? PLAZO_HORAS_POR_DEFECTO;
}

/** Mes de entrada (0-11) en hora de Bogotá, o null si el episodio entró otro año. */
function mesDeEntrada(e: Episodio, anio: number): number | null {
  const local = new Date(e.inicio + MS_OFFSET);
  return local.getUTCFullYear() === anio ? local.getUTCMonth() : null;
}

/**
 * Cuenta por mes de entrada (en hora de Bogotá) los episodios en plazo y fuera de
 * plazo del año. Los excluidos no cuentan, y un abierto solo cuenta, como fuera de
 * plazo, cuando ya ha consumido el plazo entero a fecha de `ahora`: antes de eso
 * todavía puede acabar en plazo.
 */
export function contarTicketsEnPlazo(
  episodios: Episodio[],
  anio: number,
  ahora: number,
  plazoHoras: number
): ConteoTickets {
  const enPlazo: number[] = new Array(12).fill(0);
  const fueraDePlazo: number[] = new Array(12).fill(0);
  for (const e of episodios) {
    const mes = mesDeEntrada(e, anio);
    if (mes === null) continue;
    const { estado } = clasificarEpisodio(e, ahora, plazoHoras);
    if (estado === "en_plazo") enPlazo[mes]++;
    else if (estado === "fuera_de_plazo") fueraDePlazo[mes]++;
  }
  return { enPlazo, fueraDePlazo };
}

/** Porcentaje en plazo de cada mes; null en un mes sin episodios contables, no 0 %:
 *  un cero diría que Comercial incumplió todo, y lo cierto es que no hubo qué medir. */
export function ticketsEnPlazoPorMes(
  episodios: Episodio[],
  anio: number,
  ahora: number,
  plazoHoras: number
): (number | null)[] {
  const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, anio, ahora, plazoHoras);
  return enPlazo.map((dentro, i) => {
    const total = dentro + fueraDePlazo[i];
    return total === 0 ? null : (dentro / total) * 100;
  });
}

/** Una fila del detalle de una celda: el episodio con su clasificación ya resuelta. */
export interface FilaDetalleTicket {
  ticketId: string;
  numero: number | null;
  cliente: string | null;
  inicio: number;
  fin: number | null;
  faseSalida: string | null;
  horas: number;
  estado: EstadoPlazo;
}

export interface DetalleTicketsMes {
  /** En plazo y fuera de plazo: los que forman el porcentaje. */
  cuentan: FilaDetalleTicket[];
  /** Excluidos y abiertos sin vencer: se enseñan aparte para explicar por qué no cuentan. */
  noCuentan: FilaDetalleTicket[];
  enPlazo: number;
  total: number;
}

/**
 * Episodios que entraron en `mes` (1-12, hora de Bogotá) de `anio`, clasificados con
 * la misma función que usa la celda. `cuentan` va primero con los fuera de plazo, que
 * son los que piden explicación, y dentro de cada grupo de más horas a menos; a
 * igualdad de horas, por entrada y por ticket, para que el orden sea siempre el mismo.
 */
export function detalleTicketsMes(
  episodios: Episodio[],
  anio: number,
  mes: number,
  ahora: number,
  plazoHoras: number
): DetalleTicketsMes {
  const cuentan: FilaDetalleTicket[] = [];
  const noCuentan: FilaDetalleTicket[] = [];
  for (const e of episodios) {
    if (mesDeEntrada(e, anio) !== mes - 1) continue;
    const { estado, horas } = clasificarEpisodio(e, ahora, plazoHoras);
    const fila: FilaDetalleTicket = {
      ticketId: e.ticketId,
      numero: e.numero,
      cliente: e.cliente,
      inicio: e.inicio,
      fin: e.fin,
      faseSalida: e.faseSalida,
      horas,
      estado,
    };
    if (estado === "en_plazo" || estado === "fuera_de_plazo") cuentan.push(fila);
    else noCuentan.push(fila);
  }
  const porEntrada = (a: FilaDetalleTicket, b: FilaDetalleTicket) =>
    a.inicio - b.inicio || a.ticketId.localeCompare(b.ticketId);
  const grupo = (f: FilaDetalleTicket) => (f.estado === "fuera_de_plazo" ? 0 : 1);
  cuentan.sort((a, b) => grupo(a) - grupo(b) || b.horas - a.horas || porEntrada(a, b));
  noCuentan.sort(porEntrada);
  return {
    cuentan,
    noCuentan,
    enPlazo: cuentan.filter((f) => f.estado === "en_plazo").length,
    total: cuentan.length,
  };
}

/** Plazo para leerlo en español: coma decimal y sin ceros de relleno ("12", "4,5"). */
export function textoPlazo(horas: number): string {
  return String(horas).replace(".", ",");
}

// Se crea una vez: construir un DateTimeFormat es caro y el diálogo formatea dos
// instantes por fila. timeZone fija Bogotá, así que no depende de la zona del proceso;
// hourCycle h23 evita "24:00" a medianoche en algunos motores.
const FORMATO_BOGOTA = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * "dd/MM HH:mm" en hora de Bogotá. Se monta con formatToParts y no con format(): el
 * separador entre fecha y hora de es-CO (coma, espacio duro...) cambia entre versiones
 * de ICU, y el detalle tiene que verse igual en el servidor, el navegador y el CI.
 * padStart es necesario porque, sin "year" en las opciones, algunas versiones de ICU
 * dejan "day"/"month" sin ceros para es-CO (p. ej. "5/1" en vez de "05/01") aunque
 * "2-digit" los pida.
 */
export function formatoInstanteBogota(ms: number): string {
  const p = Object.fromEntries(FORMATO_BOGOTA.formatToParts(ms).map((x) => [x.type, x.value]));
  const dosDigitos = (v: string) => v.padStart(2, "0");
  return `${dosDigitos(p.day)}/${dosDigitos(p.month)} ${dosDigitos(p.hour)}:${dosDigitos(p.minute)}`;
}
