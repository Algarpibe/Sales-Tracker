# Tratos ganados por la hora de entrada en la fase, parte 1: el worker rellena `stage_modified_time` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Este plan NO se ejecuta en SalesTracker.** Se ejecuta en el **clon de `ambientalia-desk`** que ya existe en
> `C:\dev\ambientalia-desk` (Git Bash: `/c/dev/ambientalia-desk`), en una **rama nueva creada desde `origin/main`**:
> `feat/hora-fase-ganada-crm`. Todas las rutas y comandos de este documento son relativos a la raíz de ese clon.
> La parte de SalesTracker (§4 de la spec) tiene su propio plan.

**Goal:** El worker `hub-sync` rellena `crm.deals.stage_modified_time` en `zoho-hub` con la hora real en que cada trato ganado entró en su fase, leída de la ficha individual de Zoho CRM, y el listado deja de borrarla.

**Architecture:** El módulo Deals deja de pedir y mapear `Stage_Modified_Time` (el listado de Zoho lo da siempre nulo), así que `upsertRow` ya no toca la columna. Una columna nueva `crm.deals.stage_detail_synced_at` guarda el `modified_time` del trato en el momento en que se leyó su ficha. Un método nuevo de `createCrmSync`, `syncPendingWonStages({ limite, pausaMs })`, elige los tratos ganados con la marca nula o anterior a `modified_time`, pide `GET /Deals/{id}` y guarda la hora y la marca. `scheduleHubSync` lo llama en el temporizador de CRM detrás de `crmSync.syncRecent()`, con su propio `catch`.

**Tech Stack:** Node 22 + TypeScript 5.6, `pg` sin ORM, vitest 3.2 con pg-mem 3.0.

**Spec:** `salestracker-pro/docs/superpowers/specs/2026-09-24-tratos-ganados-fase-crm-design.md` (en el repositorio de SalesTracker), §3 y la parte del worker de §5.

---

## Contexto para quien ejecuta

- **Repo:** el clon existente `C:\dev\ambientalia-desk`. Todos los comandos se lanzan desde su raíz. El Bash es Git Bash. El clon ya tiene `core.longpaths=true` y `node_modules` instalados; si faltaran, `npm ci` (Task 1).
- **Rama:** `feat/hora-fase-ganada-crm`, creada desde `origin/main` **sin seguimiento**: la rama NO debe tener `origin/main` como upstream (un `git pull` o `git push` sin argumentos apuntaría a `main`). Se crea con `--no-track` y se comprueba en la Task 1. El upstream propio (`origin/feat/hora-fase-ganada-crm`) lo pone el `push -u` de la Task 7. No cambiar de rama ni hacer push hasta la Task 7.
- **Repo público:** los datos de los tests son **inventados** (ids de trato `d1`…`d4`, nombres `Trato d1`, fase de no ganado `Negociacion`). Ningún nombre de cliente, comercial, trato ni importe real en código, tests, comentarios ni mensajes de commit.
- **Commits:** convencionales, en español **sin tildes ni eñes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por tarea.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Prohibido `sed -i`.** Los cambios se hacen con la herramienta de edición (sustitución exacta). El repositorio guarda LF; el CRLF del árbol de trabajo lo pone `core.autocrlf=true` en Windows y git lo normaliza al hacer commit.
- **`CLAUDE.md` del repositorio manda.** Se carga en cada sesión y lo leen también los sub-agentes. De él aplican aquí:
  - **Regla de mutación 4 (citas `ruta:línea`).** Este plan está diseñado para **no desplazar** líneas citadas: en `modules.ts` las ediciones son en la misma línea; en `crmHub/sync.ts` la línea 9 cambia en su sitio y lo nuevo va detrás de `sweep`, al final; en `hubSync.ts` el bloque del temporizador de CRM (líneas 106-110) está **por debajo** de todas las citas que existen de ese fichero, y la función de log va al final; `schema-crm.sql` crece solo por el final. La Task 6 hace el barrido de cierre y corre el detector del hook.
  - **Comentarios sin `ruta:línea`.** Los comentarios nuevos no llevan citas por número: el hook `pre-push` las comprueba y una cita nueva rota bloquea el push.
  - **Sin punto y coma en los comentarios de `schema-crm.sql`.** `migrateCrm` (`packages/zoho-sync/src/crmHub/migrate.ts`) trocea el fichero con `sql.split(';')` a ciegas, comentarios incluidos, igual que `schemaStatements()` hace con el `schema.sql` de Desk.
  - **Las tablas de CRM van SIEMPRE calificadas con `crm.`.** Es lo contrario que las de Desk: aquí no hay `DESK_TABLES` ni `search_path` que las lleve, `schema-crm.sql` las crea todas como `crm.<tabla>` y `pg-mem` resuelve `crm.deals` sin problema (comprobado).
- **Lint:** el CI corre `npm run lint -- --max-warnings 165` (`.github/workflows/ci.yml:41`) y **hoy `npm run lint` da exactamente 165 avisos**: no queda ni un aviso de holgura. El código nuevo no puede añadir ninguno: nada de `any` escrito (`@typescript-eslint/no-explicit-any` está en `warn`), tampoco `as any` en los tests nuevos.
- **Despliegue:** lo hace el usuario en EasyPanel, **nunca el agente**. Este PR no trae script de migración manual: el `ALTER TABLE` lo aplica `migrateCrm()` al arrancar el worker.

## Contexto verificado

Leído en `main` de `ambientalia-desk` (`3f30710`) y comprobado con pg-mem 3.0.14 y vitest 3.2.7 del propio clon, con un script aparte fuera del repositorio:

