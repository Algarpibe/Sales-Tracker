# Tickets de Servicio Técnico en plazo — Diseño

**Goal:** La fila "Tickets de Servicio Técnico en plazo" de la tabla de KPIs comerciales deja de estar pendiente. Mide, mes a mes, qué porcentaje de las veces que Servicio Técnico escala un ticket a Comercial, Comercial lo cotiza en menos de 12 horas laborables.

**Arquitectura:** Dos partes en dos repositorios. (1) El worker `hub-sync` de `ambientalia-desk` rellena `desk.ticket_history` en `zoho-hub` con el historial de Zoho Desk, que hoy está vacío. (2) SalesTracker lee de ahí solo los cambios de fase relevantes y calcula el KPI con funciones puras: episodios, horas laborables con festivos de Colombia y porcentaje por mes. La regla de negocio vive entera en SalesTracker; el worker solo copia el historial tal cual.

**Tech:** SalesTracker: Next 16, @tanstack/react-query, node-postgres contra el hub, vitest, Playwright. `ambientalia-desk`: Node/TypeScript, `pg` sin ORM, vitest con pg-mem.

---

## 1. Contexto verificado

- **El historial de fases no está en el hub.** `desk.ticket_history` y `desk.ticket_transitions` existen en `zoho-hub` pero tienen 0 filas (consultado en producción el 2026-09-23). `desk.tickets` solo guarda la fase **actual** de cada ticket, y sus campos `fecha_*` son `date`, sin hora: no sirven para medir horas.
- **Quién escribe el historial hoy.** `ambientalia-desk` ya sabe traerlo: `traerHistoria(id)` en `packages/zoho-sync/src/sync.ts` pide `GET /tickets/{id}/History` paginado y lo guarda con `upsertHistoryEvent` (`packages/zoho-sync/src/db/history.ts`), idempotente por hash (`ON CONFLICT (id) DO NOTHING`). Pero solo lo invoca la **app**, que escribe en `desk-db`, no en `zoho-hub`. El worker `hub-sync` (`apps/hub-sync/src/hubSync.ts`) nunca lo llama.
- **Todos los tickets del hub vienen de Zoho.** Los 759 tickets tienen `managed_by_app = false` y `source = 'zoho'` (2021-09 a 2026-09). Ninguno se mueve desde la app, así que el historial de Zoho es completo para todos.
- **Forma del cambio de fase.** En el historial de Zoho un cambio de fase es un evento `TicketUpdated` cuyo `eventInfo` contiene una propiedad `Status` con `{ previousValue, updatedValue }`, y `eventTime` con la hora exacta. Es la misma lectura que ya hace `packages/shared/src/etapasDesdeHistoria.ts`.
- **Blueprint** (`packages/shared/src/transitions.ts`):
  - Entradas en «Notificación Comercial»: `escalado_a_comercial` (desde «Notificado»), `rechazo_garantia` (desde «Notificación a Compras») y `notif_recotizacion` (desde «Continuación del proceso»).
  - Salidas: `notif_cliente_comercial` → «Notificación cliente», `solicitud_sku` → «En espera de SKU inventario» y `rechazo_comercial` → «Por Facturar».
- La fase «Notificación Comercial» existe en Desk aunque hoy ningún ticket esté en ella, y por eso no aparece en `SELECT DISTINCT status FROM desk.tickets`.
- En la tabla de KPIs, `tickets_st` está en el catálogo (`src/lib/commercial-kpis.ts`) con `source: "pendiente"`, `period: "mensual"` y `unit: "pct"`. Su meta actual del 1 % es un valor de relleno.

## 2. Reglas de negocio (acordadas con el usuario)

1. **Episodio.** Cada **entrada** de un ticket en «Notificación Comercial» abre un episodio propio, con su reloj y su mes. Una re-cotización o un rechazo de garantía que devuelve el ticket a la fase abre otro.
2. **Fin del reloj.** La **primera salida** de la fase cierra el episodio:
   - hacia «Notificación cliente»: medible (Comercial cotizó);
   - hacia «En espera de SKU inventario»: medible. El reloj se para al solicitar el SKU, porque la espera posterior depende de Compras, no de Comercial;
   - hacia cualquier otra fase (el Rechazo a «Por Facturar» u otra): **excluido**, no hay cotización que medir.
