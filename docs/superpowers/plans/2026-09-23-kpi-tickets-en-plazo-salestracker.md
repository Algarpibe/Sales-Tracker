# Tickets de Servicio Técnico en plazo (SalesTracker) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La fila "Tickets de Servicio Técnico en plazo" de la tabla de KPIs comerciales deja de estar pendiente y enseña, mes a mes, el porcentaje de episodios en «Notificación Comercial» que Comercial resolvió en menos de 12 horas laborables.

**Architecture:** Una consulta al hub lee de `desk.ticket_history` solo los cambios de fase que entran en «Notificación Comercial» o salen de ella, con el instante en milisegundos. Un módulo puro nuevo (`src/lib/kpi-tickets.ts`) los convierte en episodios, mide horas laborables con los festivos de Colombia y devuelve doce porcentajes. La tabla los pasa por `construirFila` como cualquier otra fila mensual. Sin migración.

**Tech Stack:** Next 16, @tanstack/react-query, node-postgres contra el hub, vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-kpi-tickets-en-plazo-design.md`. Este plan cubre **solo la sección 4** (Parte 2 — SalesTracker) y lo que toca a SalesTracker de las secciones 2, 5 y 6. La sección 3 (el worker de `ambientalia-desk`) es otro plan.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-tickets-en-plazo`, ya creada. No cambiar de rama, no hacer push hasta la Task 10.
- **Repo público:** ningún nombre real de cliente, persona, comercial ni número de ticket real, en código, tests, semilla, comentarios ni documentación. Los ids de ticket de los tests y de la semilla son inventados (`T-FICT-001`...). Los **nombres de fase** de Zoho Desk («Notificación Comercial», «Notificación cliente», «En espera de SKU inventario», «Por Facturar», «Notificado», «Continuación del proceso», «Notificación a Compras») sí son reales y hacen falta tal cual.
- **Commits:** convencionales, en español **sin tildes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por task.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Nada de `sed -i`:** convierte el fichero entero de CRLF a LF. Editar con la herramienta Edit o con un script de node que preserve el final de línea original.
- **Lint:** baseline de exactamente 10 warnings y 0 errores. Una constante de módulo sin usar suma un warning: por eso cada task solo añade lo que usa.
- **Vitest** corre en entorno node y no hay librería de tests de componentes: solo se prueban funciones puras. Hoy: **233 pasados + 1 saltado**.
- **Sin migración** de la base de la app. Lo que cambia es el hub falso de los E2E.
- **E2E:** hoy 49/49. Arrancar Docker Desktop antes; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; `npm run e2e:db:reset` recrea las dos bases; **esperar 60 s entre ejecuciones** (el login admite 5 intentos por minuto y el setup gasta 3).
- **Fechas de Postgres:** nunca `Date` para instantes del hub. La consulta devuelve milisegundos desde epoch como `float8` y la lógica pura lee la hora de Bogotá sumando un desfase fijo y usando los `getUTC*`, así que no depende de la zona horaria del proceso.

## Contexto verificado

