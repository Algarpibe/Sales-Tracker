# Ingresos por proyectos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un administrador marca órdenes de venta como ingresos de proyecto desde un diálogo que se abre al pulsar la cabecera de la fila "Ingresos por proyectos", y la fila suma esas órdenes por mes en vivo.

**Architecture:** Tabla nueva `kpi_project_orders` en la app que guarda solo el id de la orden; dos consultas al hub (buscar y resolver por ids) que calculan el importe neto en vivo con la fórmula ya probada en `getHubCustomerMonthSales`; acciones de servidor con `requireRole("admin")` para marcar/desmarcar; un diálogo de gestión distinto del de detalle por celda que ya existe.

**Spec:** `docs/superpowers/specs/2026-09-22-kpi-ingresos-proyectos-design.md`

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-ingresos-proyectos`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio ni nombre real de cliente, cuenta o comercial, en código, tests, comentarios ni documentación.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Este PR trae migración** (`0010`): el usuario la ejecuta en el cliente Postgres antes de desplegar.
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; **esperar 60 s entre ejecuciones**.
- **`sed -i` convierte el fichero entero de CRLF a LF en este repo.** Usar un script de node que preserve el final de línea original.
- **base-ui, no Radix.** Comprobar la API real de `src/components/ui/dialog.tsx` y `src/components/ui/command.tsx` antes de usarlos.

## Contexto verificado

- Zoho no distingue "proyecto" de ninguna forma: sin custom fields en Órdenes de venta, sin etiqueta, y el `Type` de los tratos de CRM solo distingue cliente nuevo/existente. El etiquetado manual es necesario, no hay nada que automatizar.
- La fórmula de importe neto probada está en `src/db/hub-customer-month-sales.ts`: `bcy_rate * quantity * (1 - descuento de cabecera / bcy_sub_total)`. Se reutiliza tal cual, adaptada a `SALES_ORDER` únicamente y agrupando por orden en vez de por cliente y mes.
- `onConflictDoNothing()` existe en la versión de Drizzle instalada.
- `deleteUser` en `src/actions/admin-actions.ts` borra explícitamente la fila de `profiles`; el `ON DELETE SET NULL` de `tagged_by` se dispara con ese borrado sin tocar `deleteUser`.
- `books.sales_orders` del hub falso tiene `salesorder_id`, `date`, `status`, `customer_name`, `bcy_sub_total`, `raw`. Si `raw->>'salesorder_number'` no existe en el hub real, la búsqueda funciona igual por cliente e id interno; verificar y adaptar en la Task 1.
- `src/components/ui/command.tsx` (sobre `cmdk`) ya existe para listas con buscador; `grouping-manager.tsx` es un ejemplo de uso real a copiar.
- El diálogo de detalle por celda que ya tiene la tabla (PR #14-#16) se abre desde una celda de mes y es de solo lectura. Este se abre desde la **cabecera de la fila** y permite escribir. Deben coexistir sin confundirse.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `drizzle/0010_kpi_project_orders.sql` | Crear | Tabla de órdenes marcadas. |
| `src/db/schema.ts` | Modificar | `kpiProjectOrders`. |
| `src/db/hub-kpi.ts` | Modificar | `searchHubSalesOrders`, `getHubOrdersByIds`. |
| `src/actions/kpi-actions.ts` | Modificar | Buscar, listar, marcar y desmarcar. |
| `src/lib/kpi-score.ts` | Modificar | `sumByMonth`. |
| `src/lib/__tests__/kpi-score.test.ts` | Modificar | Tests de `sumByMonth`. |
| `src/lib/commercial-kpis.ts` | Modificar | La fila pasa a `auto`. |
| `src/lib/__tests__/commercial-kpis.test.ts` | Modificar | El recuento de automáticos. |
| `e2e/db/seed-hub.mjs` | Modificar | Una orden identificable para el test. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Dos tests: visibilidad y flujo completo. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Botón de gestión y diálogo nuevo. |

---

### Task 1: La migración y el esquema

**Files:**
- Create: `drizzle/0010_kpi_project_orders.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: La tabla**

