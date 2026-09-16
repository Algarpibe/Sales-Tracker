# Tratos cerrados ganados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La fila "Tratos cerrados ganados" de la tabla de KPIs comerciales muestra cuántos tratos se ganaron cada mes, siguiendo el selector de propietario.

**Architecture:** Consulta nueva a `crm.deals` filtrando por la fase ganadora y agrupando por mes de `closing_date`, un helper puro que la convierte en doce posiciones, y una fila del catálogo que pasa de `pendiente` a `auto`. Sin migración.

**Spec:** se apoya en `docs/superpowers/specs/2026-09-16-kpi-tratos-design.md`, que ya describe el origen `crm.deals`, los privilegios de `hub_reader` y por qué el hub replica CRM. Este plan solo añade la fila de ganados, que no necesita cruce con Books.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-tratos-ganados`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio ni nombre real de comercial, cliente o cuenta, en código, tests, comentarios ni documentación. Los datos de la semilla E2E son inventados.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración** de la base de la app. Lo que cambia es el hub falso de los E2E.
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; **esperar 60 s entre ejecuciones**.
- **`sed -i` convierte el fichero entero de CRLF a LF en este repo.** Para editar ficheros CRLF hay que usar un script de node que preserve el final de línea original.

## Contexto verificado contra el hub de producción

- `crm.deals.stage` tiene cinco valores en uso, con la **misma grafía en CRM y en el hub**. Solo uno significa ganado. Los otros cuatro son dos formas de perdido y dos fases abiertas.
- **`closing_date` está informada en todas las filas**, sin una sola nula en ninguna fase, y para los tratos ganados nunca cae en el futuro.
- Los tratos ganados cubren desde 2020 hasta hoy, así que **cualquier año que ofrezca el selector tendrá datos**.
- **Filtrar por fase es imprescindible**: las fases abiertas llevan fecha de cierre *prevista*, que sí cae en el futuro. Sin el filtro, un trato que aún no se ha ganado contaminaría el conteo.
- Se usa `closing_date` y no `created_time` ni `stage_modified_time`: es la fecha de negocio del cierre, está curada, y al ser un `date` y no un `timestamptz` no arrastra ambigüedad de zona horaria.
- El `crm.deals` del hub falso (`e2e/db/hub-schema.sql`) **todavía no tiene la columna `closing_date`**: hay que añadirla.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/db/hub-schema.sql` | Modificar | `closing_date` en `crm.deals`. |
| `e2e/db/seed-hub.mjs` | Modificar | Tratos ganados y perdidos ficticios. |
| `src/lib/commercial-kpis.ts` | Modificar | `WON_DEAL_STAGES` y la fila a `auto`. |
| `src/lib/__tests__/commercial-kpis.test.ts` | Modificar | El recuento de automáticos. |
| `src/lib/kpi-score.ts` | Modificar | `toMonthlySeries`. |
| `src/lib/__tests__/kpi-score.test.ts` | Modificar | Tests del helper. |
| `src/db/hub-kpi.ts` | Modificar | `getHubWonDealsMonth`. |
| `src/actions/kpi-actions.ts` | Modificar | `getKpiWonDealsMonthly`. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Test de la fila. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Consumir el conteo. |

---

### Task 1: El hub falso gana `closing_date` y tratos ganados

**Files:**
- Modify: `e2e/db/hub-schema.sql`
- Modify: `e2e/db/seed-hub.mjs`

- [ ] **Step 1: La columna**

En `e2e/db/hub-schema.sql`, añadir a `crm.deals`:

```sql
  closing_date date,
```

justo después de `created_time`, con un comentario breve: es la fecha de negocio del cierre y la que cuenta para el KPI de ganados.

- [ ] **Step 2: Los tratos ganados**

En `e2e/db/seed-hub.mjs`, el bucle que siembra los tratos ya inserta dos por mes con `stage` `'Negociacion'`. Añadir un tercero **ganado** y un cuarto **perdido**, los dos con `closing_date` en su mes:

- El ganado: `stage` con el valor ganador, `closing_date` el día 20 de ese mes.
- El perdido: un `stage` de perdido inventado, `closing_date` el mismo día.

El perdido existe para que el test demuestre que el filtro por fase **descarta** lo que no es ganado; sin él, el test pasaría igual aunque el filtro no estuviera.

Rellenar también `closing_date` en los dos tratos que ya se siembran, para que la columna no quede medio vacía.

**El trato ganado de la semilla debe llevar exactamente el mismo valor que `WON_DEAL_STAGES[0]`**,
porque la consulta filtra por él: con una etiqueta inventada el conteo saldría cero y el test no
probaría nada. Como `seed-hub.mjs` es `.mjs` y no puede importar del TypeScript, se repite el
literal con un comentario que apunte a `src/lib/commercial-kpis.ts` para que quien lo cambie ahí
sepa que hay un segundo sitio.