- **Forma del historial en el hub real** (leída de `ambientalia-desk`, `packages/zoho-sync/src/db/schema.sql` y `packages/zoho-sync/src/db/history.ts`): `ticket_history (id text PRIMARY KEY, ticket_id text NOT NULL, event_name text, event_time timestamptz, actor_name text, actor_type text, raw jsonb, synced_at timestamptz)`. `raw` es el evento de Zoho entero; `event_name` y `event_time` son copias de `raw.eventName` y `raw.eventTime`.
- **Forma del cambio de fase** (leída de `packages/shared/src/etapasDesdeHistoria.ts`): evento `TicketUpdated` cuyo `eventInfo` es un **array** de `{ propertyName, propertyValue }`; el cambio de estado es el elemento con `propertyName = 'Status'` y `propertyValue = { previousValue, updatedValue }`. Es exactamente lo que lee la SQL de la spec.
- En producción `desk.ticket_history` tiene hoy 0 filas: hasta que se despliegue el worker, todos los meses salen `null` («—») y la fila no entra en el TOTAL (la cobertura la excluye). No aparece un 0 % falso.
- `hub_reader` lee los cinco esquemas del hub, `desk` incluido (nota de memoria del proyecto: el hub replica Books, CRM y Desk).
- `construirFila(def, periodos, meta, mensual)` en `commercial-kpi-table.tsx`: con `period: "mensual"` los `periodos` son doce, `paso = 1` y, con `mensual = null`, cada valor se pinta en su mes y su cumplimiento debajo. Es el camino que pide la spec: `construirFila(def, ticketsEnPlazoPorMes(...), meta, null)`.
- La tabla no pinta errores de consulta: todas hacen `data ?? []`. Un fallo de la consulta de tickets deja la fila en «—», igual que cualquier otra fila. Se mantiene ese comportamiento.
- `new Date()` dentro del `useMemo` de las filas ya se usa (`valorAlCierre(st, year, new Date())`) y no suma warnings de lint. `ahora` se obtiene igual: `new Date().getTime()`.
- `src/lib/__tests__/commercial-kpis.test.ts` fija **exactamente 7** KPIs automáticos; pasa a 8. No relajarlo a `toBeGreaterThan`: la cifra exacta avisa de un cambio de catálogo no querido.
- El primer test de `e2e/specs/kpis-comerciales.spec.ts` espera «Pendiente de Zoho Desk»: deja de ser cierto y hay que cambiarlo. Cambiar el catálogo ya ha roto E2E antes, por eso la Task 9 ejecuta la suite entera.
- La semilla del hub deriva los años del actual (`CURRENT_YEAR = new Date().getFullYear()`); los eventos de tickets siguen ese criterio.
- **Febrero no tiene ningún festivo nacional en Colombia** (el Jueves Santo más temprano posible es el 19 de marzo). La semilla pone sus episodios en la primera semana completa de febrero del año en curso, así que el resultado esperado (60,0 %) no cambia con el año. Comprobado para 2025-2033 contra el código de este plan.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/kpi-tickets.ts` | Crear | Constantes de fase y horario, `festivosColombia`, `horasLaborables`, `episodiosNotificacionComercial`, `contarTicketsEnPlazo`, `ticketsEnPlazoPorMes`, tipos `CambioFase` y `Episodio`. |
| `src/lib/__tests__/kpi-tickets.test.ts` | Crear | Tests de todo lo anterior. |
| `e2e/db/hub-schema.sql` | Modificar | Esquema `desk` y `desk.ticket_history`. |
| `e2e/db/seed-hub.mjs` | Modificar | Historial de tickets ficticio del año en curso. |
| `src/db/hub-kpi.ts` | Modificar | `getHubCommercialNotificationChanges`. |
| `src/actions/kpi-actions.ts` | Modificar | `getKpiTicketsChanges` con `requireApproved()`. |
| `src/lib/commercial-kpis.ts` | Modificar | `tickets_st` pasa a `auto`. |
| `src/lib/__tests__/commercial-kpis.test.ts` | Modificar | 8 automáticos y la forma de `tickets_st`. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Ya no hay pendientes; valor de febrero; nota de compañía. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Consulta `["kpi-tickets", year]`, la fila y la nota «De compañía». |

**Desviación menor de la spec:** la spec coloca `CambioFase` en `src/db/hub-kpi.ts`. Aquí vive en `src/lib/kpi-tickets.ts` y `hub-kpi.ts` lo importa como tipo, igual que ya hace con `DealMonthRow` de `@/lib/kpi-score`: así la lógica pura y el componente de cliente no importan nada de `src/db/`, que abre el pool del hub.

---

### Task 1: Festivos de Colombia

**Files:**
- Create: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

Listas oficiales verificadas a mano (Ley 51 de 1983 para los trasladables; Pascua por el algoritmo anónimo gregoriano):

- **2025** (Pascua 20 de abril): 1 ene; 6 ene (lunes); 24 mar (San José, 19 mié → lunes); 17 y 18 abr (Jueves y Viernes Santo); 1 may; 2 jun (Ascensión, +43); 23 jun (Corpus, +64); **30 jun** (Sagrado Corazón, +71, **y** San Pedro y San Pablo, 29 dom → lunes 30: dos festivos en la misma fecha); 20 jul; 7 ago; 18 ago (Asunción, 15 vie → lunes); 13 oct (12 dom → lunes); 3 nov (1 sáb → lunes); 17 nov (11 mar → lunes); 8 dic; 25 dic. **17 fechas.**
- **2026** (Pascua 5 de abril): 1 ene; 12 ene (6 mar → lunes); 23 mar (19 jue → lunes); 2 y 3 abr; 1 may; 18 may (+43); 8 jun (+64); 15 jun (+71); 29 jun (ya es lunes); 20 jul; 7 ago; 17 ago (15 sáb → lunes); 12 oct (ya es lunes); 2 nov (1 dom → lunes); 16 nov (11 mié → lunes); 8 dic; 25 dic. **18 fechas.**

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/kpi-tickets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { festivosColombia } from "@/lib/kpi-tickets";

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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL, el fichero no se puede importar (`Failed to resolve import "@/lib/kpi-tickets"` o similar). Pegar la salida.

- [ ] **Step 3: Implementar**

Crear `src/lib/kpi-tickets.ts`:

```ts
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
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 3 pasados.

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): festivos de Colombia para el plazo de tickets"
```

---

### Task 2: Horas laborables en hora de Bogotá

**Files:**
- Modify: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

Fechas de los casos, comprobadas: 21 sep 2026 es lunes, 25 sep viernes, 26 sep sábado, 9 oct viernes, 12 oct lunes festivo, 1 abr 2026 miércoles (2 y 3 abr son Jueves y Viernes Santo).

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/kpi-tickets.test.ts`, sustituir la línea de import de `@/lib/kpi-tickets` por:

```ts
import { festivosColombia, horasLaborables } from "@/lib/kpi-tickets";
```

