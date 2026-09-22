# Desglose de la cifra mensual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al pulsar la cifra de un mes en las cuatro filas de ventas y de generación de tratos, se abre el detalle: qué clientes o cuentas componen esa cifra y con cuánto.

**Architecture:** Sin consultas nuevas. La tabla ya tiene en memoria las ventas por cliente y mes y los tratos por cuenta y mes; el desglose filtra lo que ya está. El criterio de nuevo/existente se extrae a predicados únicos que usan tanto el reparto como el desglose, para que no puedan divergir.

**Tech Stack:** React 19, base-ui, vitest, Playwright.

---

## Por qué sale barato, y dónde está el riesgo

La cifra de cada celda es una suma de filas que el componente ya tiene cargadas (`mensuales` y `tratos`). El detalle no pide nada al servidor: es filtrar por mes y por serie.

El riesgo no es el diálogo, es la **clasificación**. Hoy el criterio de "cliente nuevo" vive dentro de `splitNewExisting` y `splitDealsNewExisting`, y son **dos criterios distintos**:

- Ventas: es nuevo cuando su primer año con ventas es el año analizado, comparando por el nombre **crudo**.
- Tratos: es existente solo si tiene ventas en un año **estrictamente anterior**, comparando por la clave **normalizada**; todo lo demás es nuevo, incluido quien nunca compró.

Si el desglose reimplementa esas reglas, pueden separarse de las del reparto y el detalle dejaría de cuadrar con la cifra **sin romper nada**: simplemente mostraría otra cosa. Por eso se extraen a predicados que usan los dos caminos, y se añade un test que comprueba que la suma del desglose es exactamente el valor de la celda.

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-desglose-mes`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio ni nombre real de cliente, cuenta o comercial, en código, tests, comentarios ni documentación.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración y sin cambios en la semilla.**
- **E2E:** Docker arrancado; `E2E_PG_PORT=55433` siempre; puerto 3100 libre antes de cada ejecución; **esperar 60 s entre ejecuciones**.
- **`sed -i` convierte el fichero entero de CRLF a LF en este repo.** Usar un script de node que preserve el final de línea original.
- **base-ui, no Radix.** Comprobar la API real de `src/components/ui/dialog.tsx` antes de usarlo.

## Contexto verificado del código actual

- `commercial-kpi-table.tsx:166` tiene `mensuales` (`{customer, mes, importe}[]`) y `:176` construye `primerAnio` con `firstYearByCustomer(historico)`. `tratos` es `{account_name, mes, tratos}[]`.
- `construirFila` produce `FilaKpi` con `meses: (number|null)[]`, y la celda se pinta en la línea 297 con `formatValor(v, f.def.unit)`.
- `MONTHS` de `src/lib/constants.ts` tiene `value`, `label` y `full`: el título del diálogo usa `full`.
- `customerHref(name)` existe en `src/lib/customer-detail.ts:80` y lleva a la ficha del cliente.
- Existen `dialog.tsx`, `popover.tsx` y `sheet.tsx` en `src/components/ui/`.
- `tratos_ganados` solo trae `{mes, tratos}`, sin detalle, e `incremento_st` es un porcentaje agregado: **ninguna de las dos es pulsable** en este PR.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/kpi-score.ts` | Modificar | Predicados de clasificación y `monthBreakdown`. |
| `src/lib/__tests__/kpi-score.test.ts` | Modificar | Tests, incluido el de coherencia con la celda. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | Celda pulsable y diálogo. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Test del desglose. |

---

### Task 1: Un solo criterio de clasificación, y el desglose (TDD con vitest)

**Files:**
- Modify: `src/lib/__tests__/kpi-score.test.ts`
- Modify: `src/lib/kpi-score.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/__tests__/kpi-score.test.ts`, con los nombres nuevos en el import:

```ts
describe("esVentaDeClienteNuevo", () => {
  const primerAnio = new Map<string, number>([["Alfa", 2023], ["Beta", 2026]]);
  it("es nuevo quien compra por primera vez el anio analizado", () => {
    expect(esVentaDeClienteNuevo("Beta", primerAnio, 2026)).toBe(true);
  });
  it("no es nuevo quien ya compraba antes", () => {
    expect(esVentaDeClienteNuevo("Alfa", primerAnio, 2026)).toBe(false);
  });
  it("quien no esta en el mapa no es nuevo por esta via", () => {
    // Para ventas, si no hay fila de ventas tampoco hay importe que repartir.
    expect(esVentaDeClienteNuevo("Gamma", primerAnio, 2026)).toBe(false);
  });
});

describe("esTratoDeClienteNuevo", () => {
  const primerAnio = new Map<string, number>([["Alfa Industrial", 2023], ["Beta", 2026]]);
  it("no es nuevo quien ya compraba en un anio anterior", () => {
    expect(esTratoDeClienteNuevo("Alfa Industrial", primerAnio, 2026)).toBe(false);
  });
  it("es nuevo quien compro por primera vez este anio", () => {
    expect(esTratoDeClienteNuevo("Beta", primerAnio, 2026)).toBe(true);
  });
  it("es nuevo quien nunca compro", () => {
    expect(esTratoDeClienteNuevo("Prospecto", primerAnio, 2026)).toBe(true);
  });
  it("cruza aunque la grafia no coincida", () => {
    expect(esTratoDeClienteNuevo("ALFA INDUSTRIAL", primerAnio, 2026)).toBe(false);
  });
});

describe("monthBreakdown", () => {
  const filas = [
    { nombre: "Alfa", mes: 3, valor: 100, nuevo: false },
    { nombre: "Beta", mes: 3, valor: 300, nuevo: true },
    { nombre: "Alfa", mes: 3, valor: 50, nuevo: false },
    { nombre: "Alfa", mes: 4, valor: 999, nuevo: false },
  ];

  it("solo devuelve la serie pedida", () => {
    expect(monthBreakdown(filas, 3, "nuevos").map((r) => r.nombre)).toEqual(["Beta"]);
  });
  it("agrupa por nombre y suma", () => {
    const r = monthBreakdown(filas, 3, "existentes");
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ nombre: "Alfa", valor: 150 });
  });
  it("ordena de mayor a menor", () => {
    const rows = [
      { nombre: "Pequeno", mes: 1, valor: 10, nuevo: true },
      { nombre: "Grande", mes: 1, valor: 90, nuevo: true },
    ];
    expect(monthBreakdown(rows, 1, "nuevos").map((r) => r.nombre)).toEqual(["Grande", "Pequeno"]);
  });
  it("un mes sin filas devuelve la lista vacia", () => {
    expect(monthBreakdown(filas, 12, "nuevos")).toEqual([]);
  });
});

describe("el desglose cuadra con la celda", () => {
  // Es la garantia que justifica extraer los predicados: si el reparto y el
  // desglose usaran criterios distintos, el detalle mostraria otra cosa que la
  // cifra sin que nada fallase.
  const primerAnio = new Map<string, number>([["Alfa", 2023], ["Beta", 2026]]);
  const ventas = [
    { customer: "Alfa", mes: 2, importe: 100 },
    { customer: "Beta", mes: 2, importe: 300 },
    { customer: "Beta", mes: 2, importe: 50 },
  ];

  it("la suma del desglose es el valor de ese mes en la serie", () => {
    const split = splitNewExisting(ventas, primerAnio, 2026);
    const entrada = ventas.map((v) => ({
      nombre: v.customer,
      mes: v.mes,
      valor: v.importe,
      nuevo: esVentaDeClienteNuevo(v.customer, primerAnio, 2026),
    }));
    for (const serie of ["nuevos", "existentes"] as const) {
      const suma = monthBreakdown(entrada, 2, serie).reduce((s, r) => s + r.valor, 0);
      expect(suma).toBe(split[serie][1]);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts`
Expected: fallan los nuevos porque las funciones no existen; los anteriores siguen pasando. Pegar la salida.

- [ ] **Step 3: Implementar**

En `src/lib/kpi-score.ts`, extraer los dos predicados y **usarlos dentro de los dos `split` que ya existen**, sustituyendo la condición que hoy llevan en línea. El comportamiento no cambia: sus tests actuales son la prueba.

