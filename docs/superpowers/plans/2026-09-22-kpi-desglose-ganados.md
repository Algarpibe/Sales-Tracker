# Desglose de "Tratos cerrados ganados" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulsar la cifra de un mes en la fila "Tratos cerrados ganados" abre el mismo diálogo de detalle que ya tienen las cuatro filas de ventas y generación de tratos, con la cuenta de cada trato ganado ese mes.

**Architecture:** Ampliar `getHubWonDealsMonth` para que traiga también `account_name`, agrupando por cuenta y mes en vez de solo por mes. El resto —`toMonthlySeries` para el total de la fila y `monthBreakdown` para el desglose— ya existe y se reutiliza sin cambios. Sin migración.

**Spec:** se apoya en `docs/superpowers/specs/2026-09-16-kpi-tratos-design.md` y en `docs/superpowers/plans/2026-09-22-kpi-desglose-mes.md`, que trajeron el diálogo de detalle para las otras cuatro filas. Este plan solo extiende la consulta y engancha una fila más.

---

## Por qué esta fila se dejó fuera del PR anterior, y qué cambia

`getHubWonDealsMonth` agrupaba solo por mes: `SELECT extract(month...), count(*) ... GROUP BY extract(month...)`. Sin la cuenta, no hay nada que desglosar. Se amplía para agrupar también por `account_name`, con la misma forma que ya usa `getHubDealsMonth` para las otras dos filas de tratos.

**"Tratos cerrados ganados" no tiene reparto nuevo/existente**: es una sola serie, a diferencia de las cuatro filas que ya son pulsables. `monthBreakdown` y `BreakdownInput` están escritos para dos series porque `nuevo: boolean` filtra por eso. En vez de escribir una función de desglose paralela, las filas de esta serie se marcan con `nuevo: true` y se piden siempre con `serie: "nuevos"`: como todas cumplen esa condición, `monthBreakdown` las devuelve todas. Es una convención, no un cliente nuevo de verdad, así que lleva un comentario explicándolo donde se construye.

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-desglose-ganados`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio ni nombre real de cliente, cuenta o comercial, en código, tests, comentarios ni documentación.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA (así lo pide este repositorio, aunque el entorno pueda sugerir otra cosa).
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración y sin cambios en la semilla.**
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; **esperar 60 s entre ejecuciones**.
- **`sed -i` convierte el fichero entero de CRLF a LF en este repo.** Usar un script de node que preserve el final de línea original.

## Contexto verificado

- `crm.deals` de producción tiene **cero tratos ganados sin `account_name`**, en toda la historia. Añadir `AND d.account_name IS NOT NULL` no pierde ningún trato real.
- La semilla E2E (`e2e/db/seed-hub.mjs`) siembra un trato ganado por mes, todos de la misma cuenta (`CUENTA_EXISTENTE`, "Alfa Industrial"), salvo agosto que la escribe en mayúsculas. Cualquier mes salvo agosto sirve para un test simple con una sola línea de detalle.
- `DealMonthRow` (`{ account_name, mes, tratos }`) ya existe en `src/lib/kpi-score.ts` y es estructuralmente compatible con `MonthCountRow` (`{ mes, tratos }`): `toMonthlySeries` sigue funcionando sin cambios aunque `getHubWonDealsMonth` devuelva `DealMonthRow[]`.
- `breakdownSourceFor`, `CeldaSeleccionada`, el diálogo y `detalleEnlaza` ya son genéricos: no hace falta tocarlos salvo para añadir el caso de `tratos_ganados` en `breakdownSourceFor`. `detalleEnlaza` ya excluye esa clave por defecto (solo enlaza `ventas_nuevos`/`ventas_existentes`), así que las cuentas de tratos ganados no enlazarán a ninguna ficha, igual que las otras dos filas de tratos.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/db/hub-kpi.ts` | Modificar | `getHubWonDealsMonth` agrupa también por cuenta. |
| `src/actions/kpi-actions.ts` | Modificar | Tipo de retorno de `getKpiWonDealsMonthly`. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Test del desglose de esta fila. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Construir el desglose y engancharlo. |

---

### Task 1: La consulta trae también la cuenta

**Files:**
- Modify: `src/db/hub-kpi.ts`
- Modify: `src/actions/kpi-actions.ts`

- [ ] **Step 1: Ampliar el SQL**

En `src/db/hub-kpi.ts`, sustituir el cuerpo de `getHubWonDealsMonth` para que agrupe también por `account_name`, filtre los nulos y devuelva `DealMonthRow[]`:

```ts
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
  const { rows } = await getHubPool().query(sql, [f.anio, [...WON_DEAL_STAGES], f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}
```