- **El listado pisa la columna.** El módulo Deals pide `Stage_Modified_Time` en `fields` (`packages/zoho-sync/src/crmHub/modules.ts:26`) y lo mapea a `stage_modified_time: ts(r.Stage_Modified_Time)` en `toRow` (`:27`). `upsertRow` (`packages/zoho-sync/src/crmHub/repo.ts:5-13`) actualiza con `EXCLUDED` **todas** las columnas que trae el `row`, así que cada pasada del listado escribe el nulo que da Zoho. Quitándola del `row`, el `ON CONFLICT ... DO UPDATE` ya no la nombra y la conserva (comprobado en pg-mem).
- **`ts()` no parsea nada**: `const ts = (v) => (v ? String(v) : null)` (`modules.ts:4`). Pasa el texto de Zoho tal cual y es PostgreSQL quien lo convierte. El método nuevo hace lo mismo: `String(ficha.Stage_Modified_Time)`. pg-mem convierte `'2026-08-31T14:33:09-05:00'` en el instante `2026-08-31T19:33:09.000Z` y lo devuelve como `Date`; un texto que no es fecha lanza `Invalid timestamp format` (comprobado), que el método cuenta como fallo.
- **`GET /Deals/{id}`** responde `{ data: [ { ...campos del trato } ] }`, como ya usan `persistLines` (`/Quotes/{id}`, `packages/zoho-sync/src/crmHub/sync.ts:45-52`) y `verifyDeleted` (`:37-42`). CRM v8 responde **204 sin cuerpo** a un id que ya no existe: `res.ok` es verdadero, `readData` devuelve `{}` y no hay ficha. El método lo trata como fallo («sin Stage_Modified_Time»).
- **`crmFetch`** (`packages/zoho-sync/src/crmHub/crmClient.ts:25-29`) antepone `https://<dominio>/crm/v8`, pone el token y reintenta **una** vez ante 401. **No reintenta ante 429**: por eso la pausa entre fichas.
- **pg-mem resuelve la consulta de selección** con los dos parámetros: `stage = ANY($1) AND (stage_detail_synced_at IS NULL OR stage_detail_synced_at < modified_time) ORDER BY modified_time DESC NULLS LAST LIMIT $2`, con `$1` un array JS (`['Cerrado ganado']`). Devuelve `modified_time` como `Date`, y el `UPDATE ... SET stage_detail_synced_at = $2` con ese `Date` guarda el valor exacto. `node-postgres` serializa igual el array en producción.
- **pg-mem NO admite `timestamptz::text`** ni subconsultas correlacionadas: la marca se guarda pasando el `Date` leído, y la selección es una sola consulta simple.
- **Un trato con `modified_time` nulo** entra en la selección (`stage_detail_synced_at IS NULL`) y, marcado con su `modified_time`, saldría en **todas** las pasadas. Se marca con el epoch (`new Date(0)`): `epoch < NULL` es nulo y no vuelve a salir hasta que Zoho le ponga fecha. Comprobado en pg-mem. Todos los tratos de Zoho traen `Modified_Time`, así que es un caso de borde.
- **`ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS ...`** funciona en pg-mem y es idempotente al repetirla. Una sentencia precedida de líneas `-- comentario` también (comprobado): `schema-crm.sql` no tiene hoy ningún comentario, así que es el primero.
- **`migrateCrm` traga los fallos por sentencia** (`crmHub/migrate.ts:12-13`, `console.error` y sigue). **No hay guardián de recuento de `ALTER`** para `schema-crm.sql` (el de `packages/zoho-sync/src/db/migrate.test.ts` solo lee el `schema.sql` de Desk, y `crmHub/migrate.test.ts` solo cuenta tablas). Una `ALTER` rota no pondría nada en rojo por sí sola: el test de la columna de la Task 2 es el que la vigila, y la mutación del Step 6 lo demuestra.
- **El temporizador de CRM** (`apps/hub-sync/src/hubSync.ts:106-110`) hoy solo hace `crmSync.syncRecent().catch(...)`, cada `SYNC_INTERVAL_MS` (180 000 ms por omisión). **No tiene cerrojo** como el de Desk (`syncing`). `CrmSync.syncRecent` en la práctica **no rechaza**: `runAll` (`crmHub/sync.ts:98-105`) recoge el fallo de cada módulo y devuelve `0`.
- **Tiempo de una pasada:** 50 fichas × (500 ms de pausa + una llamada) son unos 40-65 s más el `syncRecent` de CRM, por debajo de los 180 s del intervalo. Si una pasada llegara a solaparse con la siguiente (no hay cerrojo), el peor caso es pedir dos veces la misma ficha y escribir el mismo valor: idempotente.
- **Barrido inicial:** 1029 tratos ganados con la columna nula (spec §1) a 50 por ciclo son 21 ciclos, algo más de una hora con el intervalo por omisión, y unas 1029 llamadas a CRM. Después solo entran los ganados cuyo `modified_time` avanza.
- **Hay un solo objeto que implementa `CrmSync` a mano**: el literal de `apps/hub-sync/src/hubSync.test.ts:118` (test `migra crm.* y backfillea si está vacío`). Dejaría de compilar al añadir el método. No hay otros (`git grep CrmSync`: solo `hub-sync.ts`, que usa `createCrmSync`, y `hubSync.ts`, que solo tipa).
- **Citas existentes de los ficheros que se tocan:** `crmHub/modules.ts:18` y `:18-66` (`openspec/specs/zoho-sync/spec.md`) — las ediciones de `modules.ts` son en la misma línea y no mueven nada. `hubSync.ts` tiene citas hasta la línea 101 (`:79-95`, `:87-89`, `:88-95`, `:91-94`, `:75-101`, `:11-72`, …), todas **por encima** del bloque de CRM y **ya desfasadas en `main`** antes de este cambio (caso B de la regla 4: no se renumeran). `crmHub/sync.ts`, `schema-crm.sql` y los ficheros de test no tienen citas con número.
- **El detector de citas del hook** (`apps/desk/server/citas/cli.ts`) se puede correr a mano con `--sha <rev>` sin hacer push. Sobre `main` hoy: código de salida 0, `línea base ... 0 informadas · 0 caducadas`, 11 abreviadas rotas **informativas** (no bloquean).
- **Línea base medida el 2026-09-23 en `main`:** `typecheck` OK; `lint` 165 avisos, 0 errores; `npm test` `Test Files 133 passed | 1 skipped (134)`, `Tests 1269 passed | 2 skipped (1271)`. Quien ejecuta la vuelve a medir en la Task 1.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `packages/zoho-sync/src/crmHub/schema-crm.sql` | Modificar (al final) | Columna `crm.deals.stage_detail_synced_at`. |
| `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts` | Crear | Tests de la columna, del listado y de `syncPendingWonStages`. |
| `packages/zoho-sync/src/crmHub/modules.ts` | Modificar (en línea, 25-27) | Deals deja de pedir y mapear `Stage_Modified_Time`. |
| `packages/zoho-sync/src/crmHub/sync.ts` | Modificar (línea 9 en su sitio; el método detrás de `sweep`; los tipos y la constante al final) | `CrmSync extends FasesGanadasPendientes`, `FASES_GANADAS`, el método y sus tipos. |
| `apps/hub-sync/src/hubSync.ts` | Modificar (bloque CRM 106-110 y final del fichero) | El paso nuevo en el temporizador de CRM y su log. |
| `apps/hub-sync/src/hubSync.test.ts` | Modificar (import, línea 118 en su sitio, final del fichero) | El `crmSync` falso y cuatro tests del enganche. |

---

### Task 1: Rama sin seguimiento y línea base

**Files:** ninguno.

- [ ] **Step 1: Partir de un `main` limpio y al día**

```bash
cd /c/dev/ambientalia-desk
git status -sb
git fetch origin
```

Expected: `## main...origin/main` sin ficheros modificados ni sin trackear, y sin `[behind N]` tras el `fetch` (si lo hay, `git merge --ff-only origin/main` estando en `main`). Si el árbol no está limpio, **parar** y avisar.

- [ ] **Step 2: Crear la rama sin upstream**

```bash
git switch --no-track -c feat/hora-fase-ganada-crm origin/main
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

Expected: `Switched to a new branch 'feat/hora-fase-ganada-crm'` y, en la segunda orden, `fatal: no upstream configured for branch 'feat/hora-fase-ganada-crm'`. Ese error **es** el resultado correcto. Si la segunda orden imprime `origin/main`, quitarlo con `git branch --unset-upstream` y repetirla.

- [ ] **Step 3: Dependencias y hooks**

Run: `ls node_modules/.bin/tsx && git config core.hooksPath`
Expected: la ruta de `tsx` y `.githooks`. Si falta cualquiera de los dos: `npm ci` (su `prepare` fija `core.hooksPath .githooks`, el hook de citas de `pre-push`).

- [ ] **Step 4: Ejecutar y anotar la línea base**

Run: `npm run typecheck`
Expected: sale con código 0. Anotar: `typecheck base: OK`.

Run: `npm run lint 2>&1 | tail -3`
Expected: `✖ 165 problems (0 errors, 165 warnings)`. **Anotar N** (`lint base: N avisos`). Al final debe seguir siendo exactamente N, y N no puede pasar de 165.

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde. **Anotar** las líneas `Test Files` y `Tests` (medido el 2026-09-23: `133 passed | 1 skipped (134)` y `1269 passed | 2 skipped (1271)`). Al final deben ser **un fichero y 15 pruebas más**.

Run: `node_modules/.bin/tsx apps/desk/server/citas/cli.ts --sha HEAD > /dev/null; echo "exit=$?"`
Expected: `exit=0`.

Si algo de la línea base no está en verde, **parar** y avisar: no se empieza sobre una base rota.

---

### Task 2: La columna `stage_detail_synced_at`

**Files:**
- Create: `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`
- Modify: `packages/zoho-sync/src/crmHub/schema-crm.sql` (al final)

- [ ] **Step 1: Crear el fichero de tests con el de la columna (rojo)**

Crear `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { migrate, type Queryable } from '../db/migrate'
import { migrateCrm } from './migrate'