```sql
-- Ordenes de venta marcadas a mano como ingresos de proyecto. Solo la referencia:
-- el importe y la fecha se calculan siempre en vivo contra el hub, nunca se duplican
-- aqui, para que una orden editada en Zoho despues de marcarla siga reflejando su
-- valor actual.
CREATE TABLE IF NOT EXISTS kpi_project_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hub_order_id text NOT NULL,
  tagged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tagged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_project_orders_unique UNIQUE (company_id, hub_order_id)
);
```

- [ ] **Step 2: Misma forma en Drizzle**

Al final de `src/db/schema.ts`, después de `kpiTargets`:

```ts
export const kpiProjectOrders = pgTable("kpi_project_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  hub_order_id: text("hub_order_id").notNull(),
  tagged_by: uuid("tagged_by").references(() => profiles.id, { onDelete: "set null" }),
  tagged_at: timestamp("tagged_at", tsString).notNull().defaultNow(),
}, (t) => [
  unique("kpi_project_orders_unique").on(t.company_id, t.hub_order_id),
]);
```

- [ ] **Step 3: Aplicar y comprobar contra la base real**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error, con la línea `migracion aplicada: 0010_kpi_project_orders.sql`.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d salestracker_e2e -c "\d kpi_project_orders"`
Expected: `tagged_by` nullable, la restricción única sobre `(company_id, hub_order_id)`. Pegar la salida.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT jsonb_object_keys(raw) FROM books.sales_orders LIMIT 20"`
Expected: comprobar si `salesorder_number` u otro identificador legible existe en `raw` del hub falso. Si no existe ni en el hub falso ni se puede confirmar en el real, las Tasks 2 y 3 buscan solo por `customer_name` y `salesorder_id`; anotarlo en el informe.

Run: `npm run typecheck` → sin salida, código 0.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0010_kpi_project_orders.sql src/db/schema.ts
git commit -m "feat(kpis): tabla de ordenes marcadas como ingresos de proyecto"
```

---

### Task 2: Consultas al hub

**Files:**
- Modify: `src/db/hub-kpi.ts`

- [ ] **Step 1: Buscar y resolver por ids**

Leer `src/db/hub-customer-month-sales.ts` entero antes de escribir, para copiar la fórmula exacta.

```ts
interface HubOrderRow {
  hub_order_id: string;
  customer_name: string;
  date: string;
  importe: number;
}

// Importe neto de una orden de venta: misma fórmula que getHubCustomerMonthSales,
// agrupada por orden en vez de por cliente y mes, para poder mostrarla en el
// buscador y en la lista de marcadas.
const IMPORTE_ORDEN = `
  round(sum(l.bcy_rate * l.quantity *
    COALESCE(1 - COALESCE((s.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(s.bcy_sub_total, 0), 1)
  )::numeric, 2)::float8`;

