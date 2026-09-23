/**
 * KPI "Tickets de Servicio Técnico en plazo": cuánto tarda Comercial en cotizar un
 * ticket que Servicio Técnico le escala. Todo es puro y trabaja con instantes en
 * milisegundos desde epoch: la hora de Bogotá se obtiene sumando un desfase fijo y
 * leyendo los campos UTC, así el resultado no depende de la zona horaria del proceso
 * (el servidor, el navegador o el runner de CI).
 */

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

export const PLAZO_HORAS = 12;
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
}

export interface Episodio {
  ticketId: string;
  inicio: number;
  /** null si sigue abierto. */
  fin: number | null;
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
    let abierto: number | null = null;
    const procesar = (c: CambioFase) => {
      if (c.desde === FASE_NOTIFICACION_COMERCIAL) {
        if (abierto === null) return;
        const medible = c.hacia !== null && FASES_FIN_RELOJ.includes(c.hacia);
        episodios.push({ ticketId, inicio: abierto, fin: c.instante, estado: medible ? "medible" : "excluido" });
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
    if (abierto !== null) episodios.push({ ticketId, inicio: abierto, fin: null, estado: "abierto" });
  }
  return episodios;
}

export interface ConteoTickets {
  enPlazo: number[];
  fueraDePlazo: number[];
}

/**
 * Cuenta por mes de entrada (en hora de Bogotá) los episodios en plazo y fuera de
 * plazo del año. Los excluidos no cuentan, y un abierto solo cuenta, como fuera de
 * plazo, cuando ya ha consumido el plazo entero a fecha de `ahora`: antes de eso
 * todavía puede acabar en plazo.
 */
export function contarTicketsEnPlazo(episodios: Episodio[], anio: number, ahora: number): ConteoTickets {
  const enPlazo: number[] = new Array(12).fill(0);
  const fueraDePlazo: number[] = new Array(12).fill(0);
  for (const e of episodios) {
    const local = new Date(e.inicio + MS_OFFSET);
    if (local.getUTCFullYear() !== anio) continue;
    const mes = local.getUTCMonth();
    if (e.estado === "medible" && e.fin !== null) {
      if (horasLaborables(e.inicio, e.fin) < PLAZO_HORAS) enPlazo[mes]++;
      else fueraDePlazo[mes]++;
    } else if (e.estado === "abierto" && horasLaborables(e.inicio, ahora) >= PLAZO_HORAS) {
      fueraDePlazo[mes]++;
    }
  }
  return { enPlazo, fueraDePlazo };
}

/** Porcentaje en plazo de cada mes; null en un mes sin episodios contables, no 0 %:
 *  un cero diría que Comercial incumplió todo, y lo cierto es que no hubo qué medir. */
export function ticketsEnPlazoPorMes(episodios: Episodio[], anio: number, ahora: number): (number | null)[] {
  const { enPlazo, fueraDePlazo } = contarTicketsEnPlazo(episodios, anio, ahora);
  return enPlazo.map((dentro, i) => {
    const total = dentro + fueraDePlazo[i];
    return total === 0 ? null : (dentro / total) * 100;
  });
}