y añadir al final del fichero:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: los 3 de festivos pasan; los 9 nuevos fallan con `horasLaborables is not a function`. Pegar la salida.

- [ ] **Step 3: Implementar**

En `src/lib/kpi-tickets.ts`, justo debajo de `const MS_DIA = 24 * MS_HORA;`, añadir:

```ts
const MS_OFFSET = OFFSET_BOGOTA_HORAS * MS_HORA;
```

Y al final del fichero:

```ts
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
```

- [ ] **Step 4: Ejecutar y verificar que pasan, también en otras zonas horarias**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 12 pasados.

Run: `TZ=Asia/Tokyo npm test -- src/lib/__tests__/kpi-tickets.test.ts` y `TZ=America/Los_Angeles npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 12 pasados en las dos. Si alguno falla solo con otra `TZ`, algo está leyendo campos locales (`getDay`, `getMonth`...) en vez de `getUTC*`: corregirlo, no el test.

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): horas laborables en hora de Bogota"
```

---

### Task 3: Episodios de «Notificación Comercial»

**Files:**
- Modify: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Sustituir el import de `@/lib/kpi-tickets` por:

```ts
import {
  FASE_NOTIFICACION_COMERCIAL,
  episodiosNotificacionComercial,
  festivosColombia,
  horasLaborables,
  type CambioFase,
} from "@/lib/kpi-tickets";
```

y añadir al final:

```ts
const NC = FASE_NOTIFICACION_COMERCIAL;
const cambio = (ticketId: string, instante: number, desde: string | null, hacia: string | null): CambioFase =>
  ({ ticketId, instante, desde, hacia });

describe("episodiosNotificacionComercial", () => {
  it("una entrada y su salida a Notificacion cliente es un episodio medible", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-1", 200, NC, "Notificación cliente"),
    ]);
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "medible" }]);
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
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "excluido" }]);
  });

  it("sin salida el episodio queda abierto", () => {
    const e = episodiosNotificacionComercial([cambio("T-FICT-1", 100, "Notificado", NC)]);
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: null, estado: "abierto" }]);
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
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "medible" }]);
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
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "medible" }]);
  });

  it("no mezcla los cambios de tickets distintos", () => {
    const e = episodiosNotificacionComercial([
      cambio("T-FICT-1", 100, "Notificado", NC),
      cambio("T-FICT-2", 150, NC, "Notificación cliente"),
      cambio("T-FICT-2", 120, "Notificado", NC),
    ]);
    expect(e).toEqual([
      { ticketId: "T-FICT-1", inicio: 100, fin: null, estado: "abierto" },
      { ticketId: "T-FICT-2", inicio: 120, fin: 150, estado: "medible" },
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 12 pasan; los 9 nuevos fallan con `episodiosNotificacionComercial is not a function`. Pegar la salida.

- [ ] **Step 3: Implementar**

Al final de `src/lib/kpi-tickets.ts`:

```ts
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
 * Cada entrada en "Notificación Comercial" abre un episodio y la primera salida lo
 * cierra. Una entrada con un episodio ya abierto no reinicia el reloj, y una salida
 * sin entrada previa (un episodio que empezó antes de la ventana consultada) se ignora.
 */