const GANADO = 'Cerrado ganado'

let db: Queryable
beforeEach(async () => { const pg = newDb().adapters.createPg(); db = new pg.Pool(); await migrate(db); await migrateCrm(db) })

/** Un trato del hub con su fase, su `modified_time` y, si se da, la marca de la última ficha leída. */
const trato = (id: string, stage: string, modificado: string | null, leido: string | null = null) =>
  db.query(
    'INSERT INTO crm.deals (id, deal_name, stage, modified_time, stage_detail_synced_at) VALUES ($1,$2,$3,$4,$5)',
    [id, `Trato ${id}`, stage, modificado ? new Date(modificado) : null, leido ? new Date(leido) : null],
  )

const fila = async (id: string): Promise<{ stage_modified_time: Date | null; stage_detail_synced_at: Date | null }> =>
  (await db.query('SELECT stage_modified_time, stage_detail_synced_at FROM crm.deals WHERE id = $1', [id])).rows[0]

describe('esquema · stage_detail_synced_at', () => {
  it('crm.deals tiene la columna y nace nula', async () => {
    await trato('d1', GANADO, '2026-08-01T15:00:00Z')
    expect((await fila('d1')).stage_detail_synced_at).toBeNull()
  })
})
```

`vi`, `config` y el ayudante `json` no se declaran todavía: los añade la Task 3, que es la primera que los usa. Así cada commit pasa `lint` sin variables sin usar.

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`
Expected: FAIL en `crm.deals tiene la columna y nace nula`: pg-mem dice que la columna `stage_detail_synced_at` no existe.

- [ ] **Step 3: Añadir la columna al final de `schema-crm.sql`**

Añadir **al final** de `packages/zoho-sync/src/crmHub/schema-crm.sql`, detrás de la última sentencia (`CREATE INDEX IF NOT EXISTS idx_crm_qli_quote ON crm.quote_line_items (quote_id);`), con una línea en blanco delante:

```sql

-- Marca de la ficha del trato ya leida por hub-sync para traer Stage_Modified_Time, que el listado de Zoho da siempre nulo. Guarda el modified_time del trato leido al elegirlo, no la hora de la pasada, asi que un trato con modified_time posterior vuelve a elegirse
--
-- Calificada con crm como todo este fichero. Y sin el caracter de punto y coma en estos comentarios, que migrateCrm parte el fichero por el
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS stage_detail_synced_at timestamptz;
```

Comprobar que los comentarios no tienen ningún `;`:

Run: `tail -4 packages/zoho-sync/src/crmHub/schema-crm.sql | grep -c ';'`
Expected: `1` (solo el de la propia `ALTER`).

- [ ] **Step 4: Ver el verde**

Run: `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts packages/zoho-sync/src/crmHub/migrate.test.ts`
Expected: PASS, todas.

- [ ] **Step 5: Comprobar que la sentencia se aplica sin avisos**

Run: `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts 2>&1 | grep -c "migrateCrm: sentencia omitida"`
Expected: `0`. `migrateCrm` traga los fallos por sentencia: un `1` o más significa que alguna sentencia del fichero falló en silencio.

- [ ] **Step 6: Mutación del fichero vigilado (regla de mutación 2)**

No hay guardián de recuento de `ALTER` para `schema-crm.sql`, así que el vigilante es el test de la columna. Ensuciar el fichero: cambiar temporalmente la sentencia nueva a `ALTER TABLE crm.deal ADD COLUMN IF NOT EXISTS stage_detail_synced_at timestamptz;` (tabla inexistente) y volver a correr el Step 4.
Expected: FAIL en `crm.deals tiene la columna y nace nula` (y en la salida, `migrateCrm: sentencia omitida: ... ALTER TABLE crm.deal ...`).

Deshacer con la herramienta de edición, dejando `ALTER TABLE crm.deals ...`, y repetir el Step 4 hasta verde. Run: `git status --short` — solo los dos ficheros de esta tarea.

- [ ] **Step 7: Commit**

```bash
git add packages/zoho-sync/src/crmHub/schema-crm.sql packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts
git commit -m "feat(zoho-sync): agregar crm.deals.stage_detail_synced_at para la ficha de CRM"
```

---

### Task 3: El listado deja de pisar `stage_modified_time`

**Files:**
- Modify: `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts` (imports y al final)
- Modify: `packages/zoho-sync/src/crmHub/modules.ts:25-27` (en línea, sin añadir líneas)

- [ ] **Step 1: Escribir los tests (rojo)**

En `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`, sustituir:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
```
por:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
```

Sustituir:
```ts
import { migrateCrm } from './migrate'

const GANADO = 'Cerrado ganado'
```
por:
```ts
import { migrateCrm } from './migrate'
import { createCrmSync } from './sync'
import { byTable } from './modules'
import type { AppConfig } from '../config'

const config = {} as AppConfig
const GANADO = 'Cerrado ganado'
```

Y añadir **al final** del fichero:

```ts

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('listado de tratos · stage_modified_time', () => {
  it('el módulo Deals ya no pide Stage_Modified_Time ni lo mapea', () => {
    const m = byTable('deals')
    expect(m.fields.split(',')).not.toContain('Stage_Modified_Time')
    expect(m.toRow({ id: 'd1', Stage_Modified_Time: '2026-08-31T14:33:09-05:00', Modified_Time: '2026-08-31T19:40:00Z' }))
      .not.toHaveProperty('stage_modified_time')
  })

  /**
   * `upsertRow` actualiza con EXCLUDED todas las columnas del `row`. Si `stage_modified_time` siguiera
   * en él, cada pasada del listado escribiría el nulo que da Zoho y borraría la hora de la ficha.
   */
  it('sincronizar un trato por el listado conserva su stage_modified_time y su marca', async () => {
    await trato('d1', GANADO, '2026-08-31T19:40:00Z', '2026-08-31T19:40:00Z')
    await db.query('UPDATE crm.deals SET stage_modified_time = $1 WHERE id = $2', [new Date('2026-08-31T19:33:09Z'), 'd1'])
    const crmFetch = vi.fn().mockImplementation(async (path: string) =>
      path.startsWith('/Deals?')
        // Así responde el listado de Zoho: Stage_Modified_Time siempre nulo.
        ? json({ data: [{ id: 'd1', Deal_Name: 'Trato d1', Stage: GANADO, Stage_Modified_Time: null, Modified_Time: '2026-09-01T15:00:00Z' }], info: { more_records: false } })
        : json({ data: [], info: { more_records: false } }))
    const sync = createCrmSync({ crmFetch, db, config })

    const r = await sync.syncRecent()

    expect(r.deals).toBe(1)
    const f = await fila('d1')
    expect(f.stage_modified_time?.toISOString()).toBe('2026-08-31T19:33:09.000Z')
    expect(f.stage_detail_synced_at?.toISOString()).toBe('2026-08-31T19:40:00.000Z')
  })
})
```

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`
Expected: FAIL en las 2 pruebas nuevas: la primera porque `fields` contiene `Stage_Modified_Time`; la segunda con `expected undefined to be '2026-08-31T19:33:09.000Z'` (el listado dejó `stage_modified_time` en nulo). La de la columna sigue en verde.

- [ ] **Step 3: Quitar el campo del módulo Deals, en las mismas líneas**

En `packages/zoho-sync/src/crmHub/modules.ts`, tres sustituciones exactas, cada una **en su misma línea**.

Línea 25, sustituir:
```ts
    table: 'deals', apiName: 'Deals',