3. **Plazo.** Menos de **12 horas laborables**.
4. **Horario laborable.** Lunes a viernes de 8:00 a 17:00, hora de Bogotá (UTC−5, sin cambio de horario), jornada continua sin descontar el almuerzo. Los **festivos de Colombia no suman horas**.
5. **Mes.** Cada episodio cuenta en el mes en que **entra** en «Notificación Comercial», en hora de Bogotá.
6. **Abiertos.** Un episodio sin salida que ya acumula 12 horas laborables o más cuenta como **fuera de plazo** en su mes. Si acumula menos, todavía no cuenta.
7. **Valor del mes.** `en plazo / (en plazo + fuera de plazo) × 100`. Un mes sin episodios contables vale `null` («—»), no 0 %.
8. **Ámbito.** Solo de compañía. Con un comercial seleccionado, la fila enseña la misma cifra con la nota «De compañía: no se filtra por comercial», igual que el Incremento de Servicio Técnico. No sigue el conmutador OV/FAC.

## 3. Parte 1 — `ambientalia-desk`: el worker rellena el historial

### 3.1 Esquema

En `packages/zoho-sync/src/db/schema.sql`, idempotente como el resto:

```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS history_synced_at timestamptz;
```

Guarda el `modified_time` del ticket en el momento en que se trajo su historia. Se aplica en `zoho-hub` y en `desk-db` porque las dos bases usan el mismo `migrate()`; en `desk-db` queda sin usar. `desk.tickets` no forma parte de la replicación hub → desk, así que la columna no interfiere con ella.

### 3.2 `syncPendingHistory({ limite, pausaMs })`

Método nuevo del objeto que devuelve `createSync`:

- Elige los tickets con `history_synced_at IS NULL OR history_synced_at < modified_time`, ordenados por `modified_time DESC`, hasta `limite`.
- Excluye los tickets nacidos en la app (`PREFIJO_TICKET_APP`), igual que `backfillTicketHistory`: Zoho no los conoce.
- Por cada ticket: `traerHistoria(id)` y, si ha ido bien, `UPDATE tickets SET history_synced_at = <modified_time leído al elegirlo>`. Se guarda el valor leído y no `now()`: si el ticket cambia mientras se procesa, la pasada siguiente lo vuelve a elegir.
- Es tolerante: un fallo se cuenta, guarda el motivo del primero y sigue. El ticket fallido no se marca y vuelve a salir en la pasada siguiente.
- Hace una pausa de `pausaMs` entre tickets, porque `zohoFetch` no reintenta ante un 429.
- Devuelve `{ intentados, poblados, fallidos, motivoPrimerFallo }`.
- Consultas simples sin subconsultas correlacionadas: pg-mem, el motor de los tests, no las resuelve.

### 3.3 Enganche en el ciclo

En `scheduleHubSync`, dentro de la cadena del sync de Desk: `syncRecent()` → `syncPendingHistory({ limite: 50 })` → `syncActivities()` → `syncContacts()`. El fallo de `syncPendingHistory` se captura aparte para no cortar los pasos siguientes.

- **Barrido inicial:** los 759 tickets empiezan con `history_synced_at` nulo y se rellenan solos en las primeras pasadas. No hace falta script manual ni variable de entorno.
- **Incremental:** después solo entran los tickets cuyo `modified_time` ha avanzado; un cambio de fase lo avanza.
- Se descarta reutilizar `backfillTicketHistory`: solo rellena los tickets **sin ninguna** historia, así que un ticket que cambia de fase después del barrido no volvería a pedirse y el KPI se congelaría.

### 3.4 Tests (vitest + pg-mem)

- elige los tickets con `history_synced_at` nulo y los que tienen `modified_time` posterior;
- no elige los que ya están al día;
- marca `history_synced_at` con el `modified_time` leído;
- un fallo de Zoho en un ticket no corta la pasada y ese ticket queda sin marcar;
- respeta `limite`;
- excluye los tickets nacidos en la app.