export function episodiosNotificacionComercial(cambios: CambioFase[]): Episodio[] {
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
    for (const c of ordenados) {
      if (c.desde === FASE_NOTIFICACION_COMERCIAL) {
        if (abierto === null) continue;
        const medible = c.hacia !== null && FASES_FIN_RELOJ.includes(c.hacia);
        episodios.push({ ticketId, inicio: abierto, fin: c.instante, estado: medible ? "medible" : "excluido" });
        abierto = null;
      } else if (c.hacia === FASE_NOTIFICACION_COMERCIAL && abierto === null) {
        abierto = c.instante;
      }
    }
    if (abierto !== null) episodios.push({ ticketId, inicio: abierto, fin: null, estado: "abierto" });
  }
  return episodios;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 21 pasados.

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): episodios de notificacion comercial desde los cambios de fase"
```

---

### Task 4: Porcentaje mensual en plazo

**Files:**
- Modify: `src/lib/kpi-tickets.ts`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

`contarTicketsEnPlazo` expone los contadores que pide el test de coherencia de la spec; `ticketsEnPlazoPorMes` los convierte en porcentajes y es lo que usa la tabla.

- [ ] **Step 1: Escribir los tests que fallan**

Sustituir el import de `@/lib/kpi-tickets` por:

```ts
import {
  FASE_NOTIFICACION_COMERCIAL,
  contarTicketsEnPlazo,
  episodiosNotificacionComercial,
  festivosColombia,
  horasLaborables,
  ticketsEnPlazoPorMes,
  type CambioFase,
  type Episodio,
} from "@/lib/kpi-tickets";
```

y añadir al final:

```ts
const episodio = (inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio =>
  ({ ticketId: "T-FICT-1", inicio, fin, estado });

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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 21 pasan; los 10 nuevos fallan con `ticketsEnPlazoPorMes is not a function` / `contarTicketsEnPlazo is not a function`. Pegar la salida.

- [ ] **Step 3: Implementar**

Al final de `src/lib/kpi-tickets.ts`:

```ts
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
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/kpi-tickets.test.ts`
Expected: 31 pasados.

Run: `npm test`
Expected: **264 pasados + 1 saltado** (233 + 31).

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): porcentaje mensual de tickets en plazo"
```

---

### Task 5: Historial de tickets en el hub falso

**Files:**
- Modify: `e2e/db/hub-schema.sql`
- Modify: `e2e/db/seed-hub.mjs`

Los episodios van en la primera semana completa de febrero del año en curso (`L` = primer lunes de febrero, entre el 1 y el 7; `L+7` cae como mucho el 14). Febrero no tiene festivos, así que las horas no dependen del año:

| Ticket | Qué pasa | Horas laborables | Cuenta |
|---|---|---|---|
| `T-FICT-001` | entra L 9:00, sale L 11:00 a «Notificación cliente». Además un cambio de prioridad y un cambio de fase que no toca NC, que la SQL debe descartar. | 2 | en plazo |
| `T-FICT-002` | entra L 9:00, sale L+2 9:00 a «Notificación cliente» | 18 | fuera |
| `T-FICT-003` | entra L 10:00, sale L+1 9:00 a «En espera de SKU inventario» | 8 | en plazo |
| `T-FICT-004` | entra L 9:00, sale L 12:00 a «Por Facturar» | — | excluido |
| `T-FICT-005` | entra L 9:00, sale L 10:00 a «Notificación cliente»; pasa a «Continuación del proceso»; re-entra L+3 9:00, sale L+7 9:00 | 1 y 18 | en plazo y fuera |
| `T-FICT-006` | entra el 30 dic del año anterior, sale el 15 ene | — | la entrada queda fuera de la ventana: la salida se ignora |

Febrero: 3 en plazo de 5 contables = **60,0 %**. Enero: sin episodios contables = **«—»**.

- [ ] **Step 1: La tabla del hub falso**

Al final de `e2e/db/hub-schema.sql`:

```sql
-- El hub real replica tambien Zoho Desk. Aqui solo va el historial de tickets, con
-- los tipos del esquema real (packages/zoho-sync/src/db/schema.sql de
-- ambientalia-desk) y solo las columnas que consulta src/db/hub-kpi.ts.
CREATE SCHEMA IF NOT EXISTS desk;

CREATE TABLE desk.ticket_history (
  id         text PRIMARY KEY,
  ticket_id  text NOT NULL,
  event_name text,
  event_time timestamptz,
  -- Evento de Zoho entero. Un cambio de fase es un TicketUpdated con un elemento
  -- { propertyName: 'Status', propertyValue: { previousValue, updatedValue } } en eventInfo.
  raw        jsonb
);
```

- [ ] **Step 2: Los eventos ficticios**

En `e2e/db/seed-hub.mjs`, después de la función `amountFor` y antes de `export async function seedHub`, añadir:

```js
// Fase de Zoho Desk que mide el KPI de tickets en plazo. Tiene que coincidir LETRA POR
// LETRA con FASE_NOTIFICACION_COMERCIAL de src/lib/kpi-tickets.ts: la consulta filtra
// por ella. Este fichero es .mjs y no puede importar del TypeScript, asi que el literal
// esta repetido. Los demas nombres de fase tambien son los reales de Desk; los ids de
// ticket y de evento son inventados.
const FASE_NC = "Notificación Comercial";

// Instante ISO de una hora de pared de Bogota (UTC-5 fijo, sin horario de verano).
function instanteBogota(anio, mes, dia, hora) {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5)).toISOString();
}

// Dia del mes del primer lunes de febrero. Febrero nunca tiene festivos en Colombia, asi
// que una semana laborable de febrero da las mismas horas sea cual sea el anio.
function primerLunesDeFebrero(anio) {
  const diaSemana = new Date(Date.UTC(anio, 1, 1)).getUTCDay();
  return 1 + ((8 - diaSemana) % 7);
}

/**
 * Historial de tickets inventado del anio en curso. En febrero deja cinco episodios
 * contables, tres en plazo y dos fuera (60,0 %), mas uno rechazado que no cuenta. El
 * detalle, ticket a ticket, esta en el plan
 * docs/superpowers/plans/2026-09-23-kpi-tickets-en-plazo-salestracker.md (Task 5).
 */
