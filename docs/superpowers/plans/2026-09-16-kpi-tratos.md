# Generación de tratos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las dos filas de "Generación de tratos" de la tabla de KPIs comerciales muestran números por mes, siguen el selector de propietario y dejan de decir que están pendientes.

**Architecture:** Consulta nueva a `crm.deals` del hub, dos helpers puros en `kpi-score.ts` que reparten los tratos con la antigüedad que ya calcula la app desde Books, y dos filas del catálogo que pasan de `pendiente` a `auto`. Sin migración.

**Spec:** `docs/superpowers/specs/2026-09-16-kpi-tratos-design.md`

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-tratos`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio, ningún nombre real de comercial, de cliente o de proceso interno, en código, tests, comentarios ni documentación. Los datos de la semilla E2E son inventados.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración** de la base de la app. Lo que cambia es el **hub falso de los E2E**, que hoy solo replica `books`.
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; **esperar 60 s entre ejecuciones** por el límite de 5 logins por minuto.
- **`sed -i` convierte el fichero entero de CRLF a LF en este repo.** Para editar ficheros CRLF hay que usar un script de node que preserve el final de línea original.

## Contexto verificado del código y del hub

- `crm.deals` existe en el hub de producción y `hub_reader` puede leerla. Columnas útiles: `account_name`, `owner_name`, `created_time` (`timestamptz`), `stage`, `amount`.
- `crm.deals.owner_name` usa **las mismas cadenas** que `raw->>'salesperson_name'` de Books, así que el selector de propietario filtra ambas fuentes sin traducir nada.
- **No hay `crm.accounts`**, así que el cruce con Books es por nombre normalizado.
- `e2e/db/hub-schema.sql` es una réplica mínima: solo las columnas que consultan los `src/db/hub-*.ts`. Hoy únicamente tiene el esquema `books`.
- `src/lib/kpi-score.ts` ya tiene `MonthlySplit`, `splitNewExisting`, `periodTotals`, `attainment`, `kpiAverage`, `kpiContribution` y `scoreboard`.
- `firstYearByCustomer` (`src/lib/analytics-comercial.ts`) devuelve un `Map` con el nombre **crudo** de Books como clave.
- `src/components/charts/comercial/commercial-kpi-table.tsx` ya monta las filas desde `COMMERCIAL_KPIS` y trata aparte las que son `pendiente`.
- `src/lib/__tests__/commercial-kpis.test.ts` afirma que hay **exactamente 3 KPIs automáticos**. Ese número cambia en este PR.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `e2e/db/hub-schema.sql` | Modificar | Esquema `crm` con `deals`. |
| `e2e/db/seed-hub.mjs` | Modificar | Tratos ficticios. |
| `src/lib/kpi-score.ts` | Modificar | `normalizeCustomerKey` y `splitDealsNewExisting`. |
| `src/lib/__tests__/kpi-score.test.ts` | Modificar | Tests de ambos. |
| `src/db/hub-kpi.ts` | Modificar | `getHubDealsMonth`. |
| `src/actions/kpi-actions.ts` | Modificar | `getKpiDealsMonthly`. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Test de las dos filas. |
| `src/lib/commercial-kpis.ts` | Modificar | Las dos filas pasan a `auto`. |
| `src/lib/__tests__/commercial-kpis.test.ts` | Modificar | El recuento de automáticos. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Consumir los tratos. |

---

### Task 1: El hub falso gana el esquema `crm`

**Files:**
- Modify: `e2e/db/hub-schema.sql`
- Modify: `e2e/db/seed-hub.mjs`

- [ ] **Step 1: La tabla**

Al final de `e2e/db/hub-schema.sql`:

```sql
-- El hub real replica tambien Zoho CRM. Aqui solo van las columnas que consulta
-- src/db/hub-kpi.ts, igual que con books.
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE crm.deals (
  id           text PRIMARY KEY,
  deal_name    text,
  account_name text,
  owner_name   text,
  stage        text,
  amount       numeric,
  created_time timestamptz
);
```

- [ ] **Step 2: Los tratos ficticios**

En `e2e/db/seed-hub.mjs`, después de sembrar las facturas y antes del `COMMIT`, sembrar tratos **solo del año en curso**, que es el que la app abre por defecto. Uno "existente" y uno "nuevo" por mes, con el vendedor rotando igual que las facturas:

```js
    // Tratos del anio en curso: uno de cliente existente y otro de cliente que
    // no existe en Books, para que el reparto nuevo/existente tenga las dos ramas.
    // El de agosto se escribe en mayusculas a proposito: prueba de punta a punta
    // que la clave se normaliza antes de cruzar con Books.
    const CUENTA_EXISTENTE = CUSTOMERS[0];
    const CUENTA_NUEVA = "Prospecto Ficticio";
    for (let month = 1; month <= 12; month++) {
      const vendedor = VENDEDORES[Math.floor((month - 1) / 2) % VENDEDORES.length];
      const fecha = `${CURRENT_YEAR}-${String(month).padStart(2, "0")}-15T10:00:00Z`;
      const existente = month === 8 ? CUENTA_EXISTENTE.toUpperCase() : CUENTA_EXISTENTE;
      await client.query(
        `INSERT INTO crm.deals (id, deal_name, account_name, owner_name, stage, amount, created_time)
         VALUES ($1,$2,$3,$4,'Negociacion',1000,$5), ($6,$7,$8,$9,'Negociacion',2000,$10)`,
        [
          `DEAL-E-${month}`, `Trato existente ${month}`, existente, vendedor, fecha,
          `DEAL-N-${month}`, `Trato nuevo ${month}`, CUENTA_NUEVA, vendedor, fecha,
        ],
      );
    }