```
por:
```ts
    table: 'deals', apiName: 'Deals', // Sin Stage_Modified_Time: el listado de Zoho lo da siempre nulo y pisaría el de la ficha, que trae syncPendingWonStages (crmHub/sync.ts).
```

Línea 26, sustituir:
```ts
N_mero_Ticket,Stage_Modified_Time,Created_Time,Modified_Time',
```
por:
```ts
N_mero_Ticket,Created_Time,Modified_Time',
```

Línea 27, sustituir:
```ts
numero_ticket: num(r.N_mero_Ticket), stage_modified_time: ts(r.Stage_Modified_Time), created_time: ts(r.Created_Time),
```
por:
```ts
numero_ticket: num(r.N_mero_Ticket), created_time: ts(r.Created_Time),
```

La columna `stage_modified_time` **se queda** en `schema-crm.sql`: la rellena la Task 4.

Run: `wc -l packages/zoho-sync/src/crmHub/modules.ts`
Expected: `75` (el mismo número de líneas que en `main`).

- [ ] **Step 4: Ver el verde**

Run: `npx vitest run packages/zoho-sync/src/crmHub`
Expected: PASS, todas (incluidas `modules.test.ts`, que sigue exigiendo `Modified_Time` en `fields`, y `repo.test.ts`).

- [ ] **Step 5: Mutación**

Volver a poner temporalmente ` stage_modified_time: ts(r.Stage_Modified_Time),` en el `toRow` de la línea 27 (sin tocar `fields`) y correr el Step 4.
Expected: FAIL en las dos pruebas de `listado de tratos · stage_modified_time`.

Deshacer con la herramienta de edición y repetir el Step 4 hasta verde.

- [ ] **Step 6: Commit**

```bash
git add packages/zoho-sync/src/crmHub/modules.ts packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts
git commit -m "fix(zoho-sync): el listado de tratos deja de pisar stage_modified_time"
```

---

### Task 4: `syncPendingWonStages`

**Files:**
- Modify: `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts` (import y al final)
- Modify: `packages/zoho-sync/src/crmHub/sync.ts` (línea 9 en su sitio; líneas 127-130 al final)
- Modify: `apps/hub-sync/src/hubSync.test.ts:118` (en línea)

- [ ] **Step 1: Escribir los tests (rojo)**

En `packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`, sustituir:
```ts
import { createCrmSync } from './sync'
```
por:
```ts
import { createCrmSync, FASES_GANADAS } from './sync'
```

Y añadir **al final** del fichero:

```ts

/** Zoho: la ficha de cada trato trae su `Stage_Modified_Time`, con desfase de Bogotá como en producción. Un id sin hora da 404. */
const fichas = (horas: Record<string, string>) => vi.fn().mockImplementation(async (path: string) => {
  const id = path.split('/')[2]
  return id in horas ? json({ data: [{ id, Stage: GANADO, Stage_Modified_Time: horas[id] }] }) : json({}, 404)
})

/** Los ids de trato cuya ficha se pidió, en el orden en que se pidieron. */
const pedidos = (crmFetch: ReturnType<typeof vi.fn>) => crmFetch.mock.calls.map((c) => String(c[0]).split('/')[2])

const sinPausa = { pausaMs: 0 }

describe('syncPendingWonStages', () => {
  /** Tiene que coincidir con WON_DEAL_STAGES de SalesTracker, que es quien cuenta los tratos ganados. */
  it('las fases ganadas son las de SalesTracker', () => {
    expect(FASES_GANADAS).toEqual(['Cerrado ganado'])
  })

  it('elige los ganados nunca leídos o modificados después, e ignora los no ganados y los que están al día', async () => {
    await trato('d1', GANADO, '2026-08-01T15:00:00Z')
    await trato('d2', GANADO, '2026-09-02T15:00:00Z', '2026-08-20T15:00:00Z')
    await trato('d3', GANADO, '2026-08-10T15:00:00Z', '2026-08-10T15:00:00Z')
    await trato('d4', 'Negociacion', '2026-09-03T15:00:00Z')
    const crmFetch = fichas({ d1: '2026-08-01T09:00:00-05:00', d2: '2026-09-02T09:00:00-05:00', d3: '2026-08-10T09:00:00-05:00', d4: '2026-09-03T09:00:00-05:00' })
    const sync = createCrmSync({ crmFetch, db, config })

    const r = await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })

    expect(r).toEqual({ intentados: 2, poblados: 2, fallidos: 0 })
    expect(pedidos(crmFetch).sort()).toEqual(['d1', 'd2'])
  })

  /**
   * La hora es la de la ficha, como instante: 14:33:09 en Bogotá son las 19:33:09 UTC. La marca es el
   * `modified_time` LEÍDO al elegir el trato, no la hora de la pasada.
   */
  it('guarda la hora de la ficha y marca con el modified_time leído', async () => {
    await trato('d1', GANADO, '2026-08-31T19:40:00Z')
    const sync = createCrmSync({ crmFetch: fichas({ d1: '2026-08-31T14:33:09-05:00' }), db, config })

    await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })

    const f = await fila('d1')
    expect(f.stage_modified_time?.toISOString()).toBe('2026-08-31T19:33:09.000Z')
    expect(f.stage_detail_synced_at?.toISOString()).toBe('2026-08-31T19:40:00.000Z')
  })

  it('un trato que cambia mientras se lee su ficha vuelve a salir en la pasada siguiente', async () => {
    await trato('d1', GANADO, '2026-08-31T19:40:00Z')
    const base = fichas({ d1: '2026-08-31T14:33:09-05:00' })
    const crmFetch = vi.fn().mockImplementation(async (path: string) => {
      // El listado lo modifica justo mientras se pide su ficha.
      await db.query('UPDATE crm.deals SET modified_time = $1 WHERE id = $2', [new Date('2026-08-31T20:00:00Z'), 'd1'])
      return base(path)
    })
    const sync = createCrmSync({ crmFetch, db, config })

    await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })

    expect(await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1, poblados: 1 })
  })

  /**
   * El invariante de la pasada: un fallo NO corta los demás, y el trato fallido NO se marca, así que
   * la pasada siguiente lo vuelve a intentar sin hacer nada especial.
   */
  it('un fallo de Zoho en un trato no corta la pasada y ese trato queda sin marcar', async () => {
    await trato('d1', GANADO, '2026-08-01T15:00:00Z')
    await trato('d2', GANADO, '2026-09-01T15:00:00Z')
    const crmFetch = fichas({ d2: '2026-09-01T09:00:00-05:00' })
    const sync = createCrmSync({ crmFetch, db, config })

    const r = await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })

    expect(r).toMatchObject({ intentados: 2, poblados: 1, fallidos: 1 })
    expect(r.motivoPrimerFallo).toBe('CRM /Deals/d1 404')
    expect((await fila('d1')).stage_detail_synced_at).toBeNull()
    expect((await fila('d2')).stage_modified_time?.toISOString()).toBe('2026-09-01T14:00:00.000Z')

    crmFetch.mockClear()
    expect(await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1 })
    expect(pedidos(crmFetch)).toEqual(['d1'])
  })

  /**
   * Un trato ganado sin hora en la ficha es una anomalía: se cuenta como fallo y NO se marca, para que
   * se vea en el log y en la consulta de seguimiento en vez de quedar nulo en silencio.
   */
  it('una ficha sin Stage_Modified_Time cuenta como fallo y no se marca', async () => {
    await trato('d1', GANADO, '2026-08-01T15:00:00Z')
    const crmFetch = vi.fn().mockImplementation(async () => json({ data: [{ id: 'd1', Stage: GANADO, Stage_Modified_Time: null }] }))
    const sync = createCrmSync({ crmFetch, db, config })

    const r = await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })

    expect(r).toMatchObject({ intentados: 1, poblados: 0, fallidos: 1, motivoPrimerFallo: 'CRM /Deals/d1 sin Stage_Modified_Time' })
    expect(await fila('d1')).toEqual({ stage_modified_time: null, stage_detail_synced_at: null })
  })

  it('respeta el límite y empieza por los modificados más recientemente', async () => {
    await trato('d1', GANADO, '2026-08-01T15:00:00Z')
    await trato('d2', GANADO, '2026-09-20T15:00:00Z')
    await trato('d3', GANADO, '2026-09-01T15:00:00Z')
    const crmFetch = fichas({ d1: '2026-08-01T09:00:00-05:00', d2: '2026-09-20T09:00:00-05:00', d3: '2026-09-01T09:00:00-05:00' })
    const sync = createCrmSync({ crmFetch, db, config })

    const r = await sync.syncPendingWonStages({ ...sinPausa, limite: 2 })

    expect(r).toMatchObject({ intentados: 2, poblados: 2 })
    expect(pedidos(crmFetch)).toEqual(['d2', 'd3'])
    expect((await fila('d1')).stage_detail_synced_at).toBeNull()
  })

  /**
   * Sin `modified_time` no hay valor leído que guardar, y marcarlo con nulo lo haría salir en TODAS
   * las pasadas. Se marca con el epoch: se lee una vez y no vuelve hasta que Zoho le ponga fecha.
   */
  it('un trato sin modified_time se lee una vez y no vuelve a salir', async () => {
    await trato('d1', GANADO, null)
    const sync = createCrmSync({ crmFetch: fichas({ d1: '2026-08-01T09:00:00-05:00' }), db, config })

    expect(await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 1, poblados: 1 })
    expect(await sync.syncPendingWonStages({ ...sinPausa, limite: 50 })).toMatchObject({ intentados: 0 })
  })
})
```

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`
Expected: FAIL en las 8 pruebas de `syncPendingWonStages`: la primera porque `FASES_GANADAS` es `undefined`, las demás con `TypeError: sync.syncPendingWonStages is not a function`. Las 3 de antes siguen en verde.