function eventosTicketsFicticios(anio) {
  const lunes = primerLunesDeFebrero(anio);
  const feb = (dias, hora) => instanteBogota(anio, 2, lunes + dias, hora);
  const estado = (desde, hacia) => ({
    propertyName: "Status",
    propertyValue: { previousValue: desde, updatedValue: hacia },
  });
  const filas = [
    // En plazo: 2 h. El cambio de prioridad y el paso a Por Facturar no tocan la fase
    // medida: la consulta tiene que descartarlos.
    ["T-FICT-001", feb(0, 9), [estado("Notificado", FASE_NC)]],
    ["T-FICT-001", feb(0, 11), [estado(FASE_NC, "Notificación cliente")]],
    ["T-FICT-001", feb(0, 12), [{ propertyName: "Priority", propertyValue: { previousValue: "Media", updatedValue: "Alta" } }]],
    ["T-FICT-001", feb(1, 9), [estado("Notificación cliente", "Por Facturar")]],
    // Fuera de plazo: 18 h.
    ["T-FICT-002", feb(0, 9), [estado("Notificado", FASE_NC)]],
    ["T-FICT-002", feb(2, 9), [estado(FASE_NC, "Notificación cliente")]],
    // Ruta del SKU, en plazo: 8 h.
    ["T-FICT-003", feb(0, 10), [estado("Notificado", FASE_NC)]],
    ["T-FICT-003", feb(1, 9), [estado(FASE_NC, "En espera de SKU inventario")]],
    // Rechazo: excluido, no hay cotizacion que medir.
    ["T-FICT-004", feb(0, 9), [estado("Notificado", FASE_NC)]],
    ["T-FICT-004", feb(0, 12), [estado(FASE_NC, "Por Facturar")]],
    // Re-cotizacion: dos episodios, 1 h (en plazo) y 18 h (fuera).
    ["T-FICT-005", feb(0, 9), [estado("Notificado", FASE_NC)]],
    ["T-FICT-005", feb(0, 10), [estado(FASE_NC, "Notificación cliente")]],
    ["T-FICT-005", feb(0, 11), [estado("Notificación cliente", "Continuación del proceso")]],
    ["T-FICT-005", feb(3, 9), [estado("Continuación del proceso", FASE_NC)]],
    ["T-FICT-005", feb(7, 9), [estado(FASE_NC, "Notificación cliente")]],
    // Entra el anio anterior, fuera de la ventana: su salida de enero se ignora y enero
    // queda sin dato, no a 0 %.
    ["T-FICT-006", instanteBogota(anio - 1, 12, 30, 9), [estado("Notificado", FASE_NC)]],
    ["T-FICT-006", instanteBogota(anio, 1, 15, 9), [estado(FASE_NC, "Notificación cliente")]],
  ];
  return filas.map(([ticketId, eventTime, eventInfo], i) => ({
    id: `HIST-FICT-${String(i + 1).padStart(3, "0")}`,
    ticketId,
    eventTime,
    raw: { eventName: "TicketUpdated", eventTime, eventInfo },
  }));
}
```

Dentro de `seedHub`, justo antes de `await client.query("COMMIT");`, añadir:

```js
    const eventosTickets = eventosTicketsFicticios(CURRENT_YEAR);
    for (const ev of eventosTickets) {
      await client.query(
        `INSERT INTO desk.ticket_history (id, ticket_id, event_name, event_time, raw)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [ev.id, ev.ticketId, ev.raw.eventName, ev.eventTime, JSON.stringify(ev.raw)],
      );
    }
```

y cambiar la línea del log final por:

```js
    console.log(`  hub sembrado: ${ITEMS.length} items, ${orders} pedidos, ${invoices} facturas, ${deals} tratos, ${eventosTickets.length} eventos de tickets`);
```

- [ ] **Step 3: Recrear las bases y comprobar la semilla**

Arrancar Docker Desktop si no lo está.

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina con `Listo.` y la línea `hub sembrado: ... 17 eventos de tickets`.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT ticket_id, count(*) FROM desk.ticket_history GROUP BY 1 ORDER BY 1"`
Expected: `T-FICT-001` 4, `T-FICT-002` 2, `T-FICT-003` 2, `T-FICT-004` 2, `T-FICT-005` 5, `T-FICT-006` 2. Pegar la salida.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/hub-schema.sql e2e/db/seed-hub.mjs
git commit -m "test(e2e): historial de tickets ficticio en el hub falso"
```

---

### Task 6: Consulta al hub y acción

**Files:**
- Modify: `src/db/hub-kpi.ts`
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: La consulta**

En `src/db/hub-kpi.ts`, añadir a los imports:

```ts
import { FASE_NOTIFICACION_COMERCIAL, type CambioFase } from "@/lib/kpi-tickets";
```

y al final del fichero:

```ts
// Cambios de fase que entran en "Notificación Comercial" o salen de ella, leídos del
// historial crudo de Zoho Desk que replica el worker hub-sync. Un cambio de fase es un
// TicketUpdated con un elemento Status en eventInfo. La fase es una constante del
// servidor, nunca entrada del usuario.
// La ventana llega hasta el 31 de enero del año siguiente para que un episodio que
// empieza a final de diciembre pueda cerrarse; el filtro por mes de entrada lo hace la
// lógica pura de src/lib/kpi-tickets.ts.
// El instante sale en milisegundos (float8) y no como timestamptz: node-postgres lo
// convertiría en Date y la hora dependería de la zona del proceso.
// El CASE protege el LATERAL: un eventInfo que no sea array haría fallar la consulta
// entera por un solo evento raro, en vez de ignorarlo.
export async function getHubCommercialNotificationChanges(anio: number): Promise<CambioFase[]> {
  const sql = `
    SELECT h.ticket_id AS "ticketId",
           (extract(epoch from h.event_time) * 1000)::float8 AS instante,
           s->'propertyValue'->>'previousValue' AS desde,
           s->'propertyValue'->>'updatedValue' AS hacia
    FROM desk.ticket_history h
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.raw->'eventInfo') = 'array' THEN h.raw->'eventInfo' ELSE '[]'::jsonb END
    ) s
    WHERE h.event_name = 'TicketUpdated'
      AND s->>'propertyName' = 'Status'
      AND $2::text IN (s->'propertyValue'->>'previousValue', s->'propertyValue'->>'updatedValue')
      AND h.event_time >= make_timestamptz($1::int, 1, 1, 0, 0, 0, 'America/Bogota')
      AND h.event_time <  make_timestamptz($1::int + 1, 2, 1, 0, 0, 0, 'America/Bogota')
    ORDER BY h.ticket_id, h.event_time`;
  const { rows } = await getHubPool().query(sql, [anio, FASE_NOTIFICACION_COMERCIAL]);
  return rows.map((r) => ({
    ticketId: String(r.ticketId),
    instante: Number(r.instante),
    desde: r.desde === null ? null : String(r.desde),
    hacia: r.hacia === null ? null : String(r.hacia),
  }));
}
```

- [ ] **Step 2: La acción**

En `src/actions/kpi-actions.ts`, añadir `getHubCommercialNotificationChanges` a la lista de imports de `@/db/hub-kpi`, y este import nuevo:

```ts
import type { CambioFase } from "@/lib/kpi-tickets";
```

Al final del fichero:

```ts
/** Cambios de fase de "Notificación Comercial" del año. De compañía: Desk no asigna
 *  comercial al ticket, así que no hay ámbito que filtrar. Lectura: lanza en error. */
export async function getKpiTicketsChanges(year: number): Promise<CambioFase[]> {
  await requireApproved();
  const anio = z.number().int().min(2000).max(2100).parse(year);
  return getHubCommercialNotificationChanges(anio);
}
```

- [ ] **Step 3: Verificar la consulta contra el hub falso**

Con las bases de la Task 5 sembradas:

Run: `HUB_DB_URL=postgres://postgres:postgres@127.0.0.1:55433/zoho_hub_e2e npx tsx -e "import('./src/db/hub-kpi.ts').then(async (m) => { const r = await m.getHubCommercialNotificationChanges(new Date().getFullYear()); console.log(r.length); console.log(r.map((c) => c.ticketId + ' ' + new Date(c.instante).toISOString() + ' ' + c.desde + ' -> ' + c.hacia).join('\n')); process.exit(0); })"`
Expected: **13** cambios: 2 de `T-FICT-001` (ni la prioridad ni el paso a «Por Facturar» desde «Notificación cliente»), 2 de `002`, 2 de `003`, 2 de `004`, 4 de `005` (no el paso a «Continuación del proceso») y 1 de `006` (solo la salida de enero; la entrada de diciembre queda fuera). Los `instante` son números y las horas en UTC son las de Bogotá + 5. Pegar la salida.

Si `tsx` no resuelve el alias `@/`, lanzar la misma SQL con `psql` sustituyendo `$1` por el año y `$2` por `'Notificación Comercial'`, y decirlo en el informe.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/db/hub-kpi.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): leer del hub los cambios de fase de notificacion comercial"
```

---

### Task 7: Los tests E2E, en rojo

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Ya no queda ningún KPI pendiente**

Sustituir el primer test entero (`"la tabla muestra el TOTAL con su cobertura y los KPIs pendientes con su motivo"`) por:

```ts
test("la tabla muestra el TOTAL con su cobertura y ya no queda ningun KPI pendiente", async ({ page }) => {
  const card = await abrirComercial(page);

  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();
  // La semilla pesa dos KPIs medibles al 60 y al 40.
  await expect(card.getByText(/cobertura: 100/)).toBeVisible();

  // Tickets en plazo era el ultimo KPI sin origen de datos: ahora se calcula desde el
  // historial de Zoho Desk, asi que ninguna fila dice que esta pendiente. El TOTAL
  // ya esta pintado, asi que la cuenta a cero no puede pasar por una tabla a medio cargar.
  await expect(card.getByText(/Pendiente de Zoho/)).toHaveCount(0);
});
```

- [ ] **Step 2: El valor de la fila y la nota de compañía**

Al final del fichero:

```ts
test("la fila de tickets en plazo calcula el porcentaje del mes con el historial de Desk", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await expect(fila).toBeVisible();
  await expect(fila).not.toContainText("Pendiente de Zoho Desk");

  // Febrero de la semilla (e2e/db/seed-hub.mjs): tres episodios en plazo y dos fuera,
  // mas un rechazo que no cuenta. 3 / 5 = 60 %. La semilla no pone meta a este KPI,
  // asi que la celda lleva solo el valor, sin cumplimiento debajo.
  await expect(fila.getByRole("cell").nth(CELDA_FEBRERO)).toHaveText("60.0%");
  // Enero solo tiene la salida de un episodio que entro el anio anterior: se ignora y
  // el mes queda sin dato, no a 0 %.
  await expect(fila.getByRole("cell").nth(1)).toHaveText("—");
});

