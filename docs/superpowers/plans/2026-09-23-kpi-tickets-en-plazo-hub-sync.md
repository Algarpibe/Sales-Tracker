# Tickets en plazo, parte 1: el worker rellena el historial — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Este plan NO se ejecuta en SalesTracker.** Se ejecuta en un **clon del repositorio `ambientalia-desk`**
> (`https://github.com/Algarpibe/ambientalia-desk.git`), en una **rama nueva creada desde su `main`**.
> Todas las rutas y comandos de este documento son relativos a la raíz de ese clon. La parte de
> SalesTracker (§4 de la spec) tiene su propio plan.

**Goal:** El worker `hub-sync` rellena `desk.ticket_history` en `zoho-hub` con el historial de Zoho Desk de cada ticket, primero en un barrido inicial y después solo para los tickets que Zoho modifica.

**Architecture:** Una columna nueva `tickets.history_synced_at` guarda el `modified_time` del ticket en el momento en que se trajo su historia. Un método nuevo de `createSync`, `syncPendingHistory({ limite, pausaMs })`, elige los tickets con la marca nula o anterior a `modified_time`, trae su historia con la función `traerHistoria` que ya existe y los marca. `scheduleHubSync` lo llama en cada ciclo entre `syncRecent()` y `syncActivities()`, con su propio `catch`.

**Tech Stack:** Node 22 + TypeScript 5.6, `pg` sin ORM, vitest 3 con pg-mem 3.

**Spec:** `salestracker-pro/docs/superpowers/specs/2026-09-23-kpi-tickets-en-plazo-design.md` (en el repositorio de SalesTracker), §3 y §5.

---

## Contexto para quien ejecuta

- **Repo:** un clon de `ambientalia-desk`. Todos los comandos se lanzan desde su raíz. El Bash es Git Bash.
- **Ruta corta en Windows.** El historial de `ambientalia-desk` tiene rutas largas: un clon bajo `AppData\Local\Temp\...` ya dio `Filename too long` al leer un objeto. Clonar en una ruta corta (p. ej. `C:\dev\ambientalia-desk`) y con `core.longpaths=true` (Task 1).
- **Rama:** `feat/historia-pendiente-hub`, creada desde `origin/main`. No cambiar de rama, no hacer push hasta la Task 6.
- **Repo público:** los datos de los tests son **inventados** (ids de ticket ficticios como `100`, `200`, `app-0001`; actor `Agente`). Ningún nombre, número de ticket ni dato real de cliente en código, tests, comentarios ni mensajes de commit.
- **Commits:** convencionales, en español **sin tildes ni eñes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por tarea.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Prohibido `sed -i`.** Los cambios se hacen con la herramienta de edición (sustitución exacta). El repositorio guarda LF; el CRLF del árbol de trabajo lo pone `core.autocrlf` en Windows y git lo normaliza al hacer commit.
- **`CLAUDE.md` del repositorio manda.** Se carga en cada sesión y lo leen también los sub-agentes. De él aplican aquí:
  - **Regla de mutación 4 (citas `ruta:línea`).** Este plan está diseñado para **no desplazar** líneas citadas: la `ALTER` va al final de `schema.sql`, la interfaz nueva y sus tipos van al final de `sync.ts`, el método va al final del objeto que devuelve `createSync`, y en `migrate.test.ts`, `auth/routes.test.ts` y `appHarness.ts` las ediciones son en la misma línea. Aun así, la Task 5 hace el barrido de cierre.
  - **Comentarios sin `ruta:línea`.** Los comentarios nuevos no llevan citas por número: el hook `pre-push` las comprueba y una cita nueva rota bloquea el push.
  - **`schema.sql` sin punto y coma en los comentarios.** `schemaStatements()` (`packages/zoho-sync/src/db/migrate.ts`) trocea el fichero por `;` a ciegas, comentarios incluidos.
  - **`ALTER TABLE tickets` va SIN calificar.** `tickets` está en `DESK_TABLES`; calificarla con `desk.` hace que `migrate` la omita en pg-mem en silencio.
- **Lint:** el CI corre `npm run lint -- --max-warnings 165` **sin holgura**. El código nuevo no puede añadir ningún aviso (nada de `any`).
- **Despliegue:** lo hace el usuario en EasyPanel, **nunca el agente**. Este PR no trae script de migración manual: el `ALTER TABLE` lo aplica `migrate()` al arrancar el worker.

## Contexto verificado

Leído en el código de `main` de `ambientalia-desk` y comprobado con pg-mem 3.0 y vitest 3.2 en una copia aparte:

- `traerHistoria(id)` está dentro de `createSync` (`packages/zoho-sync/src/sync.ts`): pide `/tickets/{id}/History` en páginas de 50, guarda cada evento con `upsertHistoryEvent` (idempotente por hash, `ON CONFLICT (id) DO NOTHING`) y **lanza** si Zoho responde con error. El nuevo método la reutiliza tal cual.
- `backfillTicketHistory` ya existe, pero solo elige tickets **sin ninguna** fila en `ticket_history`: un ticket que cambia de fase después del barrido no volvería a pedirse. Por eso hace falta la columna nueva, como dice la spec (§3.3).
- `history_synced_at` **no** entra en `TICKET_COLS` (`packages/zoho-sync/src/db/repo.ts`), así que `upsertTicket` —y con él `syncRecent`— no la pisa. La Task 2 lo fija con un test.
- **pg-mem resuelve la consulta de selección**: `id NOT LIKE $1 AND (history_synced_at IS NULL OR history_synced_at < modified_time) ORDER BY modified_time DESC NULLS LAST LIMIT $2`, con los dos parámetros. Devuelve `modified_time` como `Date`, igual que `pg` real, y el `UPDATE ... SET history_synced_at = $1` con ese `Date` guarda el valor exacto.
- **pg-mem NO admite `timestamptz::text`** («cannot cast type timestamp with time zone to text»). Por eso la marca se guarda pasando el `Date` leído, no un texto.
- **Un ticket con `modified_time` nulo** entra en la selección (`history_synced_at IS NULL`) y, si se marcara con su `modified_time`, quedaría otra vez en nulo y saldría en **todas** las pasadas. Se marca con el epoch (`new Date(0)`): `epoch < NULL` es nulo, así que no vuelve a salir hasta que Zoho le ponga fecha. Todos los tickets de Zoho traen `modifiedTime`, así que es un caso de borde, no el normal.
- **Precisión:** Zoho da `modifiedTime` con milisegundos, que es lo que un `Date` de JavaScript conserva. Si alguna vez llegara con microsegundos, la marca quedaría un poco por debajo y el ticket se volvería a pedir en cada pasada. Hipótesis sin indicios hoy; la consulta de seguimiento de la Task 6 lo delataría.
- `scheduleHubSync` (`apps/hub-sync/src/hubSync.ts`) encadena `syncRecent → syncActivities → syncContacts` bajo un cerrojo `syncing` que salta el tic si el anterior no ha terminado. El intervalo es `SYNC_INTERVAL_MS`, 180 000 ms por omisión (`packages/zoho-sync/src/config.ts`).
- **Tiempo de una pasada:** 50 tickets × (500 ms de pausa + una llamada a Zoho) son unos 40-65 s, por debajo de los 180 s del intervalo. Si una pasada tardara más, el cerrojo salta el tic siguiente; los temporizadores de Books y CRM son independientes y no se ven afectados. Se mantiene `pausaMs` por omisión en 500, como `backfillTicketHistory`.
- **Barrido inicial:** con los tickets del hub en nulo y 50 por ciclo, se completa en unos 16 ciclos (unos 50 minutos) y unas 800 llamadas a Zoho. Después solo entran los tickets cuyo `modified_time` avanza.
- `advanceTimersByTimeAsync` de vitest vacía la cadena de promesas del ciclo: un test con temporizadores falsos ve las cuatro llamadas en orden sin esperas extra (comprobado).
- **Hay cuatro objetos que implementan `Sync` a mano en los tests** y dejarían de compilar al añadir el método: `apps/hub-sync/src/hubSync.test.ts` (`mockSync`), `apps/desk/server/auth/routes.test.ts:18`, `apps/desk/server/testing/appHarness.ts:50` y `apps/desk/server/backfill.test.ts` (dos). `apps/desk/server/admin.test.ts` usa `as any` y no hace falta tocarlo.
- `packages/zoho-sync/src/db/migrate.test.ts` fija el **recuento** de `ALTER TABLE` del esquema: hoy 29, 18 calificadas y 11 sin calificar. La `ALTER` nueva lo lleva a 30 y 12. Es el rojo de la Task 2.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `packages/zoho-sync/src/db/schema.sql` | Modificar (al final) | Columna `tickets.history_synced_at`. |
| `packages/zoho-sync/src/db/migrate.test.ts` | Modificar (en línea) | Recuento de `ALTER`: 30 y 12. |
| `packages/zoho-sync/src/sync.historyPending.test.ts` | Crear | Tests de la columna y de `syncPendingHistory`. |
| `packages/zoho-sync/src/sync.ts` | Modificar | `Sync extends HistoriaPendiente`, el método y sus tipos. |
| `apps/hub-sync/src/hubSync.ts` | Modificar | El paso nuevo en el ciclo y su log. |
| `apps/hub-sync/src/hubSync.test.ts` | Modificar | `mockSync` y dos tests del enganche. |
| `apps/desk/server/auth/routes.test.ts` | Modificar (en línea) | El método nuevo en el `sync` falso. |
| `apps/desk/server/testing/appHarness.ts` | Modificar (en línea) | El método nuevo en el `sync` falso. |
| `apps/desk/server/backfill.test.ts` | Modificar | El método nuevo en los dos `sync` falsos. |

---

### Task 1: Clon, rama y línea base

**Files:** ninguno.

- [ ] **Step 1: Clonar en una ruta corta y crear la rama**

```bash
git -c core.longpaths=true clone https://github.com/Algarpibe/ambientalia-desk.git /c/dev/ambientalia-desk
cd /c/dev/ambientalia-desk
git config core.longpaths true
git checkout -b feat/historia-pendiente-hub origin/main
```

Si el clon ya existe, en su lugar: `git checkout main && git fetch origin && git merge --ff-only origin/main && git checkout -b feat/historia-pendiente-hub`.

Expected: `Switched to a new branch 'feat/historia-pendiente-hub'`.

- [ ] **Step 2: Instalar dependencias**

Run: `npm ci`
Expected: termina sin errores. El script `prepare` fija `core.hooksPath .githooks` (el hook de citas de `pre-push`).

- [ ] **Step 3: Ejecutar y anotar la línea base**

Run: `npm run typecheck`
Expected: sale con código 0. Anotar: `typecheck base: OK`.

Run: `npm run lint 2>&1 | tail -3`
Expected: `✖ N problems (0 errors, N warnings)` con N ≤ 165. **Anotar N** (`lint base: N avisos`). Al final debe seguir siendo exactamente N.

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde. **Anotar** las líneas `Test Files` y `Tests` (`tests base: F ficheros, T pruebas`). Al final deben ser F+1 ficheros y T+12 pruebas.