## 4. Parte 2 — SalesTracker

### 4.1 Consulta al hub — `src/db/hub-kpi.ts`

`getHubCommercialNotificationChanges(anio: number): Promise<CambioFase[]>`

```ts
export interface CambioFase {
  ticketId: string;
  /** Milisegundos desde epoch. Sin Date para no reinterpretar la zona horaria. */
  instante: number;
  desde: string | null;
  hacia: string | null;
}
```

```sql
SELECT h.ticket_id AS "ticketId",
       (extract(epoch from h.event_time) * 1000)::float8 AS instante,
       s->'propertyValue'->>'previousValue' AS desde,
       s->'propertyValue'->>'updatedValue' AS hacia
FROM desk.ticket_history h
CROSS JOIN LATERAL jsonb_array_elements(h.raw->'eventInfo') s
WHERE h.event_name = 'TicketUpdated'
  AND s->>'propertyName' = 'Status'
  AND ($2 IN (s->'propertyValue'->>'previousValue', s->'propertyValue'->>'updatedValue'))
  AND h.event_time >= make_timestamptz($1, 1, 1, 0, 0, 0, 'America/Bogota')
  AND h.event_time <  make_timestamptz($1 + 1, 2, 1, 0, 0, 0, 'America/Bogota')
ORDER BY h.ticket_id, h.event_time
```

- `$2` es la constante `FASE_NOTIFICACION_COMERCIAL`, definida en el servidor y nunca tomada de la entrada del usuario.
- **La ventana llega hasta el 31 de enero del año siguiente** para que un episodio que empieza a final de diciembre pueda cerrarse. El filtro por mes de inicio lo hace la lógica pura.
- Una salida sin su entrada dentro de la ventana, de un episodio del año anterior, se ignora en la lógica pura.

### 4.2 Acción y consulta en la tabla

- `getKpiTicketsChanges(year)` en `src/actions/kpi-actions.ts`, con `requireApproved()` como el resto de lecturas.
- En `commercial-kpi-table.tsx`: `useQuery({ queryKey: ["kpi-tickets", year], ... })`. No depende del ámbito ni del conmutador OV/FAC.

### 4.3 Lógica pura — `src/lib/kpi-tickets.ts` (nuevo)

Constantes de fase: `FASE_NOTIFICACION_COMERCIAL = "Notificación Comercial"` y `FASES_FIN_RELOJ = ["Notificación cliente", "En espera de SKU inventario"]`. También `PLAZO_HORAS = 12`, `HORA_INICIO = 8`, `HORA_FIN = 17` y `OFFSET_BOGOTA_HORAS = -5`.

**`festivosColombia(anio: number): Set<string>`**, con claves `'YYYY-MM-DD'`:

- Fijos: 1 ene, 1 may, 20 jul, 7 ago, 8 dic y 25 dic.
- Trasladables al lunes siguiente si no caen en lunes (Ley 51 de 1983): 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov y 11 nov.
- Según el Domingo de Pascua (algoritmo anónimo gregoriano):
  - Jueves Santo (−3) y Viernes Santo (−2);
  - Ascensión (+43), Corpus Christi (+64) y Sagrado Corazón (+71), que ya caen en lunes.
- Tests contra las listas oficiales completas de 2025 y 2026.

**`horasLaborables(desde: number, hasta: number): number`**

- Convierte a hora de Bogotá sumando el offset fijo y recorre día a día. Por cada día laborable, es decir lunes a viernes y no festivo, suma la intersección de `[desde, hasta]` con `[08:00, 17:00)`.
- Devuelve horas decimales. `hasta <= desde` → 0.
- Casos de test:
  - mismo día dentro del horario;
  - antes de las 8:00 y después de las 17:00;
  - de viernes a lunes;
  - cruzando un festivo;
  - un episodio que empieza en fin de semana.

**`episodiosNotificacionComercial(cambios: CambioFase[]): Episodio[]`**