test("con un comercial elegido la fila de tickets sigue siendo de compania", async ({ page }) => {
  const card = await abrirComercial(page);

  await card.getByLabel("Propietario").click();
  await page.getByRole("option", { name: SALESPEOPLE[0] }).click();

  // Desk no asigna comercial al ticket: la cifra es la misma y la fila lo dice.
  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await expect(fila).toContainText("De compañía: no se filtra por comercial.");
  await expect(fila.getByRole("cell").nth(CELDA_FEBRERO)).toHaveText("60.0%");
});
```

`CELDA_FEBRERO` (= 2) ya está definida arriba en el fichero: la primera celda es la etiqueta, así que el índice coincide con el número del mes.

- [ ] **Step 3: Ejecutar y verificar que fallan**

Comprobar que el puerto 3100 está libre y que han pasado 60 s desde la última ejecución E2E.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: fallan los tres tocados: el primero porque «Pendiente de Zoho Desk» sigue en la tabla, y los dos nuevos porque la celda de febrero enseña «—» y no existe la nota en esa fila. El resto del fichero en verde. Pegar la salida.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): la fila de tickets en plazo muestra el porcentaje de la semilla"
```

---

### Task 8: Catálogo y fila en la tabla

**Files:**
- Modify: `src/lib/__tests__/commercial-kpis.test.ts`
- Modify: `src/lib/commercial-kpis.ts`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/commercial-kpis.test.ts`, sustituir:

```ts
  it("hay exactamente 7 KPIs automaticos", () => {
    expect(COMMERCIAL_KPIS.filter((k) => k.source === "auto")).toHaveLength(7);
  });
