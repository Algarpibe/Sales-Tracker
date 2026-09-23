# Detalle de tickets en plazo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al pulsar una cifra mensual de la fila «Tickets de Servicio Técnico en plazo» se abre un diálogo con los episodios que componen ese porcentaje (ticket, cliente, entrada, salida, horas laborables y estado) y, aparte y atenuados, los que no cuentan.

**Architecture:** La consulta del hub que ya existe añade el número del ticket y el nombre del cliente con dos `LEFT JOIN`. Una sola función pura, `clasificarEpisodio`, decide el estado y las horas de cada episodio; de ella salen la celda (`contarTicketsEnPlazo`) y el detalle (`detalleTicketsMes`), así que no pueden discrepar. El diálogo es un componente presentacional nuevo en su propio fichero, y la tabla le pasa el detalle ya calculado con el mismo `ahora` que usó para la celda.

**Tech Stack:** Next 16, @tanstack/react-query, base-ui (`Dialog` de `src/components/ui/dialog.tsx`), node-postgres contra el hub, vitest (entorno node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-kpi-tickets-detalle-design.md`. Reglas del KPI: `docs/superpowers/specs/2026-09-23-kpi-tickets-en-plazo-design.md`, §2.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-tickets-detalle`, ya creada. No cambiar de rama y no hacer push hasta la Task 9.
- **Repo público:** ningún nombre real de cliente, persona, comercial ni número de ticket real en código, tests, semilla, comentarios ni documentación. Los ids (`T-FICT-001`…), los números (`9001`…) y las cuentas («Cliente Ficticio A»…) son inventados. Los **nombres de fase** de Zoho Desk sí son reales y hacen falta tal cual.
- **Commits:** convencionales, en español **sin tildes ni eñes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por task.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Nada de `sed -i`:** los ficheros tocados tienen finales CRLF en la copia de trabajo y `sed -i` los reescribe enteros en LF. Editar con la herramienta Edit.
- **Lint:** baseline de exactamente **10 warnings y 0 errores**. Cada task solo añade lo que usa: una constante o un import sin usar suma un warning.
- **Vitest** corre en entorno node y no hay librería de tests de componentes: solo se prueban funciones puras. El diálogo lo cubre el E2E. Hoy: **271 pasados + 1 saltado**.
- **Sin migración** de la base de la app. Lo que cambia es el hub falso de los E2E.
- **E2E:** hoy **51/51**. Docker Desktop tiene que estar arrancado (arrancarlo si no lo está); `E2E_PG_PORT=55433` siempre; el puerto 3100 libre antes de cada ejecución; `npm run e2e:db:reset` recrea las dos bases; **esperar 60 s entre ejecuciones de Playwright** (el login admite 5 intentos por minuto y el setup gasta 3).
- **Fechas:** nunca `Date` local para instantes del hub. La lógica pura lee la hora de Bogotá con `MS_OFFSET` y los `getUTC*`; el formato para pantalla usa `Intl.DateTimeFormat` con `timeZone: "America/Bogota"`. Ninguno depende de la zona horaria del proceso.

## Contexto verificado

- `CambioFase` y `Episodio` viven en `src/lib/kpi-tickets.ts`. Sus únicos consumidores son `src/db/hub-kpi.ts` (`getHubCommercialNotificationChanges`), `src/actions/kpi-actions.ts` (`getKpiTicketsChanges`, que solo reenvía el tipo y no hay que tocar) y `commercial-kpi-table.tsx`.
- **Añadir campos obligatorios a `CambioFase` rompe `tsc` en `hub-kpi.ts`** si no se añaden a la vez en la consulta. Por eso la Task 2 cambia tipos, lógica y consulta en el mismo commit, y la Task 1 prepara antes el hub falso para que la consulta con los `LEFT JOIN` funcione en los E2E.
- **Esquema real del hub** (`ambientalia-desk`, `packages/zoho-sync/src/db/schema.sql`): `tickets (id text PRIMARY KEY, number integer UNIQUE NOT NULL, account_id text, …)` y `accounts (id text PRIMARY KEY, name text NOT NULL, …)`. El hub falso copia esos tipos y solo esas columnas.
- **Tests con `toEqual` sobre `Episodio`** en `src/lib/__tests__/kpi-tickets.test.ts`: líneas 117, 133, 144, 156, 165-168, 173, 192, 206 y 215-218. Hay que actualizarlos todos en la Task 2. También los helpers `cambio` (línea 94) y `episodio` (línea 222), que construyen `CambioFase` y `Episodio` literales.
- `contarTicketsEnPlazo` hoy solo cuenta un medible si `fin !== null`, y un abierto si ya suma `PLAZO_HORAS`. Cualquier otro caso no cuenta. `clasificarEpisodio` conserva exactamente eso: todo lo que no es medible con `fin` ni abierto se clasifica como excluido.
- **Celdas pulsables hoy:** `breakdownSourceFor` devuelve `null` para `tickets_st`, así que su celda nunca es botón. Las de ventas y tratos exigen `v > 0` porque una suma de 0 no tiene nada que desglosar. En tickets, **0,0 % sí tiene episodios** (todos fuera de plazo), así que la condición es `v !== null`: «—» no abre nada, 0,0 % sí.
- `Dialog` de `src/components/ui/dialog.tsx` es **base-ui**: `Dialog` acepta `open` y `onOpenChange(open)`; `DialogContent` pinta ya su botón de cerrar; `DialogTitle` da nombre accesible al diálogo (el E2E existente usa `getByRole("dialog", { name: /Gestionar/ })`).
- `formatPct(value, decimals = 1)` es `` `${value.toFixed(decimals)}%` `` → `60.0%`. `MONTHS[i].full` es «Febrero», con mayúscula.
- **Semilla de febrero**, verificada evento a evento con `horasLaborables` (febrero no tiene festivos en Colombia; `L` es el primer lunes de febrero del año en curso):

  | Ticket | Número | Cuenta | Entrada → salida | Horas | Estado |
  |---|---|---|---|---|---|
  | T-FICT-001 | 9001 | Cliente Ficticio A | L 9:00 → L 11:00, «Notificación cliente» (fase con doble espacio en la semilla) | 2 | en plazo |
  | T-FICT-002 | 9002 | Cliente Ficticio B | L 9:00 → X 9:00, «Notificación cliente» | 8 + 9 + 1 = 18 | fuera |
  | T-FICT-003 | 9003 | (sin cuenta) | L 10:00 → M 9:00, «En espera de SKU inventario» | 7 + 1 = 8 | en plazo |
  | T-FICT-004 | 9004 | Cliente Ficticio C | L 9:00 → L 12:00, «Por Facturar» | — | **excluido** |
  | T-FICT-005 (1) | 9005 | Cliente Ficticio A | L 9:00 → L 10:00, «Notificación cliente» | 1 | en plazo |
  | T-FICT-005 (2) | 9005 | Cliente Ficticio A | J 9:00 → L+7 9:00, «Notificación cliente» | 8 + 9 + 1 = 18 | fuera |
  | T-FICT-006 | 9006 | Cliente Ficticio B | entra el año anterior (fuera de la ventana) | — | no aparece |

  Febrero: **3 en plazo de 5 → 60.0 %**; «No cuentan» solo tiene **T-FICT-004 (#9004)**. Orden de «cuentan»: #9002 (18 h, entra L 9:00), #9005 (18 h, entra J 9:00), #9003 (8 h), #9001 (2 h), #9005 (1 h). Los dos de 18 h empatan: el desempate por entrada lo fija este plan (ver «Decisiones de este plan»).

## Decisiones de este plan (no están en la spec)

1. **Desempate del orden.** La spec pide «de más horas a menos» sin decir qué hacer con un empate, y la semilla tiene uno (18 h y 18 h). Se desempata por entrada ascendente y, si coincide, por `ticketId`, para que el orden sea determinista y el E2E pueda fijarlo.
2. **Horas de un excluido.** `clasificarEpisodio` devuelve `horas: 0` como dice la spec, pero el diálogo pinta «—» en esa columna: un «0.0» se leería como «se resolvió al instante», y lo cierto es que no se midió.
3. **Mismo `ahora` para celda y detalle.** El `useMemo` de las filas calcula `ahora` una vez y lo devuelve junto a las filas; el detalle lo reutiliza. Así un episodio abierto que cruza las 12 h entre el pintado y el clic no puede hacer que el pie diga otra cosa que la celda.
4. **Un ticket sin cuenta en la semilla.** T-FICT-003 no tiene `account_id`: el E2E comprueba de punta a punta que el `LEFT JOIN` lo mantiene en el KPI con cliente «—».

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/db/hub-schema.sql` | Modificar | `desk.accounts` y `desk.tickets` mínimas. |
| `e2e/db/seed-hub.mjs` | Modificar | Cuentas y tickets ficticios de T-FICT-001..006. |
| `src/lib/kpi-tickets.ts` | Modificar | `CambioFase` y `Episodio` con número, cliente y fase de salida; `clasificarEpisodio`; `contarTicketsEnPlazo` sobre ella; `detalleTicketsMes`; `formatoInstanteBogota`. |
| `src/lib/__tests__/kpi-tickets.test.ts` | Modificar | Tests actualizados y nuevos. |
| `src/db/hub-kpi.ts` | Modificar | Dos `LEFT JOIN` y dos columnas en `getHubCommercialNotificationChanges`. |
| `src/components/charts/comercial/tickets-detalle-dialog.tsx` | Crear | Diálogo presentacional del detalle. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Celdas de `tickets_st` pulsables, estado `celdaTickets`, `ahora` compartido y el diálogo. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Test del diálogo de febrero. |

---

### Task 1: Tickets y cuentas en el hub falso

**Files:**
- Modify: `e2e/db/hub-schema.sql` (al final)
- Modify: `e2e/db/seed-hub.mjs:97-139` (tras `eventosTicketsFicticios`) y `:264-274` (inserción y log)

- [ ] **Step 1: Añadir las tablas al esquema del hub falso**

Con Edit, al final de `e2e/db/hub-schema.sql`, tras el `CREATE TABLE desk.ticket_history (...)`, añadir:

```sql

-- Tickets y cuentas de Desk: solo las columnas que une src/db/hub-kpi.ts para poner
-- numero y cliente al detalle del KPI de tickets en plazo. Tipos del esquema real.
-- Sin FOREIGN KEY a proposito: en el hub real un ticket puede apuntar a una cuenta
-- que todavia no se ha replicado, y la consulta usa LEFT JOIN por eso mismo.
CREATE TABLE desk.accounts (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE desk.tickets (
  id         text PRIMARY KEY,
  number     integer UNIQUE NOT NULL,
  account_id text
);
```

- [ ] **Step 2: Añadir cuentas y tickets ficticios a la semilla**

Con Edit, en `e2e/db/seed-hub.mjs`, justo después del cierre de `eventosTicketsFicticios` (la línea `}` que sigue a `  }));`) y antes de `export async function seedHub`, insertar:

```js