```ts
/**
 * ¿La venta de este cliente cuenta como de cliente nuevo ese año? Compara por el
 * nombre crudo de Books, que es la clave del mapa de antigüedad.
 */
export function esVentaDeClienteNuevo(
  customer: string,
  firstYear: Map<string, number>,
  year: number
): boolean {
  return firstYear.get(customer) === year;
}

/**
 * ¿El trato de esta cuenta cuenta como de cliente nuevo ese año? Criterio distinto
 * al de ventas a propósito: aquí es existente **solo** si compró en un año anterior,
 * y quien nunca compró es nuevo. Además cruza por clave normalizada, porque el
 * nombre viene de CRM y no de Books.
 */
export function esTratoDeClienteNuevo(
  account: string,
  firstYear: Map<string, number>,
  year: number
): boolean {
  const porClave = firstYearPorClave(firstYear);
  const primero = porClave.get(normalizeCustomerKey(account));
  return primero === undefined || primero >= year;
}
```

`splitDealsNewExisting` ya construye ese mapa normalizado: extraerlo a `firstYearPorClave` y que lo usen los dos. Si recalcularlo por fila resultara caro, que el predicado acepte el mapa ya normalizado y sea el llamador quien lo construya una vez; decidirlo al implementar y explicarlo.

Y el desglose:

```ts
/** Una línea del detalle de una celda. */
export interface BreakdownRow {
  nombre: string;
  valor: number;
}

/** Fila de origen ya clasificada, tal y como la arma la tabla. */
export interface BreakdownInput extends BreakdownRow {
  mes: number;
  nuevo: boolean;
}

/**
 * Qué compone la cifra de un mes: agrupa por nombre, suma y ordena de mayor a
 * menor. La clasificación llega hecha, con los mismos predicados que usa el
 * reparto, para que el detalle no pueda decir algo distinto que la celda.
 */
export function monthBreakdown(
  rows: BreakdownInput[],
  mes: number,
  serie: "nuevos" | "existentes"
): BreakdownRow[] {
  const quiero = serie === "nuevos";
  const porNombre = new Map<string, number>();
  for (const r of rows) {
    if (r.mes !== mes || r.nuevo !== quiero) continue;
    porNombre.set(r.nombre, (porNombre.get(r.nombre) ?? 0) + r.valor);
  }
  return [...porNombre.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test`
Expected: todos pasan. **Los tests de `splitNewExisting` y `splitDealsNewExisting` tienen que seguir verdes sin tocarlos**: son la prueba de que extraer los predicados no cambió el reparto. Si alguno falla, PARAR y reportar en vez de ajustar el test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): un solo criterio de cliente nuevo y desglose por mes"
```

---

### Task 2: El test E2E, en rojo

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts`

- [ ] **Step 1: Escribir el test**

Añadir al final, reutilizando `abrirComercial`. La semilla siembra ventas de varios clientes, así que el aserto se apoya en que el diálogo aparece con su título y con al menos un cliente, no en un importe concreto:

```ts
test("pulsar la cifra de un mes abre el detalle de esa celda", async ({ page }) => {
  const card = await abrirComercial(page);

  const fila = card.getByRole("row", { name: /Ventas clientes existentes/ });
  // Febrero: la semilla factura en meses pares, asi que hay importe que desglosar.
  await fila.getByRole("button").nth(1).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Febrero");
  // El pie repite el total, que es la autocomprobacion de que el detalle cuadra.
  await expect(dialogo.getByText("Total")).toBeVisible();
});
```

Ajustar el índice y el mes a lo que tenga la semilla de verdad: comprobarlo antes con una consulta a `zoho_hub_e2e` y explicarlo en el informe. Lo que NO se puede cambiar es qué comprueba el test.

- [ ] **Step 2: Ejecutar y verificar que falla**

Comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: `1 failed` y el resto en verde. Falla porque la celda todavía no es un botón. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): pulsar la cifra de un mes abre su detalle"
```

---

### Task 3: La celda pulsable y el diálogo

**Files:**
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`