Si algo de la línea base no está en verde, **parar** y avisar: no se empieza sobre una base rota.

---

### Task 2: La columna `history_synced_at`

**Files:**
- Modify: `packages/zoho-sync/src/db/migrate.test.ts` (líneas 354, 356, 358 y 360, sin añadir líneas)
- Create: `packages/zoho-sync/src/sync.historyPending.test.ts`
- Modify: `packages/zoho-sync/src/db/schema.sql` (al final)

- [ ] **Step 1: Actualizar el recuento de `ALTER` (rojo)**

En `packages/zoho-sync/src/db/migrate.test.ts`, cuatro sustituciones exactas, cada una **en su misma línea**:

Sustituir:
```ts
   * estaban.
   */
  it('son 29 ALTER: 18 calificadas (13 de public + 5 de books) y 11 sin calificar, todas de Desk', () => {
```
por:
```ts
   * estaban. Con `history_synced_at` sobre `tickets`, las sin calificar pasan a 12.
   */
  it('son 30 ALTER: 18 calificadas (13 de public + 5 de books) y 12 sin calificar, todas de Desk', () => {
```

Sustituir:
```ts
    expect(alters.length, 'ALTER TABLE en schema.sql').toBe(29)
```
por:
```ts
    expect(alters.length, 'ALTER TABLE en schema.sql').toBe(30)
```

Sustituir:
```ts
    expect(alters.filter((a) => !a.calificada).length, 'ALTER sin calificar').toBe(11)
```
por:
```ts
    expect(alters.filter((a) => !a.calificada).length, 'ALTER sin calificar').toBe(12)
```

El `Set` de tablas con `ALTER` sin calificar (`tickets`, `equipos`, `contacts`) **no cambia**: la nueva es sobre `tickets`.

- [ ] **Step 2: Crear el fichero de tests con los de la columna (rojo)**

Crear `packages/zoho-sync/src/sync.historyPending.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { newDb } from 'pg-mem'
import { migrate, type Queryable } from './db/migrate'
import { createSync } from './sync'
import type { AppConfig } from './config'

const config = { departmentId: 'D1' } as AppConfig

let db: Queryable
beforeEach(async () => { const pg = newDb().adapters.createPg(); db = new pg.Pool(); await migrate(db) })

let numero = 0
/** Un ticket de Zoho con su `modified_time` y, si se da, la marca de la última historia traída. */
const ticket = (id: string, modificado: string | null, sincronizado: string | null = null) =>
  db.query(
    'INSERT INTO tickets (id, number, subject, status, modified_time, history_synced_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, ++numero, 'A', 'Finalizado', modificado ? new Date(modificado) : null, sincronizado ? new Date(sincronizado) : null],
  )

const marca = async (id: string): Promise<Date | null> =>
  (await db.query('SELECT history_synced_at FROM tickets WHERE id = $1', [id])).rows[0].history_synced_at

describe('esquema · history_synced_at', () => {
  it('tickets tiene la columna y nace nula', async () => {
    await ticket('900', '2026-01-01T10:00:00Z')
    expect(await marca('900')).toBeNull()
  })

  /**
   * `history_synced_at` no está en `TICKET_COLS`, así que el sync de tickets no la toca. Si la
   * pisara, cada `syncRecent` devolvería a la cola los tickets que acaba de actualizar.
   */
  it('el sync de un ticket desde Zoho no borra la marca', async () => {
    await ticket('100', '2026-01-04T16:00:00Z', '2026-01-04T16:00:00Z')
    const zohoFetch = vi.fn().mockImplementation(async (url: string) =>
      url.startsWith('/tickets/100?')
        ? new Response(JSON.stringify({ id: '100', ticketNumber: '1', subject: 'A', status: 'Finalizado', modifiedTime: '2026-01-04T16:00:00Z' }), { status: 200 })
        : new Response('{}', { status: 404 }))
    const sync = createSync({ zohoFetch, db, config })

    await sync.syncTicket('100')

    expect((await marca('100'))?.toISOString()).toBe('2026-01-04T16:00:00.000Z')
  })
})
```

- [ ] **Step 3: Ver el rojo**

Run: `npx vitest run packages/zoho-sync/src/sync.historyPending.test.ts packages/zoho-sync/src/db/migrate.test.ts`
Expected: FAIL en tres pruebas: las dos de `esquema · history_synced_at` (pg-mem: la columna `history_synced_at` no existe) y `son 30 ALTER…` (`expected 29 to be 30`).

- [ ] **Step 4: Añadir la columna al final de `schema.sql`**

Añadir **al final** de `packages/zoho-sync/src/db/schema.sql`, detrás de la última sentencia (`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS fecha_aviso_cliente date;`), con una línea en blanco delante:

```sql

-- Marca de la historia de Zoho ya traida por el worker hub-sync. Guarda el modified_time del ticket leido al elegirlo, no la hora de la pasada, asi que un ticket con modified_time posterior vuelve a elegirse. En desk-db queda sin usar porque alli no corre ese relleno
--
-- SIN CALIFICAR A PROPOSITO, como el resto de ALTER sobre tickets: es tabla de DESK_TABLES y en produccion el search_path la lleva a desk. Y sin el caracter de punto y coma en este comentario, que migrate parte el fichero por el
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS history_synced_at timestamptz;
```

Comprobar que el comentario no tiene ningún `;`:

Run: `tail -4 packages/zoho-sync/src/db/schema.sql | grep -c ';'`
Expected: `1` (solo el de la propia `ALTER`).

- [ ] **Step 5: Ver el verde**