```

Ajustar el nombre real de la variable del cliente de Postgres y de la constante del año en curso a lo que use el fichero. Actualizar la línea de `console.log` del final para que informe también de los tratos.

- [ ] **Step 3: Comprobar contra la base de test**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT extract(month from created_time)::int AS mes, account_name, owner_name FROM crm.deals ORDER BY 1, 2"`
Expected: 24 filas, dos por mes, con los dos vendedores ficticios repartidos y la cuenta de agosto en mayúsculas. Pegar la salida en el informe.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/hub-schema.sql e2e/db/seed-hub.mjs
git commit -m "test(e2e): el hub falso replica tambien crm.deals"
```

---

### Task 2: Helpers de reparto (TDD con vitest)

**Files:**
- Modify: `src/lib/__tests__/kpi-score.test.ts`
- Modify: `src/lib/kpi-score.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/__tests__/kpi-score.test.ts`, y `normalizeCustomerKey` y `splitDealsNewExisting` al import existente:

```ts
describe("normalizeCustomerKey", () => {
  it("ignora mayusculas y espacios", () => {
    expect(normalizeCustomerKey("  Alfa Industrial ")).toBe(normalizeCustomerKey("ALFA INDUSTRIAL"));
  });
  it("ignora tildes", () => {
    expect(normalizeCustomerKey("Compañia Energética")).toBe(normalizeCustomerKey("Compania Energetica"));
  });
  it("ignora la puntuacion", () => {
    expect(normalizeCustomerKey("Beta, S.A.")).toBe(normalizeCustomerKey("Beta SA"));
  });
  it("no funde empresas distintas", () => {
    expect(normalizeCustomerKey("Alfa Industrial")).not.toBe(normalizeCustomerKey("Alfa Industrias"));
  });
});