- [ ] **Step 3: Declarar la interfaz sin mover líneas de `CrmSync`**

En `packages/zoho-sync/src/crmHub/sync.ts`, en la **misma línea 9**, sustituir:
```ts
export interface CrmSync { backfillAll(): Promise<CrmCounts>;
```
por:
```ts
export interface CrmSync extends FasesGanadasPendientes { backfillAll(): Promise<CrmCounts>;
```

- [ ] **Step 4: Implementar el método, los tipos y la constante al final**

En `packages/zoho-sync/src/crmHub/sync.ts`, sustituir el final del fichero (líneas 127-130):
```ts
    return reports
  }
  return { backfillAll: () => runAll(backfillModule), syncRecent: () => runAll(incrementalModule), backfillIfEmpty, sweep }
}
```
por:
```ts
    return reports
  }
  /**
   * Trae la hora de entrada en la fase de los tratos ganados cuya copia puede estar desfasada: los que
   * nunca se han leído (`stage_detail_synced_at` nulo) y los que Zoho ha modificado después de la última
   * vez (`stage_detail_synced_at` anterior a `modified_time`). Lo corre el worker en cada ciclo de CRM.
   *
   * Hace falta la ficha porque el listado de Zoho da `Stage_Modified_Time` siempre nulo y COQL rechaza
   * la columna. Solo se piden los ganados, por economía de llamadas: el KPI no necesita las demás fases.
   *
   * - La hora se guarda como la da la ficha, igual que `ts()` en los módulos: PostgreSQL convierte el
   *   texto con su desfase en el instante.
   * - La marca es el `modified_time` LEÍDO al elegir el trato, no `now()`: si Zoho lo cambia mientras se
   *   lee su ficha, su `modified_time` avanza y la pasada siguiente lo vuelve a elegir.
   * - Un trato sin `modified_time` se marca con el epoch: se lee una vez y no vuelve a salir hasta que
   *   Zoho le ponga fecha. Marcarlo con nulo lo haría salir en todas las pasadas.
   * - Tolerante: un fallo (HTTP, ficha vacía o sin hora, texto que no es fecha) se cuenta, se guarda el
   *   motivo del primero y se sigue. El trato fallido no se marca y vuelve a salir en la pasada siguiente.
   * - Una sola consulta simple: pg-mem, el motor de los tests, no resuelve subconsultas correlacionadas.
   */
  async function syncPendingWonStages({ limite, pausaMs = 500 }: FasesGanadasOpts): Promise<ResultadoFasesGanadas> {
    const r = await db.query(
      `SELECT id, modified_time FROM crm.deals
       WHERE stage = ANY($1) AND (stage_detail_synced_at IS NULL OR stage_detail_synced_at < modified_time)
       ORDER BY modified_time DESC NULLS LAST LIMIT $2`,
      [FASES_GANADAS, limite],
    )
    const tanda = r.rows as { id: string; modified_time: Date | null }[]
    let poblados = 0, fallidos = 0
    let motivoPrimerFallo: string | undefined
    for (const [i, t] of tanda.entries()) {
      if (i > 0 && pausaMs > 0) await new Promise((res) => setTimeout(res, pausaMs))
      try {
        const res = await crmFetch(`/Deals/${t.id}`)
        if (!res.ok) throw new Error(`CRM /Deals/${t.id} ${res.status}`)
        const ficha = (await readData(res)).data?.[0]
        if (!ficha?.Stage_Modified_Time) throw new Error(`CRM /Deals/${t.id} sin Stage_Modified_Time`)
        await db.query(
          'UPDATE crm.deals SET stage_modified_time = $1, stage_detail_synced_at = $2 WHERE id = $3',
          [String(ficha.Stage_Modified_Time), t.modified_time ?? new Date(0), t.id],
        )
        poblados++
      } catch (e) {
        fallidos++
        motivoPrimerFallo ??= e instanceof Error ? e.message : String(e)
      }
    }
    return { intentados: tanda.length, poblados, fallidos, motivoPrimerFallo }
  }
  return { backfillAll: () => runAll(backfillModule), syncRecent: () => runAll(incrementalModule), backfillIfEmpty, sweep, syncPendingWonStages }
}

/**
 * Las fases de CRM que cuentan como trato ganado. TIENE QUE COINCIDIR con `WON_DEAL_STAGES` de
 * SalesTracker, que cuenta los ganados por `stage_modified_time`: una fase que esté allí y no aquí
 * contaría tratos cuya hora este worker nunca rellena.
 */
export const FASES_GANADAS: readonly string[] = ['Cerrado ganado']

/**
 * La hora de entrada en la fase ganada que corre el worker `hub-sync`. Va en una interfaz aparte y al
 * final del fichero, como `HistoriaPendiente` en el sync de Desk, para no mover las líneas de arriba.
 */
export interface FasesGanadasPendientes {
  syncPendingWonStages(opts: FasesGanadasOpts): Promise<ResultadoFasesGanadas>
}
export interface FasesGanadasOpts {
  /** Cuántos tratos como mucho en esta pasada. Obligatorio: sin tope, el primer arranque pediría todas las fichas de golpe. */
  limite: number
  /** Espera entre fichas. `crmFetch` no reintenta ante un 429. Por omisión 500 ms, como la historia de Desk. */
  pausaMs?: number
}
export interface ResultadoFasesGanadas {
  intentados: number
  poblados: number
  fallidos: number
  /** Por qué falló el PRIMERO que falló. Ausente si no falló ninguno. */
  motivoPrimerFallo?: string
}
```