Run: `npx vitest run packages/zoho-sync/src/sync.historyPending.test.ts packages/zoho-sync/src/db/migrate.test.ts`
Expected: PASS, todas.

- [ ] **Step 6: Mutación del fichero vigilado (regla de mutación 2)**

Calificar temporalmente la sentencia nueva como `ALTER TABLE desk.tickets ADD COLUMN IF NOT EXISTS history_synced_at timestamptz;` y volver a correr el Step 5.
Expected: FAIL (el guardián de `migrate.test.ts` la rechaza y la columna no se crea en pg-mem).

Deshacer con la herramienta de edición, dejando `ALTER TABLE tickets ...`, y repetir el Step 5 hasta verde. Run: `git diff --stat` — solo los tres ficheros de esta tarea.

- [ ] **Step 7: Commit**

```bash
git add packages/zoho-sync/src/db/schema.sql packages/zoho-sync/src/db/migrate.test.ts packages/zoho-sync/src/sync.historyPending.test.ts
git commit -m "feat(zoho-sync): agregar tickets.history_synced_at para la historia de Zoho"
```

---

### Task 3: `syncPendingHistory`

**Files:**
- Modify: `packages/zoho-sync/src/sync.historyPending.test.ts` (al final)
- Modify: `packages/zoho-sync/src/sync.ts` (línea 14 en su sitio; el método al final del objeto; los tipos al final del fichero)
- Modify: `apps/hub-sync/src/hubSync.test.ts` (`mockSync`)
- Modify: `apps/desk/server/auth/routes.test.ts:18` (en línea)
- Modify: `apps/desk/server/testing/appHarness.ts:50` (en línea)
- Modify: `apps/desk/server/backfill.test.ts` (dos `sync` falsos)

- [ ] **Step 1: Escribir los tests (rojo)**

Añadir **al final** de `packages/zoho-sync/src/sync.historyPending.test.ts`:

```ts

const evento = () =>
  ({ eventName: 'TicketUpdated', eventTime: '2026-01-05T15:00:00Z', actor: { name: 'Agente', type: 'Agent' }, eventInfo: [] })

/** Una página con un evento y después vacío, para cualquier ticket. */
const unaPagina = () => vi.fn().mockImplementation(async (url: string) =>
  url.includes('from=1')
    ? new Response(JSON.stringify({ data: [evento()] }), { status: 200 })
    : new Response(JSON.stringify({ data: [] }), { status: 200 }))

/** Los ids de ticket cuya historia se pidió, en el orden en que se pidieron. */
const pedidos = (zohoFetch: ReturnType<typeof vi.fn>) =>
  zohoFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('from=1')).map((u) => u.split('/')[2])

const sinPausa = { pausaMs: 0 }

describe('syncPendingHistory', () => {
  it('elige los que nunca se trajeron y los modificados después de la última vez', async () => {
    await ticket('100', '2026-01-04T16:00:00Z')
    await ticket('200', '2026-02-04T16:00:00Z', '2026-01-10T16:00:00Z')
    const zohoFetch = unaPagina()
    const sync = createSync({ zohoFetch, db, config })

    const r = await sync.syncPendingHistory({ ...sinPausa, limite: 50 })

    expect(r).toEqual({ intentados: 2, poblados: 2, fallidos: 0 })
    expect(pedidos(zohoFetch).sort()).toEqual(['100', '200'])
    expect((await db.query('SELECT count(*)::int AS c FROM ticket_history')).rows[0].c).toBe(2)
  })

  it('no elige los que ya están al día', async () => {
    await ticket('100', '2026-01-04T16:00:00Z', '2026-01-04T16:00:00Z')
    const zohoFetch = unaPagina()
    const sync = createSync({ zohoFetch, db, config })

    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toEqual({ intentados: 0, poblados: 0, fallidos: 0 })
    expect(zohoFetch).not.toHaveBeenCalled()
  })

  /**
   * La marca es el `modified_time` LEÍDO al elegir el ticket, no la hora de la pasada: con `now()`,
   * un ticket que Zoho cambia mientras se trae su historia quedaría marcado como al día sin estarlo.
   */
  it('marca history_synced_at con el modified_time leído', async () => {
    await ticket('100', '2026-01-04T16:00:00Z')
    const sync = createSync({ zohoFetch: unaPagina(), db, config })

    await sync.syncPendingHistory({ ...sinPausa, limite: 50 })

    expect((await marca('100'))?.toISOString()).toBe('2026-01-04T16:00:00.000Z')
  })

  it('un ticket que cambia mientras se trae su historia vuelve a salir en la pasada siguiente', async () => {
    await ticket('100', '2026-01-04T16:00:00Z')
    const base = unaPagina()
    const zohoFetch = vi.fn().mockImplementation(async (url: string) => {
      // Zoho lo modifica justo mientras se pide su historia, como haría un syncRecent entre medias.
      await db.query('UPDATE tickets SET modified_time = $1 WHERE id = $2', [new Date('2026-01-04T17:00:00Z'), '100'])
      return base(url)
    })
    const sync = createSync({ zohoFetch, db, config })

    await sync.syncPendingHistory({ ...sinPausa, limite: 50 })

    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1, poblados: 1 })
  })

  /**
   * El invariante de la pasada: un fallo NO corta los demás, y el ticket fallido NO se marca, así
   * que la pasada siguiente lo vuelve a intentar sin hacer nada especial.
   */
  it('un fallo de Zoho en un ticket no corta la pasada y ese ticket queda sin marcar', async () => {
    await ticket('100', '2026-01-04T16:00:00Z')
    await ticket('200', '2026-02-04T16:00:00Z')
    const base = unaPagina()
    const zohoFetch = vi.fn().mockImplementation(async (url: string) =>
      url.includes('/tickets/100/') ? new Response('nope', { status: 404 }) : base(url))
    const sync = createSync({ zohoFetch, db, config })

    const r = await sync.syncPendingHistory({ ...sinPausa, limite: 50 })

    expect(r).toMatchObject({ intentados: 2, poblados: 1, fallidos: 1 })
    expect(r.motivoPrimerFallo).toContain('404')
    expect(await marca('100')).toBeNull()
    expect((await marca('200'))?.toISOString()).toBe('2026-02-04T16:00:00.000Z')

    zohoFetch.mockClear()
    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1 })
    expect(pedidos(zohoFetch)).toEqual(['100'])
  })

  it('respeta el límite y empieza por los modificados más recientemente', async () => {
    await ticket('100', '2026-01-04T16:00:00Z')
    await ticket('200', '2026-03-04T16:00:00Z')
    await ticket('300', '2026-02-04T16:00:00Z')
    const zohoFetch = unaPagina()
    const sync = createSync({ zohoFetch, db, config })

    const r = await sync.syncPendingHistory({ ...sinPausa, limite: 2 })

    expect(r).toMatchObject({ intentados: 2, poblados: 2 })
    expect(pedidos(zohoFetch)).toEqual(['200', '300'])
    expect(await marca('100')).toBeNull()
  })

  /** Zoho no conoce los tickets nacidos en la app: preguntarle sería un 404 por cabeza en cada ciclo. */
  it('excluye los tickets nacidos en la app', async () => {
    await ticket('app-0001', '2026-08-01T16:00:00Z')
    const zohoFetch = unaPagina()
    const sync = createSync({ zohoFetch, db, config })

    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 0 })
    expect(zohoFetch).not.toHaveBeenCalled()
  })

  /**
   * Sin `modified_time` no hay valor leído que guardar, y marcarlo con nulo lo haría salir en TODAS
   * las pasadas. Se marca con el epoch: se trae una vez y no vuelve hasta que Zoho le ponga fecha.
   */
  it('un ticket sin modified_time se trae una vez y no vuelve a salir', async () => {
    await ticket('100', null)
    const zohoFetch = unaPagina()
    const sync = createSync({ zohoFetch, db, config })

    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1, poblados: 1 })
    expect(await sync.syncPendingHistory({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 0 })
  })
})
```

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run packages/zoho-sync/src/sync.historyPending.test.ts`
Expected: FAIL en las 8 pruebas de `syncPendingHistory` con `TypeError: sync.syncPendingHistory is not a function`. Las 2 de `esquema` siguen en verde.

- [ ] **Step 3: Declarar la interfaz sin mover líneas de `Sync`**

En `packages/zoho-sync/src/sync.ts`, línea 14, sustituir:
```ts
export interface Sync {
```
por:
```ts
export interface Sync extends HistoriaPendiente {
```

Y añadir **al final del fichero**, detrás de la llave que cierra `createSync`:

```ts

/**
 * El relleno de la historia que corre el worker `hub-sync`. Va en una interfaz aparte y al final del
 * fichero para no mover ninguna línea de `Sync` ni de los tipos de arriba, que la documentación del
 * repositorio cita por número.
 */
export interface HistoriaPendiente {
  syncPendingHistory(opts: HistoriaPendienteOpts): Promise<ResultadoHistoriaPendiente>
}
export interface HistoriaPendienteOpts {
  /** Cuántos tickets como mucho en esta pasada. Obligatorio: sin tope, el primer arranque pediría todas las historias de golpe. */
  limite: number
  /** Espera entre tickets. `zohoFetch` no reintenta ante un 429. Por omisión 500 ms, como el barrido. */
  pausaMs?: number
}
export interface ResultadoHistoriaPendiente {
  intentados: number
  poblados: number
  fallidos: number
  /** Por qué falló el PRIMERO que falló. Ausente si no falló ninguno. */
  motivoPrimerFallo?: string
}
```

- [ ] **Step 4: Implementar el método al final del objeto que devuelve `createSync`**

En `packages/zoho-sync/src/sync.ts`, el objeto termina con `syncContacts`. Sustituir su cierre:
```ts
        if (reachedOld || items.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return total
    },
  }
}
```
por:
```ts
        if (reachedOld || items.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return total
    },
    /**
     * Trae la historia de los tickets cuya copia puede estar desfasada: los que nunca se han traído
     * (`history_synced_at` nulo) y los que Zoho ha modificado después de la última vez
     * (`history_synced_at` anterior a `modified_time`). Lo corre el worker en cada ciclo.
     *
     * No reutiliza `backfillTicketHistory` porque ese solo mira si el ticket tiene ALGUNA historia: un
     * ticket que cambia de fase después del barrido no volvería a pedirse nunca.
     *
     * - La marca es el `modified_time` LEÍDO al elegir el ticket, no `now()`: si Zoho lo cambia
     *   mientras se trae su historia, su `modified_time` avanza y la pasada siguiente lo vuelve a elegir.
     * - Un ticket sin `modified_time` se marca con el epoch: se trae una vez y no vuelve a salir hasta
     *   que Zoho le ponga fecha. Marcarlo con nulo lo haría salir en todas las pasadas.
     * - Tolerante, como el barrido: un fallo se cuenta, se guarda el motivo del primero y se sigue. El
     *   ticket fallido no se marca, así que vuelve a salir en la pasada siguiente.
     * - Una sola consulta simple: pg-mem, el motor de los tests, no resuelve subconsultas correlacionadas.
     */
    async syncPendingHistory({ limite, pausaMs = 500 }: HistoriaPendienteOpts): Promise<ResultadoHistoriaPendiente> {
      const r = await db.query(
        `SELECT id, modified_time FROM tickets
         WHERE id NOT LIKE $1 AND (history_synced_at IS NULL OR history_synced_at < modified_time)
         ORDER BY modified_time DESC NULLS LAST LIMIT $2`,
        [`${PREFIJO_TICKET_APP}%`, limite],
      )
      const tanda = r.rows as { id: string; modified_time: Date | null }[]
      let poblados = 0, fallidos = 0
      let motivoPrimerFallo: string | undefined
      for (const [i, t] of tanda.entries()) {
        if (i > 0 && pausaMs > 0) await new Promise((res) => setTimeout(res, pausaMs))
        try {
          await traerHistoria(t.id)
          await db.query('UPDATE tickets SET history_synced_at = $1 WHERE id = $2', [t.modified_time ?? new Date(0), t.id])
          poblados++
        } catch (e) {
          fallidos++
          motivoPrimerFallo ??= e instanceof Error ? e.message : String(e)
        }
      }
      return { intentados: tanda.length, poblados, fallidos, motivoPrimerFallo }
    },
  }
}
```

`PREFIJO_TICKET_APP` ya está importado en la línea 6. No hace falta ningún import nuevo.

- [ ] **Step 5: Ver el verde del paquete**

Run: `npx vitest run packages/zoho-sync/src/sync.historyPending.test.ts`
Expected: PASS, 10 pruebas.

- [ ] **Step 6: Completar los `sync` falsos que implementan `Sync`**

Sin esto, `npm run typecheck` falla en cuatro ficheros de pruebas.

En `apps/hub-sync/src/hubSync.test.ts`, dentro de `mockSync()`, sustituir:
```ts
    syncContacts: vi.fn().mockResolvedValue(0),
  }
}
```
por:
```ts
    syncContacts: vi.fn().mockResolvedValue(0),
    syncPendingHistory: vi.fn().mockResolvedValue({ intentados: 0, poblados: 0, fallidos: 0 }),
  }
}
```

En `apps/desk/server/auth/routes.test.ts`, en la misma línea 18, sustituir:
```ts
backfillTicketHistory: vi.fn(), syncContacts: vi.fn() }
```
por:
```ts
backfillTicketHistory: vi.fn(), syncContacts: vi.fn(), syncPendingHistory: vi.fn() }
```

En `apps/desk/server/testing/appHarness.ts`, en la misma línea 50, sustituir:
```ts
restantes: 0 }), syncContacts: vi.fn() }
```
por:
```ts
restantes: 0 }), syncContacts: vi.fn(), syncPendingHistory: vi.fn().mockResolvedValue({ intentados: 0, poblados: 0, fallidos: 0 }) }
```

En `apps/desk/server/backfill.test.ts`, en **las dos** apariciones (sustitución con `replace_all`), sustituir:
```ts
      syncContacts: vi.fn(),
    }
