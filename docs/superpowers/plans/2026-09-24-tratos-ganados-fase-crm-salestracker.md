# Tratos ganados por la hora de entrada en la fase (SalesTracker) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La fila «Tratos cerrados ganados» cuenta cada trato ganado en el mes, en hora de Bogotá, de `crm.deals.stage_modified_time` (el instante en que entró en «Cerrado ganado»), en vez de por `closing_date`.

**Architecture:** Solo cambia la consulta `getHubWonDealsMonth` de `src/db/hub-kpi.ts`: el año y el mes salen de `stage_modified_time AT TIME ZONE 'America/Bogota'`, y un ganado con esa columna nula no cuenta. Firma, forma de salida, filtro por fase y por comercial, acción del servidor, tabla y diálogo de detalle no cambian. El hub falso de los E2E gana la columna y una semilla que hace discrepar a propósito las dos reglas, para que los E2E nuevos fallen con la consulta de hoy y pasen con la nueva.

**Tech Stack:** Next 16, node-postgres contra el hub, Postgres 16 (hub falso en Docker), Playwright, vitest (sin cambios).

**Spec:** `docs/superpowers/specs/2026-09-24-tratos-ganados-fase-crm-design.md`, §4 (Parte 2), más las reglas de §2 y el orden de despliegue de §5. La Parte 1 (worker `hub-sync` de `ambientalia-desk`) va en su propio plan y su propio repositorio.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `fix/tratos-ganados-fase-crm`, ya creada y con la spec comprometida (`9634ccb`). No cambiar de rama y no hacer push hasta la Task 5.
- **Repo público:** ningún nombre real de cliente, persona, comercial ni trato en código, tests, semilla, comentarios ni documentación. Los ids (`DEAL-GX-…`) y las cuentas («Cuenta Ficticia Frontera»…) son inventados. El **nombre de fase** «Cerrado ganado» sí es el real y hace falta tal cual.
- **Commits:** convencionales, en español **sin tildes ni eñes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por task.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Nada de `sed -i`:** los ficheros tocados tienen finales CRLF en la copia de trabajo y `sed -i` los reescribe enteros en LF. Editar con la herramienta Edit.
- **Lint:** baseline de exactamente **10 warnings y 0 errores**.
- **Vitest:** hoy **284 pasados + 1 saltado**. Este plan no añade tests unitarios: el cambio es SQL puro y vitest corre en entorno node sin base de datos. Lo cubren los E2E contra el hub falso.
- **Sin migración** de la base de la app. Lo que cambia es el hub falso de los E2E.
- **E2E:** hoy **52/52**. Docker Desktop tiene que estar arrancado (arrancarlo si no lo está); `E2E_PG_PORT=55433` siempre; el puerto 3100 libre antes de cada ejecución; `npm run e2e:db:reset` recrea las dos bases; **esperar al menos 60 s entre ejecuciones de Playwright** (el login admite 5 intentos por minuto y el setup gasta 3).
- **Fechas:** los instantes de la semilla se construyen en UTC (`Date.UTC`) o con `instanteBogota` (ya existe en `seed-hub.mjs`, UTC−5 fijo). Nunca `Date` local.

## Contexto verificado (código real, 2026-09-23)