`readData` ya está en la línea 11 y `crmFetch` y `db` vienen de los `Deps` de `createCrmSync`. No hace falta ningún import nuevo. `FASES_GANADAS` se declara después de `createCrmSync` pero solo se lee al llamar al método, cuando el módulo ya está evaluado.

- [ ] **Step 5: Ver el verde del paquete**

Run: `npx vitest run packages/zoho-sync/src/crmHub`
Expected: PASS; `sync.fasesGanadas.test.ts` con 11 pruebas.

- [ ] **Step 6: Completar el `crmSync` falso de `hubSync.test.ts`**

Sin esto, `npm run typecheck` falla: el literal ya no cumple `CrmSync`.

En `apps/hub-sync/src/hubSync.test.ts`, en la **misma línea 118**, sustituir:
```ts
    const crmSync = { backfillAll: async () => ({}), syncRecent: async () => ({}), backfillIfEmpty: vi.fn(async () => ({})), sweep: async () => [] }
```
por:
```ts
    const crmSync = { backfillAll: async () => ({}), syncRecent: async () => ({}), backfillIfEmpty: vi.fn(async () => ({})), sweep: async () => [], syncPendingWonStages: async () => ({ intentados: 0, poblados: 0, fallidos: 0 }) }
```

Run: `git grep -n "CrmSync\b" -- '*.ts'`
Expected: solo `apps/hub-sync/src/hub-sync.ts`, `apps/hub-sync/src/hubSync.ts` y `packages/zoho-sync/src/crmHub/sync.ts`. Ningún otro objeto implementa `CrmSync` a mano.

Run: `npm run typecheck`
Expected: sale con código 0.

- [ ] **Step 7: Mutaciones (regla de mutación, `CLAUDE.md`)**

Cada una se aplica con la herramienta de edición, se corre `npx vitest run packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts`, se comprueba el rojo y se deshace:

1. `[String(ficha.Stage_Modified_Time), t.modified_time ?? new Date(0), t.id]` → `[String(ficha.Stage_Modified_Time), new Date(), t.id]`. Expected: FAIL en `guarda la hora de la ficha y marca con el modified_time leído` y `un trato que cambia mientras se lee su ficha…`.
2. `t.modified_time ?? new Date(0)` → `t.modified_time`. Expected: FAIL en `un trato sin modified_time se lee una vez…`.
3. `WHERE stage = ANY($1) AND (` → `WHERE (stage = ANY($1) OR true) AND (`. Expected: FAIL en `elige los ganados…` (entra `d4`, que no está ganado). Comprobado que pg-mem acepta la sentencia mutada y devuelve el no ganado.
4. `ORDER BY modified_time DESC NULLS LAST` → `ORDER BY modified_time ASC NULLS LAST`. Expected: FAIL en `respeta el límite y empieza por los modificados más recientemente`.
5. Borrar la línea `if (!ficha?.Stage_Modified_Time) throw new Error(...)`. Expected: FAIL en `una ficha sin Stage_Modified_Time cuenta como fallo…` (se marca y cuenta como poblado).
6. `['Cerrado ganado']` en `FASES_GANADAS` → `['Ganado']`. Expected: FAIL en `las fases ganadas son las de SalesTracker` y en los que esperan fichas pedidas.

Run después de deshacer las seis: `git diff packages/zoho-sync/src/crmHub/sync.ts | grep -c "new Date(0)"`
Expected: `1`. Y la suite del Step 5 otra vez en verde.

- [ ] **Step 8: Suite completa**

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde; un fichero y 11 pruebas más que en la línea base.

- [ ] **Step 9: Commit**

```bash
git add packages/zoho-sync/src/crmHub/sync.ts packages/zoho-sync/src/crmHub/sync.fasesGanadas.test.ts apps/hub-sync/src/hubSync.test.ts
git commit -m "feat(zoho-sync): leer de la ficha de CRM la hora de entrada en la fase ganada"
```

---

### Task 5: El enganche en `scheduleHubSync`

**Files:**
- Modify: `apps/hub-sync/src/hubSync.test.ts` (import y al final del `describe('scheduleHubSync')`)
- Modify: `apps/hub-sync/src/hubSync.ts` (import, bloque CRM 106-110 y final del fichero)

- [ ] **Step 1: Escribir los tests (rojo)**

En `apps/hub-sync/src/hubSync.test.ts`, sustituir:
```ts
import type { BooksHubSync } from '@ambientalia/zoho-sync/booksHub/sync'
```
por:
```ts
import type { BooksHubSync } from '@ambientalia/zoho-sync/booksHub/sync'
import type { CrmSync, ResultadoFasesGanadas } from '@ambientalia/zoho-sync/crmHub/sync'
```

(`hubSync.test.ts` no tiene citas con número en el repositorio: añadir una línea arriba no desfasa nada.)

Y sustituir el final del fichero:
```ts
    expect(errores).toHaveBeenCalledWith('Historia pendiente falló:', expect.any(Error))
    errores.mockRestore()
  })
})
```
por:
```ts
    expect(errores).toHaveBeenCalledWith('Historia pendiente falló:', expect.any(Error))
    errores.mockRestore()
  })

  /** Un CRM que apunta el orden en que se le llama. `falla` hace rechazar el listado o las fichas. */
  function crmQueApunta(orden: string[], falla: 'listado' | 'fichas' | null = null, resultado: ResultadoFasesGanadas = { intentados: 0, poblados: 0, fallidos: 0 }): CrmSync {
    return {
      backfillAll: async () => ({}),
      backfillIfEmpty: async () => ({}),
      sweep: async () => [],
      syncRecent: vi.fn(async () => { orden.push('listado'); if (falla === 'listado') throw new Error('CRM 500'); return {} }),
      syncPendingWonStages: vi.fn(async () => { orden.push('fichas'); if (falla === 'fichas') throw new Error('CRM 429'); return resultado }),
    }
  }

  /**
   * Las fichas van DESPUÉS del listado, porque `syncRecent` es quien avanza el `modified_time` y la fase
   * que deciden qué fichas faltan.
   */
  it('CRM: lee las fichas de los ganados después del listado, con límite de 50', async () => {
    vi.useFakeTimers()
    const orden: string[] = []
    const crmSync = crmQueApunta(orden)
    const stop = scheduleHubSync({ sync: mockSync(), crmSync, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(orden).toEqual(['listado', 'fichas'])
    expect(crmSync.syncPendingWonStages).toHaveBeenCalledWith({ limite: 50 })
  })

  /** Las fichas pendientes ya están en el hub: un listado que falla no es motivo para no leerlas. */
  it('CRM: un fallo del listado no impide leer las fichas', async () => {
    vi.useFakeTimers()
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const orden: string[] = []
    const stop = scheduleHubSync({ sync: mockSync(), crmSync: crmQueApunta(orden, 'listado'), intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(orden).toEqual(['listado', 'fichas'])
    expect(errores).toHaveBeenCalledWith('CRM syncRecent falló:', expect.any(Error))
    errores.mockRestore()
  })

  it('CRM: un fallo de las fichas lo recoge su propio catch', async () => {
    vi.useFakeTimers()
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const orden: string[] = []
    const stop = scheduleHubSync({ sync: mockSync(), crmSync: crmQueApunta(orden, 'fichas'), intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(orden).toEqual(['listado', 'fichas'])
    expect(errores).toHaveBeenCalledWith('Fases ganadas pendientes falló:', expect.any(Error))
    errores.mockRestore()
  })

  it('CRM: deja rastro en el log solo cuando la pasada de fichas hizo algo', async () => {
    vi.useFakeTimers()
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const conTrabajo = { intentados: 3, poblados: 2, fallidos: 1, motivoPrimerFallo: 'CRM /Deals/d2 404' }
    const stop = scheduleHubSync({ sync: mockSync(), crmSync: crmQueApunta([], null, conTrabajo), intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    expect(logs).toHaveBeenCalledWith('Fases ganadas: 2 de 3 tratos, 1 fallidos (primero: CRM /Deals/d2 404)')

    logs.mockClear()
    const stop2 = scheduleHubSync({ sync: mockSync(), crmSync: crmQueApunta([]), intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    stop2()
    expect(logs.mock.calls.some((c) => String(c[0]).startsWith('Fases ganadas'))).toBe(false)
    logs.mockRestore()
  })
})
```