- [ ] **Step 1: Preparar las filas de origen**

Leer el componente entero antes de tocarlo. En el mismo `useMemo` que ya construye `primerAnio`, armar dos listas de `BreakdownInput`:

- de `mensuales`: `{ nombre: r.customer, mes: r.mes, valor: r.importe, nuevo: esVentaDeClienteNuevo(...) }`
- de `tratos`: `{ nombre: r.account_name, mes: r.mes, valor: r.tratos, nuevo: esTratoDeClienteNuevo(...) }`

Guardarlas donde el diálogo pueda leerlas. **Usar los predicados exportados, no reimplementar la condición.**

- [ ] **Step 2: Qué filas son pulsables**

Solo `ventas_nuevos`, `ventas_existentes`, `tratos_nuevos` y `tratos_existentes`. Cada una sabe de qué lista tira y de qué serie.

Una celda es pulsable cuando su fila lo es **y** su valor es mayor que cero: un mes a cero no tiene nada que enseñar.

La celda pulsable es un `<button>` de verdad, no un `div` con `onClick`, para que funcione con teclado. Que se note que se puede pulsar: subrayado al pasar por encima o similar, siguiendo lo que ya use el proyecto.

- [ ] **Step 3: El diálogo**

Comprobar antes la API real de `src/components/ui/dialog.tsx`, que es **base-ui y no Radix**.

- Título con el KPI, el mes en su forma larga (`MONTHS[i].full`), el año y el ámbito: qué comercial o "Total compañía", y si son Órdenes de Venta o Facturas. Sin eso, la cifra no se puede interpretar.
- Lista de `monthBreakdown(...)`: nombre y valor, formateado con `formatValor` y la unidad del KPI, alineado a la derecha y con `tabular-nums`.
- En las dos filas de ventas, cada nombre enlaza a `customerHref(nombre)`. En las de tratos **no**: son cuentas de CRM y pueden no existir como cliente en Books.
- Pie con el número de clientes y el **total**, que tiene que coincidir con la celda pulsada.
- Si la lista sale vacía, decirlo en vez de mostrar un diálogo en blanco.

- [ ] **Step 4: Gates**

Run: `npm run typecheck` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`. Si el componente añade warnings, arreglarlos.

- [ ] **Step 5: Ejecutar los E2E y verificar que pasan**

Esperar 60 s desde la Task 2 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde.

Si un aserto falla por cómo quedó el DOM y no por el comportamiento, ajustar el **selector**, nunca lo que comprueba, y explicarlo.

- [ ] **Step 6: Commit**

```bash
git add "src/components/charts/comercial/commercial-kpi-table.tsx"
git commit -m "feat(kpis): la cifra de cada mes abre el detalle de la celda"
```

---

### Task 4: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios**

Run: `npm test`
Expected: los 200 anteriores más los nuevos. Contar los reales y reportar la cifra.

- [ ] **Step 2: Suite E2E completa**

Esperar 60 s y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run test:e2e`
Expected: los 44 actuales más 1.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-desglose-mes` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de clientes, comerciales y procesos
> internos son justo lo que no puede acabar en un repositorio público: meterlos dentro del propio
> comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero
> fuera del repositorio, un término por línea, que escribe quien ejecuta el plan. Si no existe, la
> comprobación no está hecha: no se puede dar por buena.

---

### Task 5: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Este PR **cambia lo que se ve** y no trae migración. Recordar que no despliegue hasta que la fusión esté confirmada.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpi-desglose-mes
```

PR contra `main` titulado `feat(kpis): el detalle de cada cifra mensual`, explicando que no hay consultas nuevas, por qué se extrajeron los predicados y qué filas no son pulsables. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- **Tratos cerrados ganados**: la consulta devuelve solo el conteo por mes, sin detalle de cada trato. Haría falta ampliarla.
- **Incremento de Servicio Técnico**: es un porcentaje sobre datos ya agregados; un desglose ahí significaría otra cosa.
- Desglosar las columnas de promedio y aporte.
- Exportar el detalle a Excel.