```

por:

```ts
  it("hay exactamente 8 KPIs automaticos", () => {
    expect(COMMERCIAL_KPIS.filter((k) => k.source === "auto")).toHaveLength(8);
  });
  it("tickets en plazo es automatico y conserva clave, periodo y unidad", () => {
    // Clave, periodo y unidad no pueden cambiar: las metas ya guardadas cuelgan de ellas.
    const t = kpiDef("tickets_st");
    expect(t?.source).toBe("auto");
    expect(t?.period).toBe("mensual");
    expect(t?.unit).toBe("pct");
    expect(t?.pendingReason).toBeUndefined();
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/commercial-kpis.test.ts`
Expected: fallan los dos: sigue habiendo 7 automáticos y `tickets_st` es `pendiente`. Pegar la salida.

- [ ] **Step 3: El catálogo**

En `src/lib/commercial-kpis.ts`, la línea de `tickets_st` queda:

```ts
  { key: "tickets_st", label: "Tickets de Servicio Técnico en plazo", period: "mensual", unit: "pct", source: "auto" },
```

Run: `npm test -- src/lib/__tests__/commercial-kpis.test.ts`
Expected: todos pasan.

- [ ] **Step 4: La consulta en la tabla**

En `src/components/charts/comercial/commercial-kpi-table.tsx`:

1. Añadir `getKpiTicketsChanges,` a la lista de imports de `@/actions/kpi-actions`, en orden alfabético (después de `getKpiTargets,`).
2. Debajo del import de `@/lib/kpi-score`, añadir:

```ts
import { episodiosNotificacionComercial, ticketsEnPlazoPorMes } from "@/lib/kpi-tickets";
```

3. Debajo de `const MESES = MONTHS.length;`, añadir:

```ts
/** KPIs que no se pueden filtrar por comercial: el Servicio Técnico no lleva
 *  comercial en sus líneas, y Desk no asigna comercial al ticket. Con un comercial
 *  elegido enseñan la cifra de compañía, y la fila lo dice. */
const KPIS_DE_COMPANIA = new Set(["incremento_st", "tickets_st"]);
```

4. Justo después de la consulta `ganadosQ`, añadir:

```ts
  // Tickets en plazo: de compañía y sin conmutador OV/FAC (Desk no tiene tal cosa),
  // así que la clave solo lleva el año. keepPreviousData como las demás consultas del
  // año: cambiar de año no debe desmontar la tabla entera.
  const ticketsQ = useQuery({
    queryKey: ["kpi-tickets", year],
    queryFn: () => getKpiTicketsChanges(year),
    placeholderData: keepPreviousData,
  });
```

5. Justo después de `const ganados = useMemo(...)`, añadir:

```ts
  // Los episodios solo dependen de los cambios leídos: no se recalculan al cambiar de
  // comercial ni de OV/FAC.
  const episodiosTickets = useMemo(
    () => episodiosNotificacionComercial(ticketsQ.data ?? []),
    [ticketsQ.data]
  );
```

- [ ] **Step 5: La fila**

Dentro del `useMemo` de `filas`, justo antes de `if (def.key === "ingresos_proyectos") {`, añadir:

```ts
      if (def.key === "tickets_st") {
        // El porcentaje ya viene por mes: son los doce periodos de una fila mensual y
        // no hay serie aparte, así que construirFila lo pinta en su mes con el
        // cumplimiento debajo. `ahora` decide qué episodios abiertos ya están fuera de
        // plazo; new Date() como en el incremento de arriba.
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, new Date().getTime()), meta, null);
      }
```

Y añadir `episodiosTickets` a la lista de dependencias de ese `useMemo`:

```ts
  }, [metas, mensuales, tratos, ganados, historico, registros, categorias, ordenesProyectoAnio, episodiosTickets, recordType, year]);