Las demás fases —la de perdido y la abierta que ya existe— **sí son inventadas**, y su papel es
justamente demostrar que el filtro las descarta.

Actualizar la línea de `console.log` del final con el número de tratos.

- [ ] **Step 3: Comprobar contra la base de test**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT stage, count(*), count(*) FILTER (WHERE closing_date IS NULL) AS sin_fecha FROM crm.deals GROUP BY 1 ORDER BY 1"`
Expected: las cuatro fases, y `sin_fecha` a cero en todas. Pegar la salida en el informe.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/hub-schema.sql e2e/db/seed-hub.mjs
git commit -m "test(e2e): tratos ganados y perdidos con fecha de cierre"
```

---

### Task 2: La fase ganadora y el helper (TDD con vitest)

**Files:**
- Modify: `src/lib/commercial-kpis.ts`
- Modify: `src/lib/__tests__/commercial-kpis.test.ts`
- Modify: `src/lib/kpi-score.ts`
- Modify: `src/lib/__tests__/kpi-score.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/kpi-score.test.ts`, añadir `toMonthlySeries` al import y este bloque:

```ts
describe("toMonthlySeries", () => {
  it("coloca cada conteo en su mes", () => {
    const s = toMonthlySeries([{ mes: 1, tratos: 4 }, { mes: 12, tratos: 7 }]);
    expect(s[0]).toBe(4);
    expect(s[11]).toBe(7);
  });
  it("acumula los que caen en el mismo mes", () => {
    expect(toMonthlySeries([{ mes: 3, tratos: 2 }, { mes: 3, tratos: 5 }])[2]).toBe(7);
  });
  it("los meses sin datos quedan a cero", () => {
    expect(toMonthlySeries([{ mes: 5, tratos: 1 }])[0]).toBe(0);
  });
  it("ignora los meses fuera de rango", () => {
    const s = toMonthlySeries([{ mes: 0, tratos: 9 }, { mes: 13, tratos: 9 }]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("devuelve siempre doce posiciones", () => {
    expect(toMonthlySeries([])).toHaveLength(12);
  });
});
```

En `src/lib/__tests__/commercial-kpis.test.ts`, añadir `WON_DEAL_STAGES` al import y:

```ts
describe("fases ganadoras", () => {
  it("hay al menos una fase que cuenta como ganada", () => {
    expect(WON_DEAL_STAGES.length).toBeGreaterThan(0);
  });
  it("ninguna fase ganadora esta vacia", () => {
    for (const f of WON_DEAL_STAGES) expect(f.trim()).not.toBe("");
  });
});
```

Y cambiar la cifra del test que cuenta los KPIs automáticos de **5 a 6**. **No relajarlo** a `toBeGreaterThan`: la cifra exacta es lo que avisa de un cambio de catálogo no querido.

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts src/lib/__tests__/commercial-kpis.test.ts`
Expected: fallan los nuevos y el del recuento. Pegar la salida.

- [ ] **Step 3: Implementar**

En `src/lib/commercial-kpis.ts`, junto a `KPI_UNIT_LABEL`:

```ts
/**
 * Fases de Zoho CRM que cuentan como trato ganado. Va en código y no en una variable
 * de entorno porque una etiqueta de fase no expone nada del negocio, y aquí queda
 * visible y cubierta por un test. Si se renombra la fase en Zoho, este KPI se iría a
 * cero: es el precio de tenerlo fijo, y la alternativa sería configurarlo.
 */
export const WON_DEAL_STAGES = ["Cerrado ganado"] as const;
```

y `tratos_ganados` pasa a `source: "auto"` perdiendo su `pendingReason`. `tickets_st` e `ingresos_proyectos` no se tocan.

En `src/lib/kpi-score.ts`:

```ts
/** Conteos de una fase por mes, tal y como los agrupa el hub. */
export interface MonthCountRow {
  mes: number;
  tratos: number;
}

/** Reparte conteos mensuales en las doce posiciones del año. */
export function toMonthlySeries(rows: MonthCountRow[]): number[] {
  const out = doceCeros();
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    out[idx] += r.tratos;
  }
  return out;
}
```

Reutilizar `doceCeros` y `MESES`, que ya existen. **No redefinirlos.**

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test`
Expected: todos pasan, con 7 tests más que antes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commercial-kpis.ts src/lib/__tests__/commercial-kpis.test.ts src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): fase ganadora y serie mensual de conteos"
```

---

### Task 3: Consulta y acción

**Files:**
- Modify: `src/db/hub-kpi.ts`
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: La consulta**

Al final de `src/db/hub-kpi.ts`, siguiendo la forma de `getHubDealsMonth`:

```ts
// Tratos ganados por mes. Se cuenta por closing_date y no por created_time: es la
// fecha de negocio del cierre, y al ser date no arrastra zona horaria. El filtro por
// fase es imprescindible: las fases abiertas llevan fecha de cierre PREVISTA, que cae
// en el futuro, y sin filtrar contaminarian el conteo.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<MonthCountRow[]> {
  const sql = `
    SELECT extract(month from d.closing_date)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.closing_date) = $1
      AND d.stage = ANY($2::text[])
      AND ($3::text IS NULL OR d.owner_name = $3)
    GROUP BY extract(month from d.closing_date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, [...WON_DEAL_STAGES], f.owner]);
  return rows.map((r) => ({ mes: Number(r.mes), tratos: Number(r.tratos) }));
}
```

Importar `MonthCountRow` de `@/lib/kpi-score` y `WON_DEAL_STAGES` de `@/lib/commercial-kpis` junto a los imports existentes.

- [ ] **Step 2: La acción**

Al final de `src/actions/kpi-actions.ts`:

```ts
/** Tratos ganados por mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiWonDealsMonthly(anio: number, owner: KpiScope): Promise<MonthCountRow[]> {
  await requireApproved();
  return getHubWonDealsMonth({ anio, owner });
}
```

- [ ] **Step 3: Verificar el SQL contra la base de test**

Ejecutar el SQL contra `zoho_hub_e2e` tres veces: con `owner` a `NULL`, con un vendedor ficticio, y **una cuarta pasando la fase de perdido en lugar de la ganadora**, para comprobar que el filtro discrimina de verdad. Pegar las salidas.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/db/hub-kpi.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): consulta de tratos ganados por mes"
```

---

### Task 4: El test E2E, en rojo

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Escribir el test**

Añadir al final, reutilizando el helper `abrirComercial`:

```ts
test("la fila de tratos cerrados ganados cuenta solo los ganados", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  await expect(fila).toBeVisible();
  await expect(fila).not.toContainText("Pendiente de Zoho CRM");

  // La semilla cierra un trato ganado y otro perdido cada mes: si el filtro por
  // fase no funcionara, aqui saldria 2.
  await expect(fila.getByRole("cell").nth(1)).toHaveText("1");
});
```

Si el índice de celda no es el 1, ajustarlo a lo que renderice la tabla, sin cambiar lo que el test comprueba.

- [ ] **Step 2: Ejecutar y verificar que falla**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `1 failed` y `6 passed`. Falla porque la fila sigue diciendo que está pendiente. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): la fila de tratos ganados cuenta solo los ganados"
```

---

### Task 5: La tabla

**Files:**
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Consumir el conteo**

Leer el componente entero antes de tocarlo.

- Consulta nueva `["kpi-won-deals", year, owner]` → `getKpiWonDealsMonthly(year, salesperson)`, con el mismo `placeholderData: keepPreviousData` que las demás que dependen del ámbito, y **entrando también en los estados de carga y de refresco** junto a las otras.
- `toMonthlySeries(ganados)` alimenta la fila `tratos_ganados` igual que las series de tratos alimentan las suyas.
- Las celdas son conteos enteros: la unidad ya es `conteo` y el formateador elige por unidad, así que no debería hacer falta tocar nada.
- **No escribir aritmética nueva.**

- [ ] **Step 2: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 3: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la Task 4 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `7 passed`.

- [ ] **Step 4: Commit**

```bash
git add "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): la tabla cuenta los tratos cerrados ganados"
```

---

### Task 6: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: los 193 anteriores más 7 = **200 pasados + 1 saltado**. Contar los reales y reportar la diferencia si no cuadra, en vez de ajustar el número a ojo.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `44 passed` (los 43 actuales más 1).

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-tratos-ganados` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales, clientes y procesos
> internos son justo lo que no puede acabar en un repositorio público: meterlos dentro del propio
> comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero
> fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe, la
> comprobación no está hecha: no se puede dar por buena.

Además, comprobar que **la única etiqueta de producción del repositorio es la fase ganadora**, que
aparece por necesidad en `commercial-kpis.ts` y en la semilla. Cualquier otra fase que aparezca en
el diff debe ser inventada.

---

### Task 7: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Este PR **cambia lo que se ve** y no trae migración. Recordar que no despliegue hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-tratos-ganados
```

PR contra `main` titulado `feat(kpis): tratos cerrados ganados`, explicando por qué se cuenta por `closing_date`, por qué el filtro por fase es imprescindible y qué queda pendiente. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- `tickets_st`: `desk.tickets` está replicada, pero "en plazo" hay que definirlo contra sus campos reales.
- `ingresos_proyectos`: sigue necesitando carga manual.
- El caso de borde de zona horaria de `getHubDealsMonth`, que agrupa por `created_time`, un `timestamptz`. Un trato creado a última hora del último día de un mes puede contarse en el contiguo. Anotado, no se toca aquí.
- Hacer configurable la lista de fases ganadoras.