- [ ] **Step 2: Ver el rojo**

Run: `npx vitest run apps/hub-sync`
Expected: FAIL en las 4 pruebas nuevas: `orden` sale `['listado']`, sin `'fichas'`, y no hay log. Las 10 de antes, en verde.

- [ ] **Step 3: Implementar el paso en el temporizador de CRM**

En `apps/hub-sync/src/hubSync.ts`, sustituir el import (línea 8, en su sitio):
```ts
import type { CrmSync } from '@ambientalia/zoho-sync/crmHub/sync'
```
por:
```ts
import type { CrmSync, ResultadoFasesGanadas } from '@ambientalia/zoho-sync/crmHub/sync'
```

Dentro de `scheduleHubSync`, sustituir:
```ts
  if (crmSync) {
    timers.push(setInterval(() => {
      crmSync.syncRecent().catch((e) => console.error('CRM syncRecent falló:', e))
    }, intervalMs))
  }
```
por:
```ts
  if (crmSync) {
    timers.push(setInterval(() => {
      crmSync.syncRecent()
        .catch((e) => console.error('CRM syncRecent falló:', e))
        // Las fichas de los ganados van DESPUÉS del listado, que avanza el modified_time que decide
        // cuáles faltan, y con su propio catch: un Zoho que falla al leerlas no afecta al listado.
        .then(() => crmSync.syncPendingWonStages({ limite: 50 }))
        .then(registrarFasesGanadas, (e) => console.error('Fases ganadas pendientes falló:', e))
    }, intervalMs))
  }
```

Y añadir **al final del fichero**, detrás de `registrarHistoria`:

```ts

/** Deja rastro en el log solo cuando la pasada de fichas ha hecho algo: un ciclo sin pendientes no dice nada. */
function registrarFasesGanadas(r: ResultadoFasesGanadas): void {
  if (r.intentados === 0) return
  const fallos = r.fallidos > 0 ? `, ${r.fallidos} fallidos (primero: ${r.motivoPrimerFallo})` : ''
  console.log(`Fases ganadas: ${r.poblados} de ${r.intentados} tratos${fallos}`)
}
```

El bloque de CRM empieza en la línea 106, por debajo de todas las citas de `hubSync.ts` que hay en el repositorio (la más baja llega a la 101): las cuatro líneas nuevas no desplazan ninguna.

- [ ] **Step 4: Ver el verde**

Run: `npx vitest run apps/hub-sync`
Expected: PASS, 14 pruebas.

Run: `npm run typecheck`
Expected: código 0.

- [ ] **Step 5: Mutaciones de posición y de aislamiento (reglas de mutación 1 y 2)**

Cada una con la herramienta de edición, correr `npx vitest run apps/hub-sync`, comprobar el rojo y deshacer:

1. **Posición:** intercambiar las dos llamadas: la primera línea pasa a `crmSync.syncPendingWonStages({ limite: 50 })` y el `.then(() => crmSync.syncPendingWonStages({ limite: 50 }))` pasa a `.then(() => crmSync.syncRecent())`. Expected: FAIL en `CRM: lee las fichas de los ganados después del listado…` (el orden sale `['fichas', 'listado']`).
2. **Aislamiento del listado:** borrar la línea `.catch((e) => console.error('CRM syncRecent falló:', e))`. Expected: FAIL en `CRM: un fallo del listado no impide leer las fichas` (el orden sale `['listado']`).
3. **Aislamiento de las fichas:** dejar `.then(registrarFasesGanadas)` sin el segundo argumento. Expected: FAIL en `CRM: un fallo de las fichas lo recoge su propio catch` (y vitest informa de un rechazo sin recoger).
4. **Log:** borrar `if (r.intentados === 0) return` de `registrarFasesGanadas`. Expected: FAIL en `CRM: deja rastro en el log solo cuando…` (la pasada vacía escribe `Fases ganadas: 0 de 0 tratos`).