```

- [ ] **Step 6: Carga, refresco y nota de compañía**

Sustituir `cargando` y `refrescando` por:

```ts
  const cargando =
    metasQ.isPending || mensualesQ.isPending || tratosQ.isPending || ganadosQ.isPending ||
    historicoQ.isPending || ventasQ.isPending || categoriasQ.isPending || proyectosQ.isPending ||
    ticketsQ.isPending;
  const refrescando =
    metasQ.isPlaceholderData || mensualesQ.isPlaceholderData || tratosQ.isPlaceholderData ||
    ganadosQ.isPlaceholderData || ticketsQ.isPlaceholderData;
```

Y en la celda de la etiqueta, sustituir:

```tsx
                            {f.def.key === "incremento_st" && (
                              <div className="text-muted-foreground">De compañía: no se filtra por comercial.</div>
                            )}
```

por:

```tsx
                            {KPIS_DE_COMPANIA.has(f.def.key) && (
                              <div className="text-muted-foreground">De compañía: no se filtra por comercial.</div>
                            )}
```

`CHART_HELP.kpisComerciales` no cambia: es una ayuda única para toda la tabla.

- [ ] **Step 7: Gates**

Run: `npm test`
Expected: **265 pasados + 1 saltado** (233 + 31 de `kpi-tickets` + 1 de `commercial-kpis`).

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`. Si aparece uno nuevo en `commercial-kpi-table.tsx` por `new Date()` dentro del `useMemo`, no ocurre hoy con `valorAlCierre`: comprobar que se copió tal cual antes de tocar nada.

- [ ] **Step 8: Ejecutar los E2E del fichero y verificar que pasan**

Esperar 60 s desde la Task 7 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde.

Si un aserto falla por cómo quedó el DOM y no por el comportamiento, ajustar el **selector**, nunca lo que comprueba, y explicarlo.

- [ ] **Step 9: Commit**

```bash
git add src/lib/commercial-kpis.ts src/lib/__tests__/commercial-kpis.test.ts "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): tickets de servicio tecnico en plazo se calcula desde Zoho Desk"
```

---

### Task 9: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios, tipos y lint**

Run: `npm test`
Expected: **265 pasados + 1 saltado**.

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 2: Suite E2E completa**

Docker Desktop arrancado. Esperar 60 s desde la última ejecución y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: **51/51** (los 49 actuales más los 2 nuevos; el primero de `kpis-comerciales` cambió, no se sumó). Cambiar el catálogo ya ha roto E2E de otros ficheros antes: si falla algo fuera de `kpis-comerciales.spec.ts`, leerlo antes de tocar nada y decir en el informe qué era.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-tickets-en-plazo` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales, clientes, cuentas y
> números de ticket son justo lo que no puede acabar en un repositorio público: meterlos dentro del
> propio comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un
> fichero fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe,
> la comprobación no está hecha: no se puede dar por buena.

---

### Task 10: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Recordar que este PR **no trae migración** y que puede desplegarse antes o después del worker de `ambientalia-desk`: sin historial en el hub todos los meses salen «—» y la fila no entra en el TOTAL. Tras el despliegue, un administrador fija en Configuración la meta real de Tickets en plazo, que sustituye al 1 % de relleno.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-tickets-en-plazo
```

PR contra `main` titulado `feat(kpis): tickets de servicio tecnico en plazo desde Zoho Desk`, explicando la regla (episodios en «Notificación Comercial», menos de 12 horas laborables de lunes a viernes 8-17 en Bogotá sin festivos, mes de entrada, abiertos fuera de plazo al pasar las 12 h) y que depende del worker de `ambientalia-desk` para tener datos. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Pulsar una cifra mensual para ver la lista de tickets, como en ventas y tratos.
- Atribuir episodios a un comercial.
- Hacer configurables el plazo o el horario: son constantes en el código.
- Rellenar `desk.ticket_transitions` en el hub.
- El worker `hub-sync` de `ambientalia-desk` (sección 3 de la spec): plan aparte.