// Cuentas y tickets del hub falso para el detalle del KPI de tickets en plazo. Numeros y
// nombres INVENTADOS: el repositorio es publico. T-FICT-003 no tiene cuenta a proposito:
// prueba de punta a punta que la consulta usa LEFT JOIN y no pierde el episodio, que
// sale con cliente "—".
const CUENTAS_FICTICIAS = [
  { id: "ACC-FICT-A", name: "Cliente Ficticio A" },
  { id: "ACC-FICT-B", name: "Cliente Ficticio B" },
  { id: "ACC-FICT-C", name: "Cliente Ficticio C" },
];
const TICKETS_FICTICIOS = [
  { id: "T-FICT-001", number: 9001, account_id: "ACC-FICT-A" },
  { id: "T-FICT-002", number: 9002, account_id: "ACC-FICT-B" },
  { id: "T-FICT-003", number: 9003, account_id: null },
  { id: "T-FICT-004", number: 9004, account_id: "ACC-FICT-C" },
  { id: "T-FICT-005", number: 9005, account_id: "ACC-FICT-A" },
  { id: "T-FICT-006", number: 9006, account_id: "ACC-FICT-B" },
];
```

Después, con Edit, sustituir:

```js
    const eventosTickets = eventosTicketsFicticios(CURRENT_YEAR);