Tras deshacer, repetir el Step 4 hasta verde.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-sync/src/hubSync.ts apps/hub-sync/src/hubSync.test.ts
git commit -m "feat(hub-sync): rellenar la hora de entrada en la fase ganada en cada ciclo de CRM"
```

---

### Task 6: Verificación completa y cierre

**Files:** ninguno (salvo que el barrido de citas encuentre algo que reparar).

- [ ] **Step 1: Las tres puertas**

Run: `npm run typecheck`
Expected: código 0.

Run: `npm run lint 2>&1 | tail -3`
Expected: `0 errors` y **exactamente N avisos**, el N anotado en la Task 1 (165). Si sube, el aviso nuevo es de este cambio: localizarlo con `npx eslint packages/zoho-sync/src/crmHub apps/hub-sync/src` y arreglarlo, **no** subir el techo.

Run: `npm test 2>&1 | tail -6`
Expected: todo en verde, **un fichero y 15 pruebas más** que en la línea base (11 del fichero nuevo y 4 de `hubSync.test.ts`; la línea 118 se modificó, no se añadió). Con la línea base del 2026-09-23: `134 passed | 1 skipped (135)` y `1284 passed | 2 skipped (1286)`.

- [ ] **Step 2: Detector de citas, como lo corre el hook (sin push)**

Run: `node_modules/.bin/tsx apps/desk/server/citas/cli.ts --sha HEAD | head -12; echo "exit=${PIPESTATUS[0]}"`
Expected: `exit=0`, `línea base ... 0 informadas · 0 caducadas` y ninguna cita bloqueante. Las abreviadas rotas son informativas y deben ser las mismas 11 de `main` (comparar con `git stash` no hace falta: correr el mismo comando con `--sha origin/main` y comparar el recuento `abreviadas rotas`).

- [ ] **Step 3: Barrido de citas (regla de mutación 4)**

El detector comprueba que la línea exista; este paso es la lectura humana que no hace.

```bash
git diff --stat origin/main..HEAD
git grep -nE "modules\.ts:[0-9]+" | grep -iE "crm"
git grep -nE "crmHub/sync\.ts:[0-9]+|schema-crm\.sql:[0-9]+"
git grep -nE "hubSync\.ts:[0-9]+"
git grep -nE "hubSync\.test\.ts:[0-9]+|fasesGanadas"
```

Qué mirar en cada resultado:

- `modules.ts`: solo cambiaron **en su sitio** las líneas 25-27 (`wc -l` sigue en 75). Las citas `crmHub/modules.ts:18` y `:18-66` de `openspec/specs/zoho-sync/spec.md` no se mueven. La de `:18-66` ya no casaba del todo con `main` antes de este cambio (el array cierra en la 64); no se toca.
- `crmHub/sync.ts` y `schema-crm.sql`: sin citas con número.
- `hubSync.ts`: el bloque de CRM crece cuatro líneas a partir de la 106 y `registrarFasesGanadas` va al final. Todas las citas existentes (`:79-95`, `:87-89`, `:88-95`, `:91-94`, `:75-101`, `:11-72`, `:10-20`, `:45-48`, `:57-58`, `:38-43`, `:40`, `:13`, `:14`, `:19`) apuntan por encima de la 106. Varias **ya no casaban** con `main` antes de este cambio (caso B de la regla); no se renumeran a ciegas: anotarlas en el PR como pendientes de quien mantenga `openspec/specs/zoho-sync/spec.md`.
- La fila «Worker | 3 | CRM, `crmSync.syncRecent`» de esa spec queda desactualizada (ahora es `syncRecent` → `syncPendingWonStages`): se anota en el PR, no se edita desde aquí.

- [ ] **Step 4: Nada de datos reales**

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Para los nombres, el patrón **no se escribe en ningún comando ni fichero del repositorio**: se lee de un fichero de fuera, un término por línea, y el script solo imprime números. Crear el script **fuera del repositorio**, junto al fichero de nombres:

```bash
NOMBRES_DIR="/c/Users/algar/AppData/Local/Temp/claude/c--Users-algar-OneDrive-Documentos-Antigravity-Curso-Josema-Fernandez-SalesTracker-salestracker-pro-0-81/edf13d5e-a6ff-48d1-9742-7abb556dc32b/scratchpad"
cat > "$NOMBRES_DIR/fugas.mjs" <<'EOF'
// Uso: git diff <rango> | node fugas.mjs <fichero-de-terminos>
// Busca, sin distinguir mayusculas, cada termino del fichero en las lineas AÑADIDAS del diff.
// Solo imprime numeros de linea y recuentos: nunca el termino ni la linea, para no repetir la fuga.
import { readFileSync } from 'node:fs'
const terminos = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean)
if (terminos.length === 0) { console.error('fichero de terminos vacio: comprobacion NO hecha'); process.exit(2) }
const lineas = readFileSync(0, 'utf8').split(/\r?\n/)
let hallazgos = 0
lineas.forEach((l, i) => {
  if (!l.startsWith('+') || l.startsWith('+++')) return
  const n = terminos.filter((t) => l.toLowerCase().includes(t)).length
  if (n > 0) { hallazgos++; console.log(`linea ${i + 1} del diff: ${n} termino(s)`) }
})
console.log(`terminos: ${terminos.length} · lineas con coincidencia: ${hallazgos}`)
process.exit(hallazgos > 0 ? 1 : 0)
EOF
git diff origin/main..HEAD | node "$NOMBRES_DIR/fugas.mjs" "$NOMBRES_DIR/nombres-reales.txt"; echo "exit=$?"
```

Expected: `terminos: 8 · lineas con coincidencia: 0` y `exit=0`. Con `exit=1`, abrir la línea del diff indicada, sustituir el dato por uno inventado **en un commit nuevo** (nunca `--amend`) y repetir. Con `exit=2` o si el fichero de nombres no existe, la comprobación **no está hecha** y no se puede dar por buena: parar y avisar.

- [ ] **Step 5: Árbol limpio y rama sin `origin/main` como upstream**

Run: `git status -sb`
Expected: `## feat/hora-fase-ganada-crm` sin `...origin/main` y sin ficheros modificados ni sin trackear.

Run: `git log --oneline origin/main..HEAD`
Expected: cuatro commits, uno por tarea (Tasks 2, 3, 4 y 5), con mensajes sin tildes ni eñes y sin atribución.

Run: `git log --format=%B origin/main..HEAD | grep -ciE "co-authored-by|claude|anthropic|[áéíóúñ]"`
Expected: `0`.

---

### Task 7: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita antes del push. Recordar: **este PR no trae migración manual** (la `ALTER` la aplica `migrateCrm()` al arrancar el worker), **el despliegue lo hace el usuario en EasyPanel, no el agente**, y **el PR de SalesTracker no se despliega hasta que termine el barrido** (spec §5, regla 4).

- [ ] **Step 2: Push y PR**

```bash
git push -u origin feat/hora-fase-ganada-crm
```

El hook `pre-push` comprueba las citas. Si bloquea, reparar la cita que nombra (sin `--no-verify`, que no es una salida legítima según `CLAUDE.md`). Tras el push, `git rev-parse --abbrev-ref @{u}` debe dar `origin/feat/hora-fase-ganada-crm`, nunca `origin/main`.

PR contra `main` titulado `feat(hub-sync): rellenar crm.deals.stage_modified_time desde la ficha de CRM`, explicando:

- Por qué el listado no sirve: `GET /Deals?fields=…` da `Stage_Modified_Time` siempre nulo, COQL rechaza la columna, y solo la ficha `GET /Deals/{id}` la trae. Y por qué el listado además la borraba (`upsertRow` actualiza con `EXCLUDED` todo el `row`).
- Qué hace la marca `stage_detail_synced_at` y por qué guarda el `modified_time` leído y no `now()`.
- Que solo se piden los ganados (`FASES_GANADAS`, que tiene que coincidir con `WON_DEAL_STAGES` de SalesTracker), y que una ficha sin hora cuenta como fallo y se reintenta.
- Que lo necesita la fila «Tratos cerrados ganados» de SalesTracker, que pasa a contar por `stage_modified_time` en hora de Bogotá, y el orden de despliegue del Step 3.
- Las citas de `openspec/specs/zoho-sync/spec.md` sobre `hubSync.ts` anotadas en la Task 6 y que la fila del worker de CRM de esa spec queda desactualizada.

Esperar al CI (`typecheck`, `lint --max-warnings 165`, `test:coverage`, `build`) en verde —comprobando el estado real con `gh pr checks` si el comando devuelve un código raro— y fusionar solo con la confirmación del usuario.

- [ ] **Step 3: Nota de despliegue y seguimiento (la ejecuta el usuario)**

1. El usuario redepliega el servicio `hub-sync` en EasyPanel. Al arrancar, `migrateCrm()` aplica `ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS stage_detail_synced_at timestamptz` en `zoho-hub`. En el log **no** debe aparecer `migrateCrm: sentencia omitida`.
2. En el log del worker aparecen, en cada ciclo de CRM con trabajo, líneas `Fases ganadas: X de Y tratos`. Con fallos, el motivo del primero.
3. Seguimiento en la base `zoho-hub` (spec §5), repitiendo cada pocos ciclos:

```sql
SELECT count(*) FILTER (WHERE stage_modified_time IS NULL) AS pendientes, count(*) AS ganados
FROM crm.deals WHERE stage = 'Cerrado ganado';
```

`pendientes` baja de 50 en 50 por ciclo hasta 0: con los 1029 ganados de la spec, unos 21 ciclos, algo más de una hora con el intervalo por omisión. Si deja de bajar, mirar el motivo del primer fallo en el log. Si se queda en un número pequeño que no llega a 0, son tratos ganados cuya ficha no trae hora (fallo `sin Stage_Modified_Time`): anotar cuántos y avisar antes de desplegar SalesTracker, porque la regla 4 los deja fuera de la cuenta.
4. **Solo con `pendientes = 0`** se fusiona y despliega el PR de SalesTracker (su propio plan).

---

## Fuera de alcance

- La parte de SalesTracker (§4 de la spec): `getHubWonDealsMonth` por `stage_modified_time` en hora de Bogotá y el E2E.
- Replicar el historial de fases completo (`Stage_History`) o la hora de entrada en fases que no sean ganadas (spec §6).
- Añadir un cerrojo al temporizador de CRM como el `syncing` de Desk: una pasada cabe holgada en el intervalo y un solape solo repetiría escrituras idempotentes.
- Actualizar `openspec/specs/zoho-sync/spec.md`: sus requisitos cambian por el proceso de cambios de `openspec` del repositorio, no desde este plan. Se deja anotado en el PR.