```
por:
```ts
      syncContacts: vi.fn(),
      syncPendingHistory: vi.fn(),
    }
```

Run: `npm run typecheck`
Expected: sale con código 0.

- [ ] **Step 7: Mutaciones (regla de mutación, `CLAUDE.md`)**

Cada una se aplica con la herramienta de edición, se corre `npx vitest run packages/zoho-sync/src/sync.historyPending.test.ts`, se comprueba el rojo y se deshace:

1. `[t.modified_time ?? new Date(0), t.id]` → `[new Date(), t.id]`. Expected: FAIL en `marca history_synced_at con el modified_time leído`, `un ticket que cambia mientras…` y `un fallo de Zoho…`.
2. `[t.modified_time ?? new Date(0), t.id]` → `[t.modified_time, t.id]`. Expected: FAIL en `un ticket sin modified_time se trae una vez…`.
3. `` [`${PREFIJO_TICKET_APP}%`, limite] `` → `['zzz%', limite]`. Expected: FAIL en `excluye los tickets nacidos en la app`.
4. `ORDER BY modified_time DESC NULLS LAST` → `ORDER BY modified_time ASC NULLS LAST`. Expected: FAIL en `respeta el límite y empieza por los modificados más recientemente`.

Run después de deshacer las cuatro: `git diff packages/zoho-sync/src/sync.ts | grep -c "new Date(0)"`
Expected: `1`. Y la suite del Step 5 otra vez en verde.

- [ ] **Step 8: Suite completa**

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde; T+10 pruebas y F+1 ficheros respecto a la línea base.

- [ ] **Step 9: Commit**

```bash
git add packages/zoho-sync/src/sync.ts packages/zoho-sync/src/sync.historyPending.test.ts apps/hub-sync/src/hubSync.test.ts apps/desk/server/auth/routes.test.ts apps/desk/server/testing/appHarness.ts apps/desk/server/backfill.test.ts
git commit -m "feat(zoho-sync): traer la historia pendiente de los tickets de Zoho"
```

---

### Task 4: El enganche en `scheduleHubSync`

**Files:**
- Modify: `apps/hub-sync/src/hubSync.test.ts` (al final del `describe('scheduleHubSync')`)
- Modify: `apps/hub-sync/src/hubSync.ts`

- [ ] **Step 1: Escribir los tests (rojo)**

En `apps/hub-sync/src/hubSync.test.ts`, el último test del fichero termina así. Sustituir:
```ts
    expect(sync.syncRecent).toHaveBeenCalledTimes(1)
  })
})
```
por:
```ts
    expect(sync.syncRecent).toHaveBeenCalledTimes(1)
  })

  /** Un sync que apunta el orden en que se le llama. `fallaHistoria` hace que la historia rechace. */
  function syncQueApunta(orden: string[], fallaHistoria = false): Sync {
    const s = mockSync()
    s.syncRecent = vi.fn(async () => { orden.push('tickets'); return 0 })
    s.syncPendingHistory = vi.fn(async () => {
      orden.push('historia')
      if (fallaHistoria) throw new Error('Zoho 429')
      return { intentados: 0, poblados: 0, fallidos: 0 }
    })
    s.syncActivities = vi.fn(async () => { orden.push('actividades'); return 0 })
    s.syncContacts = vi.fn(async () => { orden.push('contactos'); return 0 })
    return s
  }

  /**
   * La historia va DESPUÉS de los tickets, porque `syncRecent` es quien avanza el `modified_time`
   * que decide qué historias faltan, y ANTES de actividades y contactos, que no dependen de ella.
   */
  it('trae la historia pendiente entre los tickets y las actividades, con límite de 50', async () => {
    vi.useFakeTimers()
    const orden: string[] = []
    const sync = syncQueApunta(orden)
    const stop = scheduleHubSync({ sync, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(orden).toEqual(['tickets', 'historia', 'actividades', 'contactos'])
    expect(sync.syncPendingHistory).toHaveBeenCalledWith({ limite: 50 })
  })

  it('un fallo de la historia no corta actividades ni contactos', async () => {
    vi.useFakeTimers()
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const orden: string[] = []
    const stop = scheduleHubSync({ sync: syncQueApunta(orden, true), intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(orden).toEqual(['tickets', 'historia', 'actividades', 'contactos'])
    // Lo recoge el catch propio de la historia, no el general del ciclo.
    expect(errores).toHaveBeenCalledWith('Historia pendiente falló:', expect.any(Error))
    errores.mockRestore()
  })
})
```

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run apps/hub-sync`
Expected: FAIL en las 2 pruebas nuevas; `orden` sale `['tickets', 'actividades', 'contactos']`, sin `'historia'`. Las 8 de antes, en verde.

- [ ] **Step 3: Implementar el paso en el ciclo**

En `apps/hub-sync/src/hubSync.ts`, sustituir el import:
```ts
import type { Sync } from '@ambientalia/zoho-sync/sync'
```
por:
```ts
import type { Sync, ResultadoHistoriaPendiente } from '@ambientalia/zoho-sync/sync'
```

Dentro de `scheduleHubSync`, sustituir:
```ts
    sync.syncRecent().then(() => sync.syncActivities()).then(() => sync.syncContacts())
```
por:
```ts
    sync.syncRecent()
      // La historia va con su propio catch: un Zoho que falla al traer historias no puede dejar al
      // ciclo sin actividades ni contactos.
      .then(() => sync.syncPendingHistory({ limite: 50 }).then(registrarHistoria, (e) => console.error('Historia pendiente falló:', e)))
      .then(() => sync.syncActivities()).then(() => sync.syncContacts())
```

Las dos líneas siguientes (`.catch((e) => console.error('Sync incremental falló:', e))` y `.finally(() => { syncing = false })`) no cambian. Si `syncRecent` falla, el ciclo se salta entero como hasta hoy.

Y añadir **al final del fichero**, detrás de la llave que cierra `scheduleHubSync`:

```ts

/** Deja rastro en el log solo cuando la pasada ha hecho algo: un ciclo sin pendientes no dice nada. */
function registrarHistoria(r: ResultadoHistoriaPendiente): void {
  if (r.intentados === 0) return
  const fallos = r.fallidos > 0 ? `, ${r.fallidos} fallidos (primero: ${r.motivoPrimerFallo})` : ''
  console.log(`Historia pendiente: ${r.poblados} de ${r.intentados} tickets${fallos}`)
}
```

- [ ] **Step 4: Ver el verde**

Run: `npx vitest run apps/hub-sync`
Expected: PASS, 10 pruebas.

- [ ] **Step 5: Mutaciones de posición y de aislamiento (reglas de mutación 1 y 2)**

Cada una con la herramienta de edición, correr `npx vitest run apps/hub-sync`, comprobar el rojo y deshacer:

1. **Posición:** mover el paso de la historia detrás de contactos (`.then(() => sync.syncActivities()).then(() => sync.syncContacts()).then(() => sync.syncPendingHistory(...)...)`). Expected: FAIL en las dos pruebas nuevas (el orden cambia).
2. **Aislamiento:** quitar el segundo argumento de `.then(registrarHistoria, (e) => …)`, dejando `.then(registrarHistoria)`. Expected: FAIL en `un fallo de la historia no corta actividades ni contactos`.

Tras deshacer, repetir el Step 4 hasta verde.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-sync/src/hubSync.ts apps/hub-sync/src/hubSync.test.ts
git commit -m "feat(hub-sync): rellenar la historia pendiente en cada ciclo"
```

---

### Task 5: Verificación completa y cierre

**Files:** ninguno (salvo que el barrido de citas encuentre algo que reparar).

- [ ] **Step 1: Las tres puertas**

Run: `npm run typecheck`
Expected: código 0.

Run: `npm run lint 2>&1 | tail -3`
Expected: `0 errors` y **exactamente N avisos**, el N anotado en la Task 1. Si sube, el aviso nuevo es de este cambio: arreglarlo, no subir el techo.

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde, **F+1 ficheros y T+12 pruebas** respecto a la línea base (10 del fichero nuevo y 2 de `hubSync.test.ts`; el recuento de `ALTER` se modificó, no se añadió).

- [ ] **Step 2: Barrido de citas (regla de mutación 4)**

Las ediciones se hicieron para no mover líneas citadas, pero se comprueba:

```bash
git diff --stat origin/main..HEAD
git grep -nE "(zoho-sync/src/)?sync\.ts:[0-9]+" -- ':!node_modules' | grep -vE "booksHub|crmHub|hubSync"
git grep -nE "hubSync\.ts:[0-9]+"
git grep -nE "schema\.sql:[0-9]+"
git grep -nE "migrate\.test\.ts:[0-9]+"
git grep -nE "(appHarness|routes\.test|backfill\.test)\.ts:[0-9]+"
```

Qué mirar en cada resultado:

- `sync.ts`: solo cambió **en su sitio** la línea 14 y se añadieron líneas desde el final de `syncContacts`. Las citas por debajo de ese punto (hoy, línea 286) no se mueven. Comprobar que ninguna cita apunta a la zona nueva.
- `hubSync.ts`: la cadena del ciclo pasa de una línea a cinco. Las citas que caen dentro o detrás de `scheduleHubSync` (`openspec/specs/zoho-sync/spec.md` cita `hubSync.ts:79-95`, `:87-89`, `:88-95` y `:91-94`) **ya no casaban** con el árbol de `main` antes de este cambio; su contenido se lee contra la revisión en que se escribieron (caso B de la regla). No se renumeran a ciegas: anotarlas en el PR como pendientes de quien mantenga esa spec.
- `schema.sql`, `migrate.test.ts`, `appHarness.ts` y `routes.test.ts`: la línea nueva va al final o la edición es en la misma línea; ninguna cita existente se desplaza.

El hook `pre-push` hará la comprobación mecánica al publicar (Task 6); este paso es la lectura humana que el hook no hace.

- [ ] **Step 3: Nada de datos reales**

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de clientes, cuentas, agentes y
> números de ticket son justo lo que no puede acabar en un repositorio público: meterlos dentro del
> propio comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un
> fichero fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no
> existe, la comprobación no está hecha: no se puede dar por buena.

- [ ] **Step 4: Árbol limpio**

Run: `git status -sb`
Expected: `## feat/historia-pendiente-hub` sin ficheros modificados ni sin trackear.

Run: `git log --oneline origin/main..HEAD`
Expected: tres commits, uno por tarea (Tasks 2, 3 y 4), con mensajes sin tildes y sin atribución.

---

### Task 6: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita antes del push. Recordar: **este PR no trae migración manual** (la `ALTER` la aplica `migrate()` al arrancar el worker), y **el despliegue lo hace el usuario en EasyPanel, no el agente**.

- [ ] **Step 2: Push y PR**

```bash
git push -u origin feat/historia-pendiente-hub
```

El hook `pre-push` comprueba las citas. Si bloquea, reparar la cita que nombra (sin `--no-verify`, que no es una salida legítima según `CLAUDE.md`).

PR contra `main` titulado `feat(hub-sync): rellenar desk.ticket_history desde Zoho`, explicando:

- Por qué no basta `backfillTicketHistory` (solo mira si hay alguna historia; un cambio de fase posterior no se volvería a pedir).
- Qué hace la marca `history_synced_at` y por qué guarda el `modified_time` leído y no `now()`.
- Que es trabajo fuera de las tandas del plan de Desk 2.0: lo necesita el KPI «Tickets de Servicio Técnico en plazo» de SalesTracker, que lee `desk.ticket_history` del hub.
- Las citas de `openspec/specs/zoho-sync/spec.md` sobre `hubSync.ts` anotadas en la Task 5 y que la fila del worker de esa spec (cadena `syncRecent → syncActivities → syncContacts`) queda desactualizada.
- La nota de despliegue y seguimiento del Step 3.

Esperar al CI (`typecheck`, `lint --max-warnings 165`, `test:coverage`, `build`) en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar solo con la confirmación del usuario.

- [ ] **Step 3: Nota de despliegue y seguimiento (la ejecuta el usuario)**

1. El usuario redepliega el servicio `hub-sync` en EasyPanel. Al arrancar, `migrate()` aplica `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS history_synced_at timestamptz` en `zoho-hub` (y la App, en su próximo arranque, en `desk-db`, donde queda sin usar).
2. En el log del worker aparecen, en cada ciclo con trabajo, líneas `Historia pendiente: X de Y tickets`. Con fallos, el motivo del primero.
3. Seguimiento en la base `zoho-hub`, repitiendo cada pocos ciclos:

```sql
SELECT count(*), count(DISTINCT ticket_id) FROM desk.ticket_history;
SELECT count(*) FILTER (WHERE history_synced_at IS NULL) FROM desk.tickets;
```

El primer número crece y el segundo baja de 50 en 50 por ciclo hasta 0 (unos 16 ciclos, algo menos de una hora con el intervalo por omisión). Si el segundo deja de bajar, mirar el motivo del primer fallo en el log. Si, ya en 0, el log sigue mostrando los mismos tickets en cada ciclo sin que cambien en Zoho, es la hipótesis de precisión de `modified_time` del «Contexto verificado».

---

## Fuera de alcance

- La parte de SalesTracker (§4 de la spec): consulta al hub, lógica pura del KPI y la fila de la tabla.
- Rellenar `desk.ticket_transitions` en el hub.
- Reescribir `backfillTicketHistory` o la ruta admin que lo usa: siguen como están.
- Actualizar `openspec/specs/zoho-sync/spec.md`: sus requisitos cambian por el proceso de cambios de `openspec` del repositorio, no desde este plan. Se deja anotado en el PR.