Actualizar el comentario de cabecera de la función si sigue vigente; el resto del razonamiento (por qué `closing_date`, por qué filtrar por fase) no cambia.

- [ ] **Step 2: El tipo de retorno de la acción**

En `src/actions/kpi-actions.ts`, `getKpiWonDealsMonthly` pasa a devolver `Promise<DealMonthRow[]>`. Si `MonthCountRow` queda sin usar en ese fichero, quitar el import.

- [ ] **Step 3: Verificar contra la base de test**

Run: `E2E_PG_PORT=55433 npm run e2e:db:up && E2E_PG_PORT=55433 npm run e2e:db:reset`
Expected: termina sin error.

Run: `docker exec salestracker-postgres-e2e psql -U postgres -d zoho_hub_e2e -c "SELECT extract(month from d.closing_date)::int AS mes, d.account_name, count(*) FROM crm.deals d WHERE d.stage = 'Cerrado ganado' AND extract(year from d.closing_date) = extract(year from now()) GROUP BY 1,2 ORDER BY 1"`
Expected: 12 filas, una por mes, todas con la misma cuenta salvo la de agosto en mayúsculas. Pegar la salida en el informe.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.
Run: `npm test` → sigue en 212 pasados + 1 saltado: este cambio no toca ninguna función pura, así que no hay tests nuevos que escribir aquí.

```bash
git add src/db/hub-kpi.ts src/actions/kpi-actions.ts
git commit -m "feat(kpis): la consulta de tratos ganados trae tambien la cuenta"
```

---

### Task 2: El test E2E, en rojo

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Escribir el test**

Añadir al final, reutilizando `abrirComercial`:

```ts
test("pulsar la cifra de tratos ganados abre su detalle", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Tratos cerrados ganados/ });
  // Enero: la semilla gana un trato cada mes, siempre de la misma cuenta salvo
  // agosto, que la escribe en mayusculas. Enero evita esa variante.
  await fila.getByRole("button").nth(0).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Enero");
  await expect(dialogo.getByText("1 cliente")).toBeVisible();
  await expect(dialogo.getByText("Total: 1")).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: falla porque la fila todavía no tiene botones. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): pulsar la cifra de tratos ganados abre su detalle"
```

---

### Task 3: Enganchar la fila

**Files:**
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Construir el desglose**

Leer el componente entero antes de tocarlo. Junto a donde se construyen `mensualesBreakdown` y `tratosBreakdown`, añadir:

```ts
// tratos_ganados no reparte nuevo/existente: es una sola serie. nuevo: true es
// una convencion, no un cliente nuevo de verdad, para poder reutilizar
// monthBreakdown pidiendo siempre la serie "nuevos" y que devuelva todas las filas.
const ganadosBreakdown: BreakdownInput[] = ganados.map((r) => ({
  nombre: r.account_name,
  mes: r.mes,
  valor: r.tratos,
  nuevo: true,
}));
```

Devolverla junto a las otras dos desde el `useMemo`, y añadir `ganados` a sus dependencias si no estuviera ya.

- [ ] **Step 2: Engancharla en `breakdownSourceFor`**

Añadir el caso:

```ts
case "tratos_ganados":
  return { rows: ganadosBreakdown, serie: "nuevos" };
```

Pasar `ganadosBreakdown` como argumento a `breakdownSourceFor` donde se llama, igual que ya se pasan `mensualesBreakdown` y `tratosBreakdown`.

- [ ] **Step 3: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 4: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la Task 2 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde (9 en total: 2 de setup + 7).

Si un aserto falla por cómo quedó el DOM y no por el comportamiento, ajustar el **selector**, nunca lo que comprueba, y explicarlo.

- [ ] **Step 5: Commit**

```bash
git add "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): la cifra de tratos ganados abre el detalle de la cuenta"
```

---

### Task 4: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: `212 passed | 1 skipped`, sin cambios: este PR no añade funciones puras nuevas.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: los 45 actuales más 1.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-desglose-ganados` sin ficheros modificados.

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

### Task 5: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Este PR **cambia lo que se ve** y no trae migración. Recordar que no despliegue hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-desglose-ganados
```

PR contra `main` titulado `feat(kpis): el detalle de la cifra de tratos ganados`, explicando por qué esta fila se dejó fuera del PR anterior y qué cambió en la consulta. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Desglosar "Incremento de Servicio Técnico": sigue siendo un porcentaje agregado.
- Cambiar `detalleEnlaza` para que las cuentas de tratos ganados enlacen a algún sitio: son cuentas de CRM, pueden no existir como cliente en Books.
