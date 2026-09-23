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