```

por:

```js
    for (const cuenta of CUENTAS_FICTICIAS) {
      await client.query(`INSERT INTO desk.accounts (id, name) VALUES ($1, $2)`, [cuenta.id, cuenta.name]);
    }
    for (const t of TICKETS_FICTICIOS) {
      await client.query(
        `INSERT INTO desk.tickets (id, number, account_id) VALUES ($1, $2, $3)`,
        [t.id, t.number, t.account_id],
      );
    }

    const eventosTickets = eventosTicketsFicticios(CURRENT_YEAR);
```

y la línea del log:

```js
    console.log(`  hub sembrado: ${ITEMS.length} items, ${orders} pedidos, ${invoices} facturas, ${deals} tratos, ${eventosTickets.length} eventos de tickets`);
```

por:

```js
    console.log(`  hub sembrado: ${ITEMS.length} items, ${orders} pedidos, ${invoices} facturas, ${deals} tratos, ${TICKETS_FICTICIOS.length} tickets, ${eventosTickets.length} eventos de tickets`);
```

- [ ] **Step 3: Recrear las bases y comprobar la semilla**

Arrancar Docker Desktop si no lo está.

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina con `Listo.` y la línea `hub sembrado: ... 6 tickets, 17 eventos de tickets`.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT t.id, t.number, a.name FROM desk.tickets t LEFT JOIN desk.accounts a ON a.id = t.account_id ORDER BY t.id"`
Expected: seis filas; `T-FICT-003 | 9003 |` con el nombre vacío y las demás con su «Cliente Ficticio X». Pegar la salida.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/hub-schema.sql e2e/db/seed-hub.mjs
git commit -m "test(e2e): tickets y cuentas ficticios en el hub falso"
```

---

### Task 2: Número, cliente y fase de salida en los episodios

**Files:**
- Modify: `src/lib/kpi-tickets.ts:112-128` (tipos) y `:146-185` (`episodiosNotificacionComercial`)
- Modify: `src/db/hub-kpi.ts:203-227`
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

- [ ] **Step 1: Actualizar los helpers y las expectativas existentes**

Con Edit en `src/lib/__tests__/kpi-tickets.test.ts`:

Sustituir el helper `cambio` (líneas 94-95):

```ts
const cambio = (ticketId: string, instante: number, desde: string | null, hacia: string | null): CambioFase =>
  ({ ticketId, instante, desde, hacia });
```

por:

```ts
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
```

Con Edit y `replace_all: true`, sustituir (aparece en las líneas 117, 144, 192 y 206):

```ts
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "medible" }]);
```

por:

```ts
    expect(e).toEqual([esperado(100, 200, "medible", "Notificación cliente")]);
```

Sustituir (línea 133):

```ts
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "excluido" }]);
```

por:

```ts
    expect(e).toEqual([esperado(100, 200, "excluido", "Por Facturar")]);
```

Sustituir (línea 156):

```ts
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: 100, estado: "medible" }]);
```

por:

```ts
    expect(e).toEqual([esperado(100, 100, "medible", "Notificación cliente")]);
```

Sustituir (líneas 165-168):

```ts
    expect(e).toEqual([
      { ticketId: "T-FICT-1", inicio: 100, fin: 200, estado: "medible" },
      { ticketId: "T-FICT-1", inicio: 200, fin: null, estado: "abierto" },
    ]);
```

por:

```ts
    expect(e).toEqual([
      esperado(100, 200, "medible", "Notificación cliente"),
      esperado(200, null, "abierto", null),
    ]);
```

Sustituir (línea 173):

```ts
    expect(e).toEqual([{ ticketId: "T-FICT-1", inicio: 100, fin: null, estado: "abierto" }]);
```

por:

```ts
    expect(e).toEqual([esperado(100, null, "abierto", null)]);