- `getHubWonDealsMonth` (`src/db/hub-kpi.ts:95-119`) cuenta por `extract(year|month from d.closing_date)` con `d.stage = ANY($2::text[])` (`WON_DEAL_STAGES`), `d.account_name IS NOT NULL` y `($3::text IS NULL OR d.owner_name = $3)`. Devuelve `DealMonthRow[]` (`account_name`, `mes`, `tratos`). El comentario de encima (líneas 95-98) justifica `closing_date`: hay que reescribirlo.
- `WON_DEAL_STAGES = ["Cerrado ganado"]` (`src/lib/commercial-kpis.ts:50`). No cambia.
- `getKpiWonDealsMonthly` (`src/actions/kpi-actions.ts:129-132`) solo reenvía. No cambia.
- `commercial-kpi-table.tsx`: `ganadosQ` (líneas 280-286) con un comentario que dice «se cuentan por fecha de cierre» → se actualiza el comentario. `ganadosBreakdown` (363-368), la fila `tratos_ganados` con `toMonthlySeries` (391-394) y el diálogo (`monthBreakdown` agrupando por nombre, pie «N cliente(s)» y «Total: N») no cambian. Una celda solo es botón si `v > 0`.
- `tratos_ganados` **no tiene meta** en `e2e/db/seed-app.mjs` (solo `ventas_nuevos` y `ventas_existentes`): cambiar sus conteos no mueve el TOTAL ni la cobertura.
- `e2e/db/hub-schema.sql:55-66`: `crm.deals` tiene `closing_date date` y **no** tiene `stage_modified_time`. El comentario dice que `closing_date` «es la que cuenta para el KPI»: hay que corregirlo.
- `e2e/db/seed-hub.mjs:234-280`: cuatro tratos por mes del año en curso (`CURRENT_YEAR`, derivado de la fecha actual): `DEAL-E-m` y `DEAL-N-m` abiertos («Negociacion»), `DEAL-G-m` ganado («Cerrado ganado», cuenta `Alfa Industrial` salvo agosto en mayúsculas, `closing_date` día 20 del mes, `created_time` el año anterior) y `DEAL-P-m` perdido. Hoy: **48 tratos**, **un ganado por mes**. La inserción es un bucle sobre tuplas de 7 columnas.
- `instanteBogota(anio, mes, dia, hora)` ya existe en `seed-hub.mjs:80-82` a nivel de módulo.
- `getHubDealsMonth` (generación de tratos) cuenta por `created_time` del año: los ganados nuevos se crean el año anterior, como los `DEAL-G-m`, para no mover esas filas.
- `e2e/specs/kpis-comerciales.spec.ts` tiene 12 tests. Los dos de ganados comprueban **enero**: celda «1» y diálogo «1 cliente» / «Total: 1». Enero no cambia con este plan: siguen valiendo tal cual.
- Contenedor `salestracker-postgres-e2e`, usuario `postgres`, base del hub `zoho_hub_e2e`. `MONTHS[i].full` = «Enero», «Marzo»…

## Valores esperados, calculados a mano

Semilla tras la Task 1. `Y` = año en curso. Cada `DEAL-G-m` entra en la fase el día 20 del mes `m` a las 10:00 de Bogotá, el mismo mes que su `closing_date`. Además, tres ganados especiales:

| Id | Cuenta | `closing_date` | `stage_modified_time` (UTC) | Mes Bogotá | Mes UTC | Mes cierre |
|---|---|---|---|---|---|---|
| DEAL-GX-FRONTERA | Cuenta Ficticia Frontera | Y-04-01 | Y-04-01 02:00 (= 31-mar 21:00 Bogotá) | **3** | 4 | 4 |
| DEAL-GX-MES | Cuenta Ficticia Mes Distinto | Y-06-30 | Y-07-02 15:00 (= 2-jul 10:00 Bogotá) | **7** | 7 | 6 |
| DEAL-GX-SIN-HORA | Cuenta Ficticia Sin Hora | Y-09-15 | nula | — (no cuenta) | — | 9 |

Conteo por mes de la fila «Tratos cerrados ganados» (ámbito «Total compañía»):

| Mes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Suma |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Regla vieja (`closing_date`) | 1 | 1 | 1 | **2** | 1 | **2** | 1 | 1 | **2** | 1 | 1 | 1 | 15 |
| Regla nueva (Bogotá) | 1 | 1 | **2** | 1 | 1 | 1 | **2** | 1 | 1 | 1 | 1 | 1 | 14 |

Las columnas 3, 4, 6, 7 y 9 son las que distinguen las reglas: cada una falla con la consulta de hoy. Si se contara por el mes UTC en vez del de Bogotá, marzo daría 1 y abril 2: también fallaría.

Detalle de marzo con la regla nueva: **2 clientes** («Alfa Industrial» 1 y «Cuenta Ficticia Frontera» 1), **Total: 2**. Con la regla vieja: 1 cliente («Alfa Industrial»), Total: 1.