export async function searchHubSalesOrders(query: string): Promise<HubOrderRow[]> {
  const like = `%${query}%`;
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.status NOT IN ('void','draft')
      AND (s.customer_name ILIKE $1 OR s.salesorder_id ILIKE $1)
    GROUP BY s.salesorder_id, s.customer_name, s.date
    ORDER BY s.date DESC
    LIMIT 25`;
  const { rows } = await getHubPool().query(sql, [like]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}

export async function getHubOrdersByIds(ids: string[]): Promise<HubOrderRow[]> {
  if (ids.length === 0) return [];
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.salesorder_id = ANY($1::text[])
    GROUP BY s.salesorder_id, s.customer_name, s.date`;
  const { rows } = await getHubPool().query(sql, [ids]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}
```

Si la Task 1 confirmó `raw->>'salesorder_number'`, añadir `OR s.raw->>'salesorder_number' ILIKE $1` a la búsqueda y decirlo en el informe.

- [ ] **Step 2: Verificar contra la base de test**

Ejecutar `searchHubSalesOrders` con un fragmento de un nombre de cliente de la semilla y comprobar que devuelve filas con importe coherente con lo que ya calcula `getHubCustomerMonthSales` para ese cliente. Pegar la salida.

- [ ] **Step 3: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/db/hub-kpi.ts
git commit -m "feat(kpis): buscar ordenes de venta y resolverlas por id"
```

---

### Task 3: Acciones

**Files:**
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: Las cuatro acciones**

```ts
export async function searchSalesOrdersForProjects(query: string): Promise<HubOrderRow[]> {
  await requireApproved();
  const q = query.trim();
  if (q.length < 2) return [];
  return searchHubSalesOrders(q);
}

export async function getKpiProjectOrders(): Promise<HubOrderRow[]> {
  const { profile } = await requireApproved();
  const marcadas = await db
    .select({ hub_order_id: kpiProjectOrders.hub_order_id })
    .from(kpiProjectOrders)
    .where(eq(kpiProjectOrders.company_id, profile.company_id));
  return getHubOrdersByIds(marcadas.map((m) => m.hub_order_id));
}

export async function addProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile, user } = await requireRole("admin");
    const id = z.string().trim().min(1).parse(hubOrderId);
    await db.insert(kpiProjectOrders)
      .values({ company_id: profile.company_id, hub_order_id: id, tagged_by: profile.id })
      .onConflictDoNothing();
    revalidatePath("/analytics");
  });
}

export async function removeProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    await db.delete(kpiProjectOrders).where(
      and(eq(kpiProjectOrders.company_id, profile.company_id), eq(kpiProjectOrders.hub_order_id, hubOrderId))
    );
    revalidatePath("/analytics");
  });
}
```

Comprobar los nombres reales de `requireRole`/`requireApproved` (qué devuelven exactamente: `{ user, profile }`) y de `runAction`/`ActionResult` antes de copiar, como en el resto del fichero. `q.length < 2` evita golpear el hub con cada tecla de una búsqueda de una sola letra; ajustar el umbral si el patrón ya establecido en otro buscador del proyecto usa otro.

- [ ] **Step 2: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

```bash
git add src/actions/kpi-actions.ts
git commit -m "feat(kpis): acciones para buscar, marcar y desmarcar ordenes de proyecto"
```

---

### Task 4: Cálculo y catálogo (TDD con vitest)

**Files:**
- Modify: `src/lib/__tests__/kpi-score.test.ts`
- Modify: `src/lib/kpi-score.ts`
- Modify: `src/lib/__tests__/commercial-kpis.test.ts`
- Modify: `src/lib/commercial-kpis.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/kpi-score.test.ts`, añadir `sumByMonth` al import y:

```ts
describe("sumByMonth", () => {
  it("coloca cada importe en su mes", () => {
    const s = sumByMonth([{ mes: 1, importe: 100 }, { mes: 12, importe: 50 }]);
    expect(s[0]).toBe(100);
    expect(s[11]).toBe(50);
  });
  it("acumula los que caen en el mismo mes", () => {
    expect(sumByMonth([{ mes: 3, importe: 20 }, { mes: 3, importe: 5 }])[2]).toBe(25);
  });
  it("los meses sin datos quedan a cero", () => {
    expect(sumByMonth([{ mes: 5, importe: 1 }])[0]).toBe(0);
  });
  it("ignora los meses fuera de rango", () => {
    const s = sumByMonth([{ mes: 0, importe: 9 }, { mes: 13, importe: 9 }]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("devuelve siempre doce posiciones", () => {
    expect(sumByMonth([])).toHaveLength(12);
  });
});
```

En `src/lib/__tests__/commercial-kpis.test.ts`, cambiar la cifra de KPIs automáticos de **6 a 7**. **No relajarla** a `toBeGreaterThan`: la cifra exacta avisa de un cambio de catálogo no querido.

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts src/lib/__tests__/commercial-kpis.test.ts`
Expected: 5 fallan porque `sumByMonth` no existe; el del recuento falla porque sigue en 6. Pegar la salida.

- [ ] **Step 3: Implementar**

En `src/lib/kpi-score.ts`, junto a `toMonthlySeries`:

```ts
export interface MonthAmountRow { mes: number; importe: number; }

/** Suma un importe por mes. Misma forma que toMonthlySeries, pero con dinero en
 *  vez de conteos: los nombres de campo lo dicen porque no son lo mismo. */
export function sumByMonth(rows: MonthAmountRow[]): number[] {
  const out = doceCeros();
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    out[idx] += r.importe;
  }
  return out;
}
```

En `src/lib/commercial-kpis.ts`, `ingresos_proyectos` pasa a `source: "auto"`, pierde `pendingReason`.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test`
Expected: todos pasan, con 5 tests más que antes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts src/lib/commercial-kpis.ts src/lib/__tests__/commercial-kpis.test.ts
git commit -m "feat(kpis): suma mensual de ingresos por proyecto"
```

---

### Task 5: La semilla y los tests E2E, en rojo

**Files:**
- Modify: `e2e/fixtures/users.json`
- Modify: `e2e/db/seed-app.mjs`
- Modify: `e2e/auth.setup.ts`
- Modify: `e2e/constants.ts`
- Modify: `e2e/db/seed-hub.mjs`
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 0: Un usuario aprobado que no sea administrador**

**Verificado: no existe.** `e2e/db/seed-app.mjs` siembra `role: approved ? "admin" : "lector"` — el único aprobado hoy es admin, y el pendiente ni siquiera entra al panel (el middleware lo manda a `/waiting-approval`). El primer test de este plan necesita un tercero: aprobado, pero lector.

1. En `e2e/fixtures/users.json`, añadir junto a `"approved"` y `"pending"`:
   ```json
   "lector": {
     "email": "e2e-lector@example.test",
     "password": "E2ePassw0rd!2026",
     "name": "E2E Lector"
   }
   ```
2. En `e2e/db/seed-app.mjs`, dar a `seedUser` un tercer parámetro de rol explícito (o una llamada específica) para poder sembrar `approved: true` con `role: "lector"` sin tocar el significado de las dos llamadas existentes. Añadir `await seedUser(client, company.id, USERS.lector, { approved: true, role: "lector" });` junto a las otras dos.
3. En `e2e/auth.setup.ts`, un tercer bloque `setup("autenticar al usuario lector", ...)` que hace login con `USERS.lector` y guarda `LECTOR_STATE`. El fichero pasa a gastar 3 logins del presupuesto de 5/minuto; sigue dentro del límite.
4. En `e2e/constants.ts`, exportar `LECTOR_USER` y `LECTOR_STATE = "e2e/.auth/lector.json"`, mismo patrón que `APPROVED_STATE`/`PENDING_STATE`.

- [ ] **Step 1: Una orden identificable**

Comprobar si algún cliente ya sembrado sirve para buscar por nombre sin ambigüedad (por ejemplo un cliente con una sola orden en un mes concreto del año en curso). Si no, no hace falta sembrar nada nuevo: la semilla ya crea varias órdenes de venta con `salesorder_id` conocido (`SO-{year}-{month}`); usar una existente y documentar en el test cuál y por qué.

- [ ] **Step 2: Escribir los tests**

Añadir al final. **Verificado**: `e2e/specs/kpis-comerciales.spec.ts` fija `test.use({ storageState: APPROVED_STATE })` a nivel de módulo (admin); ningún fichero del repo mezcla hoy dos storageState distintos en el mismo módulo, así que no hay un ejemplo propio que copiar. Playwright permite sobreescribir el `storageState` de un `test.describe` anidado con su propio `test.use()`, que es lo que hace falta aquí para el primer test (lector) sin tocar el resto del fichero (admin):

```ts
test.describe("usuario lector", () => {
  test.use({ storageState: LECTOR_STATE });

  test("sin permisos de administrador no hay boton para gestionar ingresos por proyectos", async ({ page }) => {
    const card = await abrirComercial(page);
    const fila = card.getByRole("row", { name: /Ingresos por proyectos/ });
    await expect(fila).toBeVisible();
    await expect(fila.getByRole("button", { name: /Gestionar/ })).toHaveCount(0);
  });
});