```

Sustituir (líneas 215-218):

```ts
    expect(e).toEqual([
      { ticketId: "T-FICT-1", inicio: 100, fin: null, estado: "abierto" },
      { ticketId: "T-FICT-2", inicio: 120, fin: 150, estado: "medible" },
    ]);
```

por:

```ts
    expect(e).toEqual([
      esperado(100, null, "abierto", null),
      esperado(120, 150, "medible", "Notificación cliente", "T-FICT-2"),
    ]);
```

Sustituir el helper `episodio` (líneas 222-223):

```ts
const episodio = (inicio: number, fin: number | null, estado: Episodio["estado"]): Episodio =>
  ({ ticketId: "T-FICT-1", inicio, fin, estado });
```

por:

```ts
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
```

- [ ] **Step 2: Escribir el test nuevo**

Con Edit, dentro de `describe("episodiosNotificacionComercial", ...)`, justo antes de su último test (`it("no mezcla los cambios de tickets distintos", ...)`), insertar:

```ts
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

```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL. Fallan los 10 tests de `episodiosNotificacionComercial` que comparan episodios enteros con `toEqual` (los 9 actualizados y el nuevo: el objeto real no trae `numero`, `cliente` ni `faseSalida`); el resto pasa, incluidos los que solo miran `estado` o `[inicio, fin]`.

- [ ] **Step 4: Ampliar los tipos**

Con Edit en `src/lib/kpi-tickets.ts`, sustituir:

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
```

por:

```ts
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
```

- [ ] **Step 5: Llevar los campos a los episodios**

Con Edit en `episodiosNotificacionComercial`, sustituir:

```ts
    const ordenados = [...lista].sort((a, b) => a.instante - b.instante);
    let abierto: number | null = null;
```

por:

```ts
    const ordenados = [...lista].sort((a, b) => a.instante - b.instante);
    // Un ticket tiene un solo número y una sola cuenta: todos sus cambios traen los mismos.
    const { numero, cliente } = ordenados[0];
    let abierto: number | null = null;
```

sustituir:

```ts
        episodios.push({ ticketId, inicio: abierto, fin: c.instante, estado: medible ? "medible" : "excluido" });
```

por:

```ts
        episodios.push({
          ticketId,
          numero,
          cliente,
          inicio: abierto,
          fin: c.instante,
          faseSalida: c.hacia,
          estado: medible ? "medible" : "excluido",
        });
```

y sustituir:

```ts
    if (abierto !== null) episodios.push({ ticketId, inicio: abierto, fin: null, estado: "abierto" });
```

por:

```ts
    if (abierto !== null) {
      episodios.push({ ticketId, numero, cliente, inicio: abierto, fin: null, faseSalida: null, estado: "abierto" });
    }
```

(`c.hacia` ya está normalizada: `cambios` se construye con `normalizarFase` al principio de la función.)

- [ ] **Step 6: Ampliar la consulta del hub**

Con Edit en `src/db/hub-kpi.ts`, sustituir:

```ts
           s->'propertyValue'->>'updatedValue' AS hacia
    FROM desk.ticket_history h
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.raw->'eventInfo') = 'array' THEN h.raw->'eventInfo' ELSE '[]'::jsonb END
    ) s
    WHERE h.event_name = 'TicketUpdated'
```

por:

```ts
           s->'propertyValue'->>'updatedValue' AS hacia,
           t.number AS numero,
           a.name AS cliente
    FROM desk.ticket_history h
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.raw->'eventInfo') = 'array' THEN h.raw->'eventInfo' ELSE '[]'::jsonb END
    ) s
    LEFT JOIN desk.tickets t  ON t.id = h.ticket_id
    LEFT JOIN desk.accounts a ON a.id = t.account_id
    WHERE h.event_name = 'TicketUpdated'
```

y sustituir:

```ts
    hacia: r.hacia === null ? null : String(r.hacia),
  }));
}
```

por:

```ts
    hacia: r.hacia === null ? null : String(r.hacia),
    numero: r.numero === null ? null : Number(r.numero),
    cliente: r.cliente === null ? null : String(r.cliente),
  }));
}
```

Añadir también, con Edit, al final del bloque de comentarios que precede a `const faseNormalizada` (tras la línea `// encontraba ni un solo cambio. Los nombres salen crudos y los normaliza la lógica pura.`):

```ts
// Número y cliente van con LEFT JOIN: un ticket o una cuenta que aún no esté replicado
// en el hub no puede quitar un episodio del KPI; sale con número o cliente nulo.
```

- [ ] **Step 7: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS, todos.

Run: `npx tsc --noEmit` → sin salida, código 0.

- [ ] **Step 8: Verificar la consulta contra el hub falso**

Con las bases de la Task 1 sembradas:

Run: `HUB_DB_URL=postgres://postgres:postgres@127.0.0.1:55433/zoho_hub_e2e npx tsx -e "import('./src/db/hub-kpi.ts').then(async (m) => { const r = await m.getHubCommercialNotificationChanges(new Date().getFullYear()); console.log(r.length); console.log(r.map((c) => c.ticketId + ' ' + c.numero + ' ' + c.cliente + ' ' + c.desde + ' -> ' + c.hacia).join('\n')); process.exit(0); })"`
Expected: **13** cambios, los mismos que antes, ahora con número y cliente: `T-FICT-001 9001 Cliente Ficticio A`, `T-FICT-002 9002 Cliente Ficticio B`, `T-FICT-003 9003 null`, `T-FICT-004 9004 Cliente Ficticio C`, `T-FICT-005 9005 Cliente Ficticio A` (4 cambios), `T-FICT-006 9006 Cliente Ficticio B` (1). Pegar la salida.