Tratos sembrados: 48 + 3 = **51**.

## Decisiones de este plan (no están en la spec)

1. **Condición explícita `stage_modified_time IS NOT NULL`.** El `extract` de un nulo ya es nulo y la comparación lo descarta, pero la regla 4 es una decisión de negocio y queda más clara escrita que implícita.
2. **Los tratos no ganados llevan `stage_modified_time` nula** en la semilla, igual que en el hub real, donde el worker solo la rellena en los ganados (§3.3). Así el filtro por fase sigue siendo lo que descarta al perdido.
3. **Tres ganados especiales aparte** del bucle mensual, en vez de retocar `DEAL-G-m`: cada uno aísla un caso (frontera de zona horaria, mes de cierre distinto, hora nula) y el bucle mensual sigue siendo uniforme.
4. **Dos tests E2E nuevos** en vez de reescribir los de enero: los de enero siguen probando el filtro por fase y el diálogo básico; los nuevos prueban la regla nueva. E2E pasa de 52 a **54**.
5. **Sin test de filtro por comercial nuevo.** La spec (regla 5) lo deja igual y la consulta no lo toca. Los especiales llevan `VENDEDORES[0]` para ser coherentes con la semilla.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/db/hub-schema.sql` | Modificar | `stage_modified_time timestamptz` en `crm.deals`; comentario de `closing_date` corregido. |
| `e2e/db/seed-hub.mjs` | Modificar | Hora de entrada en la fase de los `DEAL-G-m` y tres ganados especiales. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Dos tests nuevos: conteo por mes y detalle de marzo. |
| `src/db/hub-kpi.ts` | Modificar | `getHubWonDealsMonth` cuenta por `stage_modified_time` en Bogotá. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Solo el comentario de `ganadosQ`. |

---

### Task 1: Hora de entrada en la fase en el hub falso

**Files:**
- Modify: `e2e/db/hub-schema.sql:62-66`
- Modify: `e2e/db/seed-hub.mjs:234-280`

- [ ] **Step 1: Añadir la columna al esquema del hub falso**

Con Edit, en `e2e/db/hub-schema.sql`, sustituir:

```sql
  created_time timestamptz,
  -- Fecha de negocio del cierre, la que cuenta para el KPI de tratos ganados.
  -- Es date y no timestamptz: no arrastra zona horaria.
  closing_date date
);
```

por:

```sql
  created_time timestamptz,
  -- Fecha de cierre que el comercial rellena a mano en Zoho CRM. El KPI de tratos
  -- ganados ya NO la usa: la semilla la hace discrepar a proposito de
  -- stage_modified_time para que los E2E distingan las dos reglas.
  closing_date date,
  -- Instante en que el trato entro en su fase actual (Stage_Modified_Time de Zoho).
  -- El KPI de tratos ganados cuenta por su mes en hora de Bogota. En el hub real la
  -- rellena el worker hub-sync solo en los tratos ganados; nula = todavia no leyo la
  -- ficha del trato, y ese trato no cuenta.
  stage_modified_time timestamptz
);
```

- [ ] **Step 2: Hora de entrada de los ganados del bucle mensual**

Con Edit, en `e2e/db/seed-hub.mjs`, sustituir:

```js
      const cierre = `${CURRENT_YEAR}-${String(month).padStart(2, "0")}-20`;
      const apertura = `${CURRENT_YEAR - 1}-${String(month).padStart(2, "0")}-15T10:00:00Z`;
      const tratos = [
        [`DEAL-E-${month}`, `Trato existente ${month}`, existente, "Negociacion", 1000, fecha, previsto],
        [`DEAL-N-${month}`, `Trato nuevo ${month}`, CUENTA_NUEVA, "Negociacion", 2000, fecha, previsto],
        [`DEAL-G-${month}`, `Trato ganado ${month}`, existente, FASE_GANADA, 3000, apertura, cierre],
        [`DEAL-P-${month}`, `Trato perdido ${month}`, CUENTA_NUEVA, FASE_PERDIDA, 4000, apertura, cierre],
      ];
      for (const [id, nombre, cuenta, fase, importe, creado, cerrado] of tratos) {
        await client.query(
          `INSERT INTO crm.deals (id, deal_name, account_name, owner_name, stage, amount, created_time, closing_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, nombre, cuenta, vendedor, fase, importe, creado, cerrado],
        );
      }
      deals += tratos.length;
    }
```

por:

```js
      const cierre = `${CURRENT_YEAR}-${String(month).padStart(2, "0")}-20`;
      const apertura = `${CURRENT_YEAR - 1}-${String(month).padStart(2, "0")}-15T10:00:00Z`;
      // Hora en que el ganado entro en la fase: el dia 20 de su mes a las 10:00 de Bogota,
      // el mismo mes que su closing_date, asi que estos doce no distinguen las reglas; eso
      // lo hacen los GANADOS_ESPECIALES de abajo. Los abiertos y el perdido la llevan nula,
      // como en el hub real, donde el worker solo la rellena en los ganados.
      const entrada = instanteBogota(CURRENT_YEAR, month, 20, 10);
      const tratos = [
        [`DEAL-E-${month}`, `Trato existente ${month}`, existente, "Negociacion", 1000, fecha, previsto, null],
        [`DEAL-N-${month}`, `Trato nuevo ${month}`, CUENTA_NUEVA, "Negociacion", 2000, fecha, previsto, null],
        [`DEAL-G-${month}`, `Trato ganado ${month}`, existente, FASE_GANADA, 3000, apertura, cierre, entrada],
        [`DEAL-P-${month}`, `Trato perdido ${month}`, CUENTA_NUEVA, FASE_PERDIDA, 4000, apertura, cierre, null],
      ];
      for (const [id, nombre, cuenta, fase, importe, creado, cerrado, entroEnFase] of tratos) {
        await client.query(
          `INSERT INTO crm.deals (id, deal_name, account_name, owner_name, stage, amount, created_time, closing_date, stage_modified_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, nombre, cuenta, vendedor, fase, importe, creado, cerrado, entroEnFase],
        );
      }
      deals += tratos.length;
    }

    // Tres ganados que separan la regla del KPI (mes de stage_modified_time en hora de
    // Bogota) de la vieja (closing_date) y del mes UTC. Cuentas INVENTADAS: el
    // repositorio es publico. Se crean el anio anterior, como los DEAL-G, para no tocar
    // las filas de generacion de tratos. Los conteos esperados, mes a mes, estan en
    // docs/superpowers/plans/2026-09-24-tratos-ganados-fase-crm-salestracker.md.
    const GANADOS_ESPECIALES = [
      // Entro en la fase el 1 de abril a las 02:00 UTC, que en Bogota son las 21:00 del
      // 31 de marzo: cuenta en MARZO. Por closing_date y por el mes UTC seria de abril.
      {
        id: "DEAL-GX-FRONTERA",
        nombre: "Trato ganado frontera",
        cuenta: "Cuenta Ficticia Frontera",
        cierre: `${CURRENT_YEAR}-04-01`,
        entrada: new Date(Date.UTC(CURRENT_YEAR, 3, 1, 2)).toISOString(),
      },
      // El comercial puso cierre el 30 de junio, pero entro en la fase el 2 de julio:
      // cuenta en JULIO. Es el caso que motiva el cambio: closing_date es manual.
      {
        id: "DEAL-GX-MES",
        nombre: "Trato ganado mes distinto",
        cuenta: "Cuenta Ficticia Mes Distinto",
        cierre: `${CURRENT_YEAR}-06-30`,
        entrada: instanteBogota(CURRENT_YEAR, 7, 2, 10),
      },
      // Ganado sin hora de entrada: el worker todavia no leyo su ficha. NO cuenta en
      // ningun mes (regla 4 de la spec) aunque tenga closing_date de septiembre.
      {
        id: "DEAL-GX-SIN-HORA",
        nombre: "Trato ganado sin hora",
        cuenta: "Cuenta Ficticia Sin Hora",
        cierre: `${CURRENT_YEAR}-09-15`,
        entrada: null,
      },
    ];
    for (const g of GANADOS_ESPECIALES) {
      await client.query(
        `INSERT INTO crm.deals (id, deal_name, account_name, owner_name, stage, amount, created_time, closing_date, stage_modified_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [g.id, g.nombre, g.cuenta, VENDEDORES[0], FASE_GANADA, 3000, `${CURRENT_YEAR - 1}-03-15T10:00:00Z`, g.cierre, g.entrada],
      );
    }
    deals += GANADOS_ESPECIALES.length;
```

- [ ] **Step 3: Recrear las bases y comprobar la semilla**

Arrancar Docker Desktop si no lo está.

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina con `Listo.` y la línea `hub sembrado: ... 51 tratos, ...`.

Run:
```bash
docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT id, extract(month from stage_modified_time AT TIME ZONE 'America/Bogota')::int AS mes_bogota, extract(month from stage_modified_time AT TIME ZONE 'UTC')::int AS mes_utc, extract(month from closing_date)::int AS mes_cierre FROM crm.deals WHERE id LIKE 'DEAL-GX-%' ORDER BY id"
```
Expected (pegar la salida):
```
        id        | mes_bogota | mes_utc | mes_cierre
------------------+------------+---------+------------
 DEAL-GX-FRONTERA |          3 |       4 |          4
 DEAL-GX-MES      |          7 |       7 |          6
 DEAL-GX-SIN-HORA |            |         |          9
```

Run:
```bash
docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT extract(month from stage_modified_time AT TIME ZONE 'America/Bogota')::int AS mes, count(*) FROM crm.deals WHERE stage = 'Cerrado ganado' AND extract(year from stage_modified_time AT TIME ZONE 'America/Bogota') = extract(year from now()) GROUP BY 1 ORDER BY 1"
```
Expected: doce filas; mes 3 y mes 7 con `2`, el resto con `1` (suma 14). Pegar la salida.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/hub-schema.sql e2e/db/seed-hub.mjs
git commit -m "test(e2e): hora de entrada en la fase en los tratos ganados del hub falso"
```

---

### Task 2: E2E de la regla nueva (rojo)

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts` (tras el test «pulsar la cifra de tratos ganados abre su detalle», antes del comentario de `CLIENTE_ORDEN`)

- [ ] **Step 1: Escribir los tests**

Con Edit, en `e2e/specs/kpis-comerciales.spec.ts`, sustituir:

```ts
  await expect(dialogo.getByText("1 cliente")).toBeVisible();
  await expect(dialogo.getByText("Total: 1")).toBeVisible();
});
```

por:

```ts
  await expect(dialogo.getByText("1 cliente")).toBeVisible();
  await expect(dialogo.getByText("Total: 1")).toBeVisible();
});

/**
 * La fila de ganados cuenta por el mes, en hora de Bogota, en que el trato ENTRO en la
 * fase ganada (stage_modified_time), no por closing_date. Los tres GANADOS_ESPECIALES de
 * e2e/db/seed-hub.mjs hacen discrepar las reglas a proposito; con closing_date saldria
 * 1-2-2-1-2 en marzo, abril, junio, julio y septiembre. El indice de celda es el mes.
 */
test("la fila de tratos ganados cuenta por el mes en Bogota en que el trato entro en la fase", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  const celda = (mes: number) => fila.getByRole("cell").nth(mes);

  // DEAL-GX-FRONTERA entro el 1 de abril a las 02:00 UTC, las 21:00 del 31 de marzo en
  // Bogota: suma a marzo y no a abril. Con el mes UTC tambien iria a abril.
  await expect(celda(3)).toHaveText("2");
  await expect(celda(4)).toHaveText("1");
  // DEAL-GX-MES tiene closing_date de junio pero entro en la fase en julio.
  await expect(celda(6)).toHaveText("1");
  await expect(celda(7)).toHaveText("2");
  // DEAL-GX-SIN-HORA esta ganado con closing_date de septiembre pero sin hora de
  // entrada: no cuenta, y septiembre se queda con el ganado del mes.
  await expect(celda(9)).toHaveText("1");
});

test("el detalle de ganados de marzo incluye el trato que entro en la fase la noche del 31", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  await fila.getByRole("cell").nth(3).getByRole("button").click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Marzo");
  // El ganado del mes (cuenta de Books "Alfa Industrial") y el de la frontera horaria.
  await expect(dialogo).toContainText("Alfa Industrial");
  await expect(dialogo).toContainText("Cuenta Ficticia Frontera");
  await expect(dialogo.getByText("2 clientes")).toBeVisible();
  await expect(dialogo.getByText("Total: 2")).toBeVisible();
});
```

`abrirComercial` ya existe en el fichero.

- [ ] **Step 2: Ejecutar y verificar que fallan**

Docker Desktop arrancado. Comprobar que el puerto 3100 está libre y que han pasado 60 s desde la última ejecución de Playwright.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: **12 pasados, 2 fallidos**, y solo los dos nuevos:
- «la fila de tratos ganados cuenta por el mes…»: falla en `celda(3)`, esperaba `2` y recibe `1`.
- «el detalle de ganados de marzo…»: falla esperando «Cuenta Ficticia Frontera» (el diálogo solo tiene «Alfa Industrial»).

Los dos tests de ganados de enero siguen en verde: enero vale 1 con las dos reglas. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): los tratos ganados cuentan por el mes en Bogota de la entrada en la fase"
```

---

### Task 3: Contar por `stage_modified_time` en hora de Bogotá (verde)

**Files:**
- Modify: `src/db/hub-kpi.ts:95-112`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx:280-281`

- [ ] **Step 1: Cambiar la consulta**

Con Edit, en `src/db/hub-kpi.ts`, sustituir:

```ts
// Tratos ganados por cuenta y mes. Se cuenta por closing_date y no por created_time: es
// la fecha de negocio del cierre, y al ser date no arrastra zona horaria. El filtro por
// fase es imprescindible: las fases abiertas llevan fecha de cierre PREVISTA, que cae
// en el futuro, y sin filtrar contaminarian el conteo.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.closing_date)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.closing_date) = $1
      AND d.stage = ANY($2::text[])
      AND d.account_name IS NOT NULL
      AND ($3::text IS NULL OR d.owner_name = $3)
    GROUP BY d.account_name, extract(month from d.closing_date)`;
```

por:

```ts
// Tratos ganados por cuenta y mes. Se cuenta por stage_modified_time, el instante en que
// el trato entro en su fase actual segun Zoho CRM, y no por closing_date: esa la rellena
// el comercial a mano y puede caer en otro mes. Como solo se miran tratos que ESTAN en
// una fase ganada, es la hora en que se gano; si sale de la fase deja de contar, y si
// vuelve cuenta en el mes de la ultima entrada, porque Zoho reescribe esa hora.
// El mes se toma en hora de Bogota: un trato ganado a las 21:00 del 31 es de ese mes
// aunque en UTC ya sea el dia 1.
// Un ganado con stage_modified_time nula NO cuenta y no se recurre a closing_date: la
// columna la rellena el worker hub-sync de ambientalia-desk, y mezclar los dos criterios
// ocultaria que el worker no ha terminado. Por eso esta consulta solo se despliega con
// el barrido del worker a 0 pendientes.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.stage_modified_time AT TIME ZONE 'America/Bogota')::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE d.stage_modified_time IS NOT NULL
      AND extract(year from d.stage_modified_time AT TIME ZONE 'America/Bogota') = $1
      AND d.stage = ANY($2::text[])
      AND d.account_name IS NOT NULL
      AND ($3::text IS NULL OR d.owner_name = $3)
    GROUP BY d.account_name, extract(month from d.stage_modified_time AT TIME ZONE 'America/Bogota')`;
```

El resto de la función (parámetros `[f.anio, [...WON_DEAL_STAGES], f.owner]` y el `map`) no cambia.

- [ ] **Step 2: Corregir el comentario de la tabla**

Con Edit, en `src/components/charts/comercial/commercial-kpi-table.tsx`, sustituir:

```tsx
  // Los ganados van aparte de los generados: se cuentan por fecha de cierre y
  // filtrando por la fase ganadora, asi que no se pueden deducir de los de arriba.
```

por:

```tsx
  // Los ganados van aparte de los generados: se cuentan por el mes (en hora de Bogota)
  // en que el trato entro en la fase ganadora, filtrando por ella, asi que no se pueden
  // deducir de los de arriba.
```

- [ ] **Step 3: Tipos y lint**

Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 4: Ejecutar los E2E del fichero y verificar que pasan**

Esperar 60 s desde la ejecución de la Task 2 y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: **14/14** en verde. Pegar la salida.

- [ ] **Step 5: Commit**

```bash
git add src/db/hub-kpi.ts src/components/charts/comercial/commercial-kpi-table.tsx
git commit -m "fix(kpis): tratos ganados por la hora de entrada en la fase de CRM"
```

---

### Task 4: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios, tipos y lint**

Run: `npm test`
Expected: **284 pasados + 1 saltado** (sin cambios: este plan no añade unitarios).

Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 2: Suite E2E completa**

Docker Desktop arrancado. Esperar 60 s desde la última ejecución de Playwright y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e`
Expected: **54/54** (los 52 de hoy más los dos nuevos). Si falla algo fuera de `kpis-comerciales.spec.ts`, leerlo antes de tocar nada y decir en el informe qué era.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## fix/tratos-ganados-fase-crm` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales, clientes, cuentas y
> tratos son justo lo que no puede acabar en un repositorio público: meterlos dentro del propio comando
> de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero fuera del
> repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe, la comprobación
> no está hecha: no se puede dar por buena.

---

### Task 5: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar, con el aviso de orden de despliegue**

Pedir confirmación explícita al usuario antes de cualquier push. Recordarle el orden de §5 de la spec:

1. Primero el PR del worker `hub-sync` de `ambientalia-desk`, fusionado y redesplegado.
2. **Esperar a que termine el barrido** del worker. Comprobarlo en `zoho-hub`:
   ```sql
   SELECT count(*) FILTER (WHERE stage_modified_time IS NULL) AS pendientes, count(*) AS ganados
   FROM crm.deals WHERE stage = 'Cerrado ganado';
   ```
   `pendientes` tiene que ser **0**.
3. Solo entonces fusionar y desplegar este PR. Si se despliega antes, la fila mostrará **menos tratos de los reales** (y hoy, con la columna vacía en los 1029 ganados, mostraría cero en todos los meses), porque un ganado sin hora no cuenta (regla 4).

Este PR **no trae migración**. Abrirlo antes de que termine el barrido está bien; lo que no se puede es fusionarlo y desplegarlo.

- [ ] **Step 2: Push y PR (solo tras la confirmación)**

```bash
git push -u origin fix/tratos-ganados-fase-crm
```

PR contra `main` titulado `fix(kpis): tratos ganados por la hora de entrada en la fase de CRM`, explicando: la fila «Tratos cerrados ganados» cuenta por el mes, en hora de Bogotá, de `stage_modified_time` en vez de por `closing_date`; un ganado sin esa hora no cuenta; filtro por comercial, forma de salida y diálogo sin cambios; el hub falso gana la columna y tres ganados especiales (frontera de zona horaria, cierre en otro mes, hora nula). Sustituye al PR #25. Incluir en la descripción, en lugar visible, **«No fusionar hasta que el barrido del worker hub-sync esté a 0 pendientes»** con la consulta del Step 1.

- [ ] **Step 3: CI y fusión (solo cuando el usuario confirme que el barrido está a 0)**

Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- La Parte 1 de la spec (worker `hub-sync`, `stage_detail_synced_at`, `syncPendingWonStages`): va en su propio plan y repositorio.
- Replicar el historial de fases completo (`Stage_History`) y la hora de entrada en fases que no sean ganadas.
- Cambiar las filas de generación de tratos o el filtro por comercial.