describe("splitDealsNewExisting", () => {
  const primerAnio = new Map<string, number>([
    ["Alfa Industrial", 2023],
    ["Beta Minera", 2026],
  ]);

  it("la cuenta que ya compraba antes va a existentes", () => {
    const r = splitDealsNewExisting([{ account_name: "Alfa Industrial", mes: 1, tratos: 3 }], primerAnio, 2026);
    expect(r.existentes[0]).toBe(3);
    expect(r.nuevos[0]).toBe(0);
  });

  it("la cuenta cuya primera compra es el anio analizado va a nuevos", () => {
    const r = splitDealsNewExisting([{ account_name: "Beta Minera", mes: 2, tratos: 1 }], primerAnio, 2026);
    expect(r.nuevos[1]).toBe(1);
  });

  it("la cuenta que nunca compro va a nuevos", () => {
    // La mitad de las cuentas con trato no existe en Books: son prospectos.
    const r = splitDealsNewExisting([{ account_name: "Prospecto", mes: 3, tratos: 2 }], primerAnio, 2026);
    expect(r.nuevos[2]).toBe(2);
  });

  it("cruza aunque la grafia no coincida", () => {
    const r = splitDealsNewExisting([{ account_name: "ALFA INDUSTRIAL", mes: 4, tratos: 1 }], primerAnio, 2026);
    expect(r.existentes[3]).toBe(1);
  });

  it("acumula los tratos del mismo mes", () => {
    const rows = [
      { account_name: "Alfa Industrial", mes: 5, tratos: 2 },
      { account_name: "Alfa Industrial", mes: 5, tratos: 3 },
    ];
    expect(splitDealsNewExisting(rows, primerAnio, 2026).existentes[4]).toBe(5);
  });

  it("ignora los meses fuera de rango y devuelve doce posiciones", () => {
    const rows = [
      { account_name: "Alfa Industrial", mes: 0, tratos: 9 },
      { account_name: "Alfa Industrial", mes: 13, tratos: 9 },
    ];
    const r = splitDealsNewExisting(rows, primerAnio, 2026);
    expect(r.nuevos).toHaveLength(12);
    expect(r.existentes).toHaveLength(12);
    expect(r.existentes.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts`
Expected: los 10 nuevos fallan porque las funciones no existen; los 19 anteriores siguen pasando.

- [ ] **Step 3: Implementar**

En `src/lib/kpi-score.ts`:

```ts
/**
 * Clave con la que se cruzan las cuentas de CRM y los clientes de Books. En el hub
 * no hay `crm.accounts`, así que no existe identificador compartido y el cruce es
 * por nombre: normalizar es lo único que evita perder un cliente por una tilde o
 * por un punto de más, y un fallo aquí no se ve, solo clasifica mal.
 */
export function normalizeCustomerKey(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Tratos de una cuenta en un mes, tal y como los agrupa el hub. */
export interface DealMonthRow {
  account_name: string;
  mes: number;
  tratos: number;
}

/**
 * Reparte los tratos entre clientes nuevos y existentes. Es **existente** solo si
 * la cuenta tiene ventas en un año anterior al analizado; el resto es nuevo, tanto
 * quien nunca compró como quien compró por primera vez este año. Mientras no haya
 * compra previa, el trato sigue siendo esfuerzo de captación.
 */
export function splitDealsNewExisting(
  rows: DealMonthRow[],
  firstYear: Map<string, number>,
  year: number
): MonthlySplit {
  // El mapa llega con el nombre crudo de Books: se normaliza aquí para que los dos
  // lados del cruce usen exactamente la misma clave.
  const porClave = new Map<string, number>();
  for (const [nombre, anio] of firstYear) {
    const k = normalizeCustomerKey(nombre);
    const actual = porClave.get(k);
    if (actual === undefined || anio < actual) porClave.set(k, anio);
  }

  const out: MonthlySplit = { nuevos: doceCeros(), existentes: doceCeros() };
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    const primero = porClave.get(normalizeCustomerKey(r.account_name));
    const serie = primero !== undefined && primero < year ? out.existentes : out.nuevos;
    serie[idx] += r.tratos;
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts`
Expected: 29 pasando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): reparto de tratos entre clientes nuevos y existentes"
```

---

### Task 3: Consulta y acción

**Files:**
- Modify: `src/db/hub-kpi.ts`
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: La consulta**

Al final de `src/db/hub-kpi.ts`, siguiendo la forma de `getHubCustomerMonthByOwner`:

```ts
// Tratos por cuenta y mes. Zoho CRM se replica en el esquema crm del hub, y
// owner_name usa las mismas cadenas que el vendedor de Books, asi que el filtro
// por comercial vale para las dos fuentes sin traducir nada.
export async function getHubDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.created_time)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.created_time) = $1
      AND d.account_name IS NOT NULL
      AND ($2::text IS NULL OR d.owner_name = $2)
    GROUP BY d.account_name, extract(month from d.created_time)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}
```

Importar `DealMonthRow` de `@/lib/kpi-score` junto a los imports existentes.

- [ ] **Step 2: La acción**

Al final de `src/actions/kpi-actions.ts`:

```ts
/** Tratos por cuenta y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiDealsMonthly(anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  await requireApproved();
  return getHubDealsMonth({ anio, owner });
}
```

- [ ] **Step 3: Verificar el SQL contra la base de test**

Ejecutar el SQL contra `zoho_hub_e2e` dos veces, una con el segundo parámetro a `NULL` y otra con uno de los vendedores ficticios, y comprobar que la segunda es un subconjunto estricto de la primera. Pegar ambas salidas.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/db/hub-kpi.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): consulta de tratos por cuenta y mes"
```

---

### Task 4: El test E2E, en rojo

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Escribir el test**

Añadir al final, reutilizando el helper `abrirComercial` que ya existe en el fichero:

```ts
test("las filas de generacion de tratos muestran numeros y ya no dicen que estan pendientes", async ({ page }) => {
  const card = await abrirComercial(page);

  const nuevos = card.getByRole("row", { name: /Generación de tratos · clientes nuevos/ });
  const existentes = card.getByRole("row", { name: /Generación de tratos · clientes existentes/ });

  // La semilla deja un trato de cada clase en cada mes del anio en curso.
  await expect(nuevos).toBeVisible();
  await expect(existentes).toBeVisible();
  await expect(nuevos).not.toContainText("Pendiente de Zoho CRM");
  await expect(existentes).not.toContainText("Pendiente de Zoho CRM");

  // Enero tiene trato nuevo y trato existente; el indice 1 es el primer mes.
  await expect(nuevos.getByRole("cell").nth(1)).toHaveText("1");
  await expect(existentes.getByRole("cell").nth(1)).toHaveText("1");
});
```

Si el índice de celda no es el 1, ajustarlo a lo que renderice la tabla de verdad, sin cambiar lo que el test comprueba.

- [ ] **Step 2: Ejecutar y verificar que falla**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `1 failed` y `5 passed`. Falla porque las filas siguen diciendo que están pendientes. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): las filas de tratos muestran numeros"
```

---

### Task 5: El catálogo y la tabla

**Files:**
- Modify: `src/lib/commercial-kpis.ts`
- Modify: `src/lib/__tests__/commercial-kpis.test.ts`
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Las dos filas pasan a automáticas**

En `src/lib/commercial-kpis.ts`, `tratos_nuevos` y `tratos_existentes` pasan a `source: "auto"` y pierden `pendingReason`. `tratos_ganados`, `tickets_st` e `ingresos_proyectos` no se tocan.

En `src/lib/__tests__/commercial-kpis.test.ts`, el test que afirma que hay 3 KPIs automáticos pasa a 5. **No relajarlo a `toBeGreaterThan`**: la cifra exacta es lo que avisa de un cambio de catálogo no querido.

- [ ] **Step 2: La tabla consume los tratos**

En `commercial-kpi-table.tsx`:
- Consulta nueva `["kpi-deals", year, owner]` → `getKpiDealsMonthly(year, salesperson)`, con el mismo `placeholderData: keepPreviousData` que las otras dos que dependen del ámbito.
- `splitDealsNewExisting(tratos, firstYearByCustomer(facturasHistoricas), year)` en el mismo `useMemo` donde ya se calcula el reparto de ventas, reutilizando el mapa que ya se construye ahí.
- Las series alimentan `tratos_nuevos` y `tratos_existentes` igual que las de ventas alimentan las suyas.
- La unidad ya es `conteo`, así que las celdas se pintan como enteros. Si el formateo se elige por unidad, no hace falta tocar nada; si no, añadir la rama.

Leer el componente entero antes de tocarlo y **no escribir aritmética nueva**: el reparto y el cumplimiento salen de los helpers.

- [ ] **Step 3: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 4: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la Task 4 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commercial-kpis.ts src/lib/__tests__/commercial-kpis.test.ts "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): la tabla calcula la generacion de tratos"
```

---

### Task 6: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: los 183 anteriores más 10 de `kpi-score` = **193 pasados + 1 saltado**. Contar los reales y reportar la diferencia si no cuadra, en vez de ajustar el número a ojo.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: `43 passed` (los 42 actuales más 1).

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-tratos` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales, clientes y procesos
> internos son justo lo que no puede acabar en un repositorio público: meterlos dentro del propio
> comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero
> fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe, la
> comprobación no está hecha: no se puede dar por buena.

---

### Task 7: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Este PR **cambia lo que se ve** y no trae migración. Recordar que no despliegue hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-tratos
```

PR contra `main` titulado `feat(kpis): generacion de tratos desde el esquema crm del hub`, explicando que la premisa de "el hub solo replica Books" era falsa, qué se calcula ahora y qué sigue pendiente. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- `tratos_ganados`: falta acordar qué valores de `stage` cuentan como ganado.
- `tickets_st`: `desk.tickets` está disponible, pero "en plazo" necesita definirse contra los campos reales de Desk.
- `ingresos_proyectos`: sigue necesitando carga manual.
- Replicar `crm.accounts` en el hub para cruzar por NIT en vez de por nombre.