```ts
export interface Episodio {
  ticketId: string;
  inicio: number;
  /** null si sigue abierto. */
  fin: number | null;
  /** "medible": salió a una fase de FASES_FIN_RELOJ; "excluido": salió a otra; "abierto": no ha salido. */
  estado: "medible" | "excluido" | "abierto";
}
```

- Agrupa por ticket y ordena por `instante`.
- Una entrada (`hacia === FASE_NOTIFICACION_COMERCIAL`) abre un episodio si no hay uno abierto; una entrada repetida con uno ya abierto se ignora.
- Una salida (`desde === FASE_NOTIFICACION_COMERCIAL`) cierra el episodio abierto: `medible` si `hacia` está en `FASES_FIN_RELOJ`, `excluido` si no. Una salida sin episodio abierto se ignora.

**`ticketsEnPlazoPorMes(episodios: Episodio[], anio: number, ahora: number): (number | null)[]`**

- Devuelve 12 valores, uno por mes de `inicio` en hora de Bogotá, y descarta los episodios de otros años.
- `excluido` → no cuenta.
- `medible` → en plazo si `horasLaborables(inicio, fin) < PLAZO_HORAS`, y fuera de plazo si no.
- `abierto` → fuera de plazo si `horasLaborables(inicio, ahora) >= PLAZO_HORAS`; si no, todavía no cuenta.
- Valor del mes: `enPlazo / (enPlazo + fueraDePlazo) * 100`, o `null` si el denominador es 0.
- Test de coherencia: la suma de los contadores de los 12 meses es igual al número de episodios del año que cuentan.

### 4.4 La fila en la tabla

- En `src/lib/commercial-kpis.ts`, `tickets_st` pasa a `source: "auto"` y se quita `pendingReason`. Clave, periodo y unidad no cambian, así que las metas guardadas siguen valiendo.
- En `commercial-kpi-table.tsx`: `construirFila(def, ticketsEnPlazoPorMes(episodios, year, Date.now()), meta, null)`. Es el mismo camino que las filas mensuales: cumplimiento bajo cada mes, promedio de los meses con dato y aporte topado al 100 %.
- La nota «De compañía: no se filtra por comercial», que hoy solo sale en `incremento_st`, se muestra también en `tickets_st`.
- `CHART_HELP.kpisComerciales` es una ayuda única para toda la tabla y no cambia.

### 4.5 Hub falso de E2E

- `e2e/db/hub-schema.sql`: `CREATE SCHEMA IF NOT EXISTS desk` y `desk.ticket_history` con las columnas que lee la consulta (`id`, `ticket_id`, `event_name`, `event_time`, `raw`).
- La semilla lleva eventos **inventados** del año en curso, con ids y fases ficticios pero con los nombres de fase reales:
  - un ticket en plazo;
  - uno fuera de plazo;
  - uno por la ruta del SKU;
  - uno rechazado (excluido);
  - uno con una re-cotización (dos episodios).
- Las aserciones E2E del valor de la fila salen de esos datos; las que hoy esperan la fila como pendiente se actualizan.

## 5. Orden de entrega y despliegue

1. **PR en `ambientalia-desk`.** Al desplegarse, el worker aplica el `ALTER TABLE` con su `migrate()` y rellena el historial en pasadas de 50.
2. **PR en SalesTracker.** No tiene migración. Si se despliega antes de que el hub tenga historia, todos los meses salen `null` y el KPI no entra en el TOTAL (la cobertura lo excluye), así que no aparece un 0 % falso.
3. Después del despliegue, un administrador fija en Configuración la meta real de Tickets en plazo, que sustituye al 1 % de relleno.

Los dos repositorios son **públicos**: ni la spec, ni los planes, ni los tests, ni la semilla llevan nombres, números de ticket ni datos reales de clientes.

## 6. Fuera de alcance

- Pulsar una cifra mensual para ver la lista de tickets, como en ventas y tratos.
- Atribuir episodios a un comercial.
- Hacer configurables el plazo o el horario: son constantes en el código.
- Rellenar `desk.ticket_transitions` en el hub.