test("un administrador marca una orden y su importe entra en la fila de ingresos por proyectos", async ({ page }) => {
  const card = await abrirComercial(page);
  const fila = card.getByRole("row", { name: /Ingresos por proyectos/ });
  await fila.getByRole("button", { name: /Gestionar/ }).click();

  const dialogo = page.getByRole("dialog", { name: /Gestionar/ });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("combobox").fill("<fragmento del cliente elegido>");
  await dialogo.getByRole("option").first().click();
  await dialogo.getByRole("button", { name: "Cerrar" }).click();

  await expect(fila.getByRole("cell").nth(<indice del mes>)).not.toHaveText("$0");
});
```

Importar `LECTOR_STATE` de `../constants` junto a los demás. El segundo test hereda el `storageState` de módulo (admin), así que no necesita nada especial.

- [ ] **Step 3: Ejecutar y verificar que fallan**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: los dos nuevos fallan porque el botón "Gestionar" no existe todavía. Pegar la salida.

- [ ] **Step 4: Commit**

```bash
git add e2e/db/seed-hub.mjs e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): gestionar ingresos por proyectos, solo administradores"
```

---

### Task 6: El botón y el diálogo de gestión

**Files:**
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: El botón, solo para administradores**

Leer el componente entero antes de tocarlo. Junto a la etiqueta de la fila `ingresos_proyectos`, un botón "Gestionar" visible solo si `profile?.role === "admin"` (mismo criterio que ya usa el proyecto para la pantalla de metas).

- [ ] **Step 2: El diálogo**

Nuevo, distinto del diálogo de detalle por celda que ya existe (`celda`/`setCelda`): un estado propio, por ejemplo `gestionandoProyectos: boolean`.

Contenido, siguiendo la forma de `grouping-manager.tsx` para el buscador `Command`:
- Buscador que llama a `searchSalesOrdersForProjects` con `useQuery` y la query como parte de la clave, o con una mutación bajo demanda; mostrar cliente, fecha e importe de cada resultado, con botón "Agregar" que llama a `addProjectOrder` y luego invalida `["kpi-project-orders"]`.
- Lista de `getKpiProjectOrders()` (consulta `["kpi-project-orders"]`), con botón "Quitar" que llama a `removeProjectOrder` e invalida la misma clave.
- Botón "Cerrar".

- [ ] **Step 3: Enganchar la fila**

`ingresosProyectosQ` con la clave `["kpi-project-orders"]`, alimentando `sumByMonth(...)` para la fila `ingresos_proyectos`, igual que las demás filas usan `construirFila`. Esta consulta no depende de año ni de ámbito.

- [ ] **Step 4: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la Task 5 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde.

Si un aserto falla por cómo quedó el DOM y no por el comportamiento, ajustar el **selector**, nunca lo que comprueba, y explicarlo.

- [ ] **Step 6: Commit**

```bash
git add "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): boton y dialogo para gestionar ingresos por proyectos"
```

---

### Task 7: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: los 218 anteriores más 5 = **223 pasados + 1 saltado**.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: los 46 actuales más 2.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-ingresos-proyectos` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales, clientes y cuentas
> son justo lo que no puede acabar en un repositorio público: meterlos dentro del propio comando de
> detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero fuera del
> repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe, la comprobación
> no está hecha: no se puede dar por buena.

---

### Task 8: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. **Este PR trae migración** (`0010`): recordar que hay que ejecutarla en el cliente Postgres antes de desplegar, y que no hay que desplegar hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-ingresos-proyectos
```

PR contra `main` titulado `feat(kpis): gestionar ingresos por proyectos desde la tabla comercial`, explicando que Zoho no distingue proyectos de ningún modo (verificado) y por eso el etiquetado es manual, y que el importe se calcula siempre en vivo. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Marcar facturas, solo órdenes de venta.
- Papelera o deshacer para un borrado accidental de marca.
- Mostrar quién y cuándo marcó cada orden (las columnas existen, no se exponen en esta versión).