Si `tsx` no resuelve el alias `@/`, lanzar la misma SQL con `psql` sustituyendo `$1` por el año y `$2` por `'Notificación Comercial'`, y decirlo en el informe.

- [ ] **Step 9: Suite, lint y commit**

Run: `npm test`
Expected: **272 pasados + 1 saltado**.

Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts src/db/hub-kpi.ts
git commit -m "feat(kpis): numero, cliente y fase de salida en los episodios de tickets"
```

---

### Task 3: `clasificarEpisodio` y `contarTicketsEnPlazo` sobre ella

**Files:**
- Modify: `src/lib/kpi-tickets.ts` (tras `ConteoTickets`, y `contarTicketsEnPlazo`)
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

- [ ] **Step 1: Escribir los tests**

Con Edit, en el import del principio del test, sustituir:

```ts
  FASE_NOTIFICACION_COMERCIAL,
  contarTicketsEnPlazo,
```

por:

```ts
  FASE_NOTIFICACION_COMERCIAL,
  clasificarEpisodio,
  contarTicketsEnPlazo,
```

Al final del fichero, añadir:

```ts

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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL en los 5 nuevos con `TypeError: clasificarEpisodio is not a function`. El resto pasa.

- [ ] **Step 3: Implementar `clasificarEpisodio`**

Con Edit en `src/lib/kpi-tickets.ts`, sustituir:

```ts
export interface ConteoTickets {
  enPlazo: number[];
  fueraDePlazo: number[];
}
```

por:

```ts
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
 */
export function clasificarEpisodio(e: Episodio, ahora: number): Clasificacion {
  if (e.estado === "medible" && e.fin !== null) {
    const horas = horasLaborables(e.inicio, e.fin);
    return { estado: horas < PLAZO_HORAS ? "en_plazo" : "fuera_de_plazo", horas };
  }
  if (e.estado === "abierto") {
    const horas = horasLaborables(e.inicio, ahora);
    return { estado: horas >= PLAZO_HORAS ? "fuera_de_plazo" : "abierto_sin_vencer", horas };
  }
  return { estado: "excluido", horas: 0 };
}

/** Mes de entrada (0-11) en hora de Bogotá, o null si el episodio entró otro año. */
function mesDeEntrada(e: Episodio, anio: number): number | null {
  const local = new Date(e.inicio + MS_OFFSET);
  return local.getUTCFullYear() === anio ? local.getUTCMonth() : null;
}
```

- [ ] **Step 4: Apoyar el contador en ella**

Con Edit, sustituir el cuerpo del bucle de `contarTicketsEnPlazo`:

```ts
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
```

por:

```ts
  for (const e of episodios) {
    const mes = mesDeEntrada(e, anio);
    if (mes === null) continue;
    const { estado } = clasificarEpisodio(e, ahora);
    if (estado === "en_plazo") enPlazo[mes]++;
    else if (estado === "fuera_de_plazo") fueraDePlazo[mes]++;
  }
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS, todos. Los tests de `ticketsEnPlazoPorMes` y el de «los contadores de los doce meses» no se han tocado y siguen en verde: son los que fijan que el resultado del contador no cambia.

- [ ] **Step 6: Suite, tipos, lint y commit**

Run: `npm test` → **277 pasados + 1 saltado**.
Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "refactor(kpis): clasificar cada episodio de tickets en una sola funcion"
```

---

### Task 4: `detalleTicketsMes`

**Files:**
- Modify: `src/lib/kpi-tickets.ts` (al final)
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

- [ ] **Step 1: Escribir los tests**

Con Edit, en el import del test, sustituir:

```ts
  contarTicketsEnPlazo,
  episodiosNotificacionComercial,
```

por:

```ts
  contarTicketsEnPlazo,
  detalleTicketsMes,
  episodiosNotificacionComercial,
```

Al final del fichero, añadir:

```ts

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
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL en los 5 nuevos con `TypeError: detalleTicketsMes is not a function`. El resto pasa.

- [ ] **Step 3: Implementar**

Con Edit, al final de `src/lib/kpi-tickets.ts` (tras `ticketsEnPlazoPorMes`), añadir:

```ts

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
export function detalleTicketsMes(episodios: Episodio[], anio: number, mes: number, ahora: number): DetalleTicketsMes {
  const cuentan: FilaDetalleTicket[] = [];
  const noCuentan: FilaDetalleTicket[] = [];
  for (const e of episodios) {
    if (mesDeEntrada(e, anio) !== mes - 1) continue;
    const { estado, horas } = clasificarEpisodio(e, ahora);
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
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Suite, tipos, lint y commit**

Run: `npm test` → **282 pasados + 1 saltado**.
Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): detalle por mes de los episodios de tickets en plazo"
```

---

### Task 5: `formatoInstanteBogota`

**Files:**
- Modify: `src/lib/kpi-tickets.ts` (al final)
- Test: `src/lib/__tests__/kpi-tickets.test.ts`

- [ ] **Step 1: Escribir los tests**

Con Edit, en el import del test, sustituir:

```ts
  festivosColombia,
```

por:

```ts
  festivosColombia,
  formatoInstanteBogota,
```

Al final del fichero, añadir:

```ts

describe("formatoInstanteBogota", () => {
  it("pinta la hora de Bogota aunque el dia UTC sea otro", () => {
    // 31 mar 22:00 en Bogota es 1 abr 03:00 UTC.
    expect(formatoInstanteBogota(bog(2026, 3, 31, 22))).toBe("31/03 22:00");
  });

  it("rellena con ceros y pinta la medianoche como 00:00", () => {
    expect(formatoInstanteBogota(bog(2026, 1, 5, 8, 5))).toBe("05/01 08:05");
    expect(formatoInstanteBogota(bog(2026, 2, 2, 0))).toBe("02/02 00:00");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: FAIL en los 2 nuevos con `TypeError: formatoInstanteBogota is not a function`.

- [ ] **Step 3: Implementar**

Con Edit, al final de `src/lib/kpi-tickets.ts`, añadir:

```ts

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
 */
export function formatoInstanteBogota(ms: number): string {
  const p = Object.fromEntries(FORMATO_BOGOTA.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-tickets.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Suite, tipos, lint y commit**

Run: `npm test` → **284 pasados + 1 saltado**.
Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/lib/kpi-tickets.ts src/lib/__tests__/kpi-tickets.test.ts
git commit -m "feat(kpis): formato de instante en hora de Bogota"
```

---

### Task 6: E2E del diálogo (rojo)

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts` (al final)

- [ ] **Step 1: Escribir el test**

Con Edit, al final de `e2e/specs/kpis-comerciales.spec.ts`, añadir:

```ts

test("pulsar el porcentaje de tickets de febrero abre el detalle de sus episodios", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tickets de Servicio Técnico en plazo/ });
  await fila.getByRole("cell").nth(CELDA_FEBRERO).getByRole("button").click();

  const dialogo = page.getByRole("dialog", { name: /Tickets en plazo/ });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Febrero");
  // El pie repite el porcentaje de la celda con el mismo formato: es la
  // autocomprobacion de que el detalle cuadra con la cifra pulsada.
  await expect(dialogo.getByText("3 en plazo de 5 → 60.0%")).toBeVisible();

  // Febrero de la semilla (e2e/db/seed-hub.mjs): cinco episodios que cuentan. Primero
  // los fuera de plazo, de mas horas a menos; T-FICT-002 y el segundo episodio de
  // T-FICT-005 empatan a 18 h y va antes el que entro primero, T-FICT-002.
  const cuentan = dialogo.getByRole("table", { name: "Cuentan para el porcentaje" });
  const filas = cuentan.locator("tbody tr");
  await expect(filas).toHaveCount(5);
  await expect(filas.first()).toContainText("#9002");
  await expect(filas.first()).toContainText("Cliente Ficticio B");
  await expect(filas.first()).toContainText("Fuera de plazo");
  // T-FICT-003 no tiene cuenta en el hub: el LEFT JOIN lo deja en el KPI con cliente "—".
  await expect(filas.filter({ hasText: "#9003" })).toContainText("—");

  // El rechazo de T-FICT-004 no cuenta y sale aparte.
  const noCuentan = dialogo.getByRole("region", { name: "No cuentan para el porcentaje" });
  await expect(noCuentan.locator("tbody tr")).toHaveCount(1);
  await expect(noCuentan).toContainText("#9004");
  await expect(noCuentan).toContainText("Excluido (rechazo)");
  await expect(noCuentan).toContainText("Por Facturar");
});
```

`CELDA_FEBRERO` (= 2) y `abrirComercial` ya existen en el fichero.

- [ ] **Step 2: Ejecutar y verificar que falla**

Docker Desktop arrancado. Comprobar que el puerto 3100 está libre y que han pasado 60 s desde la última ejecución de Playwright.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: falla solo el test nuevo, por tiempo agotado buscando el `button` de la celda de febrero (hoy es un `div`). Los demás del fichero, en verde; en particular los dos de la fila de tickets, que ya leen la semilla con la consulta ampliada de la Task 2. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): el detalle de tickets en plazo se abre desde la celda del mes"
```

---

### Task 7: Diálogo y celdas pulsables (verde)

**Files:**
- Create: `src/components/charts/comercial/tickets-detalle-dialog.tsx`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Crear el diálogo**

Crear `src/components/charts/comercial/tickets-detalle-dialog.tsx`:

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONTHS, formatPct } from "@/lib/constants";
import {
  formatoInstanteBogota,
  type DetalleTicketsMes,
  type EstadoPlazo,
  type FilaDetalleTicket,
} from "@/lib/kpi-tickets";

const ETIQUETA_ESTADO: Record<EstadoPlazo, string> = {
  en_plazo: "En plazo",
  fuera_de_plazo: "Fuera de plazo",
  excluido: "Excluido (rechazo)",
  abierto_sin_vencer: "Abierto, sin vencer",
};

// Solo llevan color los dos estados que deciden el porcentaje: los que no cuentan ya
// van atenuados en su propio apartado.
const COLOR_ESTADO: Record<EstadoPlazo, string> = {
  en_plazo: "text-emerald-500",
  fuera_de_plazo: "text-red-500",
  excluido: "",
  abierto_sin_vencer: "",
};

function textoSalida(f: FilaDetalleTicket): string {
  if (f.fin === null) return "abierto";
  return `${formatoInstanteBogota(f.fin)} → ${f.faseSalida ?? "—"}`;
}

function TablaEpisodios({ filas, etiqueta }: { filas: FilaDetalleTicket[]; etiqueta: string }) {
  return (
    <table aria-label={etiqueta} className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/40 text-left text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Ticket</th>
          <th className="py-1 pr-2 font-medium">Cliente</th>
          <th className="py-1 pr-2 font-medium">Entrada</th>
          <th className="py-1 pr-2 font-medium">Salida</th>
          <th className="py-1 pr-2 text-right font-medium">Horas</th>
          <th className="py-1 font-medium">Estado</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          // Un ticket no puede abrir dos episodios en el mismo instante (una entrada con
          // uno abierto no reinicia el reloj), así que ticket + entrada es única.
          <tr key={`${f.ticketId}-${f.inicio}`} className="border-b border-border/20 align-top">
            <td className="py-1 pr-2 tabular-nums">{f.numero === null ? "—" : `#${f.numero}`}</td>
            <td className="max-w-[180px] truncate py-1 pr-2">{f.cliente ?? "—"}</td>
            <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{formatoInstanteBogota(f.inicio)}</td>
            <td className="py-1 pr-2">{textoSalida(f)}</td>
            {/* Un excluido no se mide: «0.0» se leería como «resuelto al instante». */}
            <td className="py-1 pr-2 text-right tabular-nums">
              {f.estado === "excluido" ? "—" : f.horas.toFixed(1)}
            </td>
            <td className={`whitespace-nowrap py-1 ${COLOR_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Detalle de una celda de «Tickets de Servicio Técnico en plazo». Presentacional: recibe
 * el detalle ya calculado por la tabla con la misma clasificación y el mismo `ahora` que
 * la celda, así que el pie no puede enseñar otro porcentaje. No llama al servidor.
 */
export function TicketsDetalleDialog({
  abierto,
  onCerrar,
  anio,
  mes,
  detalle,
}: {
  abierto: boolean;
  onCerrar: () => void;
  anio: number;
  /** 1-12. */
  mes: number;
  detalle: DetalleTicketsMes | null;
}) {
  // Misma fórmula que ticketsEnPlazoPorMes, para que el redondeo de formatPct coincida.
  const pct = detalle && detalle.total > 0 ? formatPct((detalle.enPlazo / detalle.total) * 100) : "—";
  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-3xl">
        {detalle && (
          <>
            <DialogHeader>
              <DialogTitle>
                Tickets en plazo · {MONTHS[mes - 1].full} {anio}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                De compañía · horas laborables de lunes a viernes, de 8:00 a 17:00 en Bogotá, sin festivos.
              </p>
            </DialogHeader>
            {detalle.cuentan.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Ningún episodio cuenta todavía este mes.</p>
            ) : (
              <TablaEpisodios filas={detalle.cuentan} etiqueta="Cuentan para el porcentaje" />
            )}
            {detalle.noCuentan.length > 0 && (
              <section aria-label="No cuentan para el porcentaje" className="space-y-1 opacity-60">
                <h3 className="text-xs font-medium text-muted-foreground">No cuentan para el porcentaje</h3>
                <TablaEpisodios filas={detalle.noCuentan} etiqueta="No cuentan" />
              </section>
            )}
            <p className="border-t border-border/40 pt-2 font-semibold tabular-nums">
              {`${detalle.enPlazo} en plazo de ${detalle.total} → ${pct}`}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Imports y estado en la tabla**

Con Edit en `commercial-kpi-table.tsx`, sustituir:

```ts
import { episodiosNotificacionComercial, ticketsEnPlazoPorMes } from "@/lib/kpi-tickets";
```

por:

```ts
import { detalleTicketsMes, episodiosNotificacionComercial, ticketsEnPlazoPorMes } from "@/lib/kpi-tickets";
```

sustituir:

```ts
import { InfoTooltip } from "@/components/common/info-tooltip";
```

por:

```ts
import { InfoTooltip } from "@/components/common/info-tooltip";
import { TicketsDetalleDialog } from "@/components/charts/comercial/tickets-detalle-dialog";
```

sustituir:

```ts
const KPIS_DE_COMPANIA = new Set(["incremento_st", "tickets_st"]);
```

por:

```ts
const KPIS_DE_COMPANIA = new Set(["incremento_st", "tickets_st"]);

/** Aspecto de una cifra de mes que abre un detalle. Compartido por ventas, tratos y
 *  tickets para que todas las celdas pulsables se vean igual. */
const CLASE_CELDA_PULSABLE =
  "underline decoration-dotted underline-offset-2 hover:text-primary hover:decoration-solid";
```

y sustituir:

```ts
  const [celda, setCelda] = useState<CeldaSeleccionada | null>(null);
```

por:

```ts
  const [celda, setCelda] = useState<CeldaSeleccionada | null>(null);
  // Celda de tickets pulsada (mes 1-12). Va aparte de `celda`: su detalle es una fila
  // por episodio, no clientes con importes, y lo pinta otro diálogo.
  const [celdaTickets, setCeldaTickets] = useState<{ mes: number } | null>(null);
```

- [ ] **Step 3: Un solo `ahora` para la celda y el detalle**

Con Edit, sustituir:

```ts
    const filas = COMMERCIAL_KPIS.map((def) => {
      const meta = porClave.get(def.key);
```

por:

```ts
    // Un solo instante para la fila de tickets y su detalle: si el detalle calculara el
    // suyo al pulsar, un episodio abierto que cruzara las 12 horas entre medias haría que
    // el pie dijera otra cosa que la celda.
    const ahoraTickets = new Date().getTime();

    const filas = COMMERCIAL_KPIS.map((def) => {
      const meta = porClave.get(def.key);
```

sustituir:

```ts
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, new Date().getTime()), meta, null);
```

por:

```ts
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets), meta, null);
```

sustituir:

```ts
    return { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown };
```

por:

```ts
    return { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown, ahoraTickets };
```

y sustituir:

```ts
  const { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown } = useMemo(() => {
```

por:

```ts
  const { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown, ahoraTickets } = useMemo(() => {
```

- [ ] **Step 4: Calcular el detalle de la celda pulsada**

Con Edit, sustituir:

```ts
  const tipoRegistroLabel = RECORD_TYPES.find((t) => t.value === recordType)?.label ?? recordType;
```

por:

```ts
  const tipoRegistroLabel = RECORD_TYPES.find((t) => t.value === recordType)?.label ?? recordType;
  // Mismos episodios, mismo año y mismo `ahora` que la fila: el detalle sale de la misma
  // clasificación que la cifra pulsada.
  const detalleTickets = celdaTickets
    ? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets)
    : null;
```

- [ ] **Step 5: Celdas de tickets pulsables**

Con Edit, sustituir:

```tsx
                              {origen !== null && v !== null && v > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCelda({ def: f.def, mesIndex: i, rows: origen.rows, serie: origen.serie })}
                                  className="underline decoration-dotted underline-offset-2 hover:text-primary hover:decoration-solid"
                                >
                                  {formatValor(v, f.def.unit)}
                                </button>
                              ) : (
```

por:

```tsx
                              {origen !== null && v !== null && v > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCelda({ def: f.def, mesIndex: i, rows: origen.rows, serie: origen.serie })}
                                  className={CLASE_CELDA_PULSABLE}
                                >
                                  {formatValor(v, f.def.unit)}
                                </button>
                              ) : f.def.key === "tickets_st" && v !== null ? (
                                // v !== null y no v > 0: un 0,0 % tiene episodios (todos
                                // fuera de plazo) y es justo el que más pide explicación.
                                // «—» es un mes sin nada que contar y no abre nada.
                                <button
                                  type="button"
                                  onClick={() => setCeldaTickets({ mes: i + 1 })}
                                  className={CLASE_CELDA_PULSABLE}
                                >
                                  {formatValor(v, f.def.unit)}
                                </button>
                              ) : (
```

- [ ] **Step 6: Pintar el diálogo**

Con Edit, sustituir:

```tsx
      <Dialog
        open={gestionandoProyectos}
```

por:

```tsx
      <TicketsDetalleDialog
        abierto={celdaTickets !== null}
        onCerrar={() => setCeldaTickets(null)}
        anio={year}
        mes={celdaTickets?.mes ?? 1}
        detalle={detalleTickets}
      />
      <Dialog
        open={gestionandoProyectos}
```

(`mes ?? 1` solo existe para el tipo: con `celdaTickets` nulo, `detalle` también es nulo y el diálogo no pinta nada.)

- [ ] **Step 7: Tipos y lint**

Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`. Si aparece uno nuevo por `new Date()` dentro del `useMemo`, comprobar que está copiado tal cual: la misma llamada ya estaba ahí dentro y no sumaba warnings.

- [ ] **Step 8: E2E del fichero en verde**

Esperar 60 s desde la Task 6 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde, incluido el nuevo. Pegar la salida.

- [ ] **Step 9: Commit**

```bash
git add src/components/charts/comercial/tickets-detalle-dialog.tsx src/components/charts/comercial/commercial-kpi-table.tsx
git commit -m "feat(kpis): dialogo de detalle de tickets en plazo"
```

---

### Task 8: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios, tipos y lint**

Run: `npm test`
Expected: **284 pasados + 1 saltado** (271 de hoy + 1 de la Task 2 + 5 de la Task 3 + 5 de la Task 4 + 2 de la Task 5).

Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 2: Suite E2E completa**

Docker Desktop arrancado. Esperar 60 s desde la última ejecución de Playwright y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e`
Expected: **52/52** (los 51 de hoy más el nuevo). Si falla algo fuera de `kpis-comerciales.spec.ts`, leerlo antes de tocar nada y decir en el informe qué era.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-tickets-detalle` sin ficheros modificados.

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

### Task 9: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita al usuario antes de cualquier push. Recordar que este PR **no trae migración** y que en producción el diálogo solo tendrá filas cuando el worker de `ambientalia-desk` haya rellenado `desk.ticket_history`; hasta entonces las celdas son «—» y no se pueden pulsar.

- [ ] **Step 2: Push, PR, CI y fusión (solo tras la confirmación)**

```bash
git push -u origin feat/kpi-tickets-detalle
```

PR contra `main` titulado `feat(kpis): detalle de tickets en plazo por mes`, explicando: la celda mensual de tickets abre un diálogo con los episodios del mes (fuera de plazo primero, de más horas a menos), un apartado atenuado con los que no cuentan y el pie «N en plazo de M → X %»; celda y detalle salen de `clasificarEpisodio` con el mismo `ahora`; la consulta del hub añade número y cliente con `LEFT JOIN`. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Enlace al ticket en Zoho Desk.
- Exportar el detalle.
- Mostrar quién hizo la transición.
- Detalle del resto de filas agregadas (incremento de Servicio Técnico, ingresos por proyectos).
