# Promedio a la fecha en la tabla de KPIs comerciales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La tabla de KPIs comerciales enseña, junto al promedio y el aporte anuales, un promedio y un aporte **a la fecha** calculados solo sobre los periodos transcurridos (incluido el que está en curso), y la fila TOTAL tiene las dos versiones.

**Architecture:** Dos funciones puras nuevas en `src/lib/kpi-score.ts`: `periodosTranscurridos` decide cuántos periodos del año cuentan y `valorAlCierreDelAnio` da el valor del incremento de Servicio Técnico al cierre del año (T4). La tabla calcula en cada fila las dos parejas (promedio/logro/aporte anual y a la fecha) con un único instante `hoy`, y el TOTAL sale de dos `scoreboard` y dos sumas de aportes. Sin consultas nuevas, sin migración y sin tocar el worker.

**Tech Stack:** Next 16, React, @tanstack/react-query, vitest (entorno node, solo funciones puras), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-kpi-promedio-a-la-fecha-design.md`.

---

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpi-promedio-a-la-fecha`, ya creada y con la spec commiteada (`ce7cb30`). No cambiar de rama y no hacer push hasta la Task 6.
- **Repo público:** ningún nombre real de cliente, comercial ni importe real en código, tests, comentarios ni documentación. Los tests usan solo la semilla inventada de `e2e/db/`.
- **Commits:** convencionales, en español **sin tildes ni eñes**, **sin** `Co-Authored-By` ni atribución a IA. Un commit por task.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` ni `git reset`.
- **Nada de `sed -i`:** los ficheros tienen finales CRLF en la copia de trabajo y `sed -i` los reescribe enteros en LF. Editar con la herramienta Edit.
- **Comentarios de código** en español y explicando el **porqué**. Los de `src/` llevan tildes como el resto del fichero; los nombres de `it(...)` de `kpi-score.test.ts` y los comentarios de `e2e/` van sin tildes, como ya están.
- **Tipos:** `npx tsc --noEmit` sin salida.
- **Lint:** baseline de exactamente **10 warnings y 0 errores**. Cada task solo añade lo que usa: un import sin usar suma un warning.
- **Vitest:** hoy **284 pasados + 1 saltado**. No hay librería de tests de componentes: la tabla la cubre el E2E.
- **E2E:** hoy **54/54**. Docker Desktop tiene que estar arrancado (arrancarlo si no lo está); `E2E_PG_PORT=55433` siempre; el puerto 3100 libre antes de cada ejecución; **esperar al menos 60 s entre ejecuciones de Playwright** (el login admite 5 intentos por minuto y el setup gasta 3). Los E2E corren con el **reloj real del sistema** y el navegador usa la misma zona horaria que el proceso de Playwright (no hay `timezoneId` en `playwright.config.ts`).

## Contexto verificado

- `KpiPeriod` vive en `src/lib/commercial-kpis.ts:2` (`"mensual" | "trimestral" | "semestral"`) y `kpi-score.ts` ya lo importa (línea 1). `MESES = 12` (línea 10) y `MESES_POR_CUBO` (líneas 222-226) ya existen en `kpi-score.ts`: `periodosTranscurridos` los reutiliza.
- `valorAlCierre(serie, year, hoy)` (`kpi-score.ts:201-210`) lee el trimestre con `hoy.getMonth()` en hora local; en un año cerrado usa el T4 y en uno futuro devuelve `null`.
- `kpiAverage([])` ya devuelve `null` (`kpi-score.ts:248-252`), que es justo lo que pide un año futuro.
- En `commercial-kpi-table.tsx`:
  - `FilaKpi` (líneas 95-107) tiene `promedio`, `logro`, `peso`, `aporte`.
  - `construirFila` (114-142) calcula `promedio = kpiAverage(cumplimiento)` y `aporte`.
  - `construirFilaIncremento` (151-171) recibe `alCierre = valorAlCierre(st, year, new Date())` desde la línea 397.
  - El `useMemo` de las filas (331-419) ya fija un instante, `ahoraTickets = new Date().getTime()` (374), que devuelve para el detalle de tickets. Hay **ocho** llamadas a `construirFila` (379-415) y una a `construirFilaIncremento` (397).
  - `marcador` y `aporteTotal` (421-425); cabeceras «Promedio»/«Aporte» (529-530); celdas de cuerpo (600-605); `tfoot` con la cobertura y dos celdas (610-626).
  - Nadie más lee `f.promedio`, `f.logro` ni `f.aporte`.
- `CHART_HELP.kpisComerciales` (`src/lib/chart-help.ts:21`) describe el promedio: hay que actualizarlo. Ningún test lee ese texto.
- **E2E existente** (`e2e/specs/kpis-comerciales.spec.ts`): ninguna aserción usa las cabeceras «Promedio»/«Aporte» ni sus celdas. Todas las que van por posición (`CELDA_FEBRERO = 2`, `nth(1)`, `nth(3)`… `nth(11)`) apuntan a meses, que están **antes** de Dic y no se mueven. La de la cobertura busca `/cobertura: 100/`, que sigue valiendo (ver Decisión 3). **No hay que tocar ningún test existente.**
- **Semilla** (verificada):
  - `e2e/db/seed-app.mjs:105-118`: metas solo del **año en curso** y del total de compañía: `ventas_nuevos` meta 1000 y peso 60, `ventas_existentes` meta 2000 y peso 40. Ningún otro KPI tiene meta; ningún otro año tiene metas.
  - `e2e/db/seed-hub.mjs`: los años van de 2020 al actual y el año en curso tiene los **doce meses**, incluidos los que aún no han llegado. Órdenes todos los meses, facturas en los pares. Importe por línea `100 + (anio - 2020) * 50 + mes * 10 + idx * 7`: **crece cada mes**.
  - El conmutador arranca en `INVOICE` (`period-provider.tsx:24`).
  - Ningún cliente es nuevo en el año en curso, así que `ventas_nuevos` vale 0 en todos los trimestres → cumplimiento 0 %, no `null`.
  - `ventas_existentes` supera los 2000 en todos los trimestres (el menor es el T1, solo la factura de febrero: 4 000 y pico) → cumplimiento > 100 %, que en el aporte se topa a 100.
- **Consecuencia para el E2E:** la spec (§3.3) propone comprobar «Promedio a la fecha ≥ Promedio anual», pero en la semilla los trimestres futuros **no** valen 0 y cada uno factura más que el anterior, así que ocurre lo contrario: a la fecha es **menor** que anual salvo en el T4, donde son iguales. El test se diseña con eso (Decisión 5).

## Decisiones de este plan (no están en la spec o la concretan)

1. **`valorAlCierreDelAnio` en vez de `valorAlCierre(serie, year, new Date(year, 11, 31))` a secas.** La llamada literal de la spec devuelve el T4 también en un año **futuro** (con `hoy` = 31 de diciembre de ese año, el año «es el actual»). Hoy esa fila enseña «—» en un año futuro y la regla 2 de la spec dice que un año futuro no tiene nada que medir. La función nueva devuelve `null` si `year > hoy.getFullYear()` y, si no, delega en `valorAlCierre` con el 31 de diciembre, tal y como pide la spec.
2. **`construirFila` recibe `year` y `hoy`** (como dice la spec) y calcula él mismo los periodos transcurridos con `def.period`. Se añade un helper local `aporteDe(logro, peso)` para no repetir cuatro veces la regla «sin logro o sin peso no aporta».
3. **Cobertura:** si la anual y la de a la fecha coinciden, una sola línea igual que hoy: `cobertura: 100.0% del peso`. Si difieren, dos líneas: `cobertura anual: X del peso` y `cobertura a la fecha: Y del peso`. Con la semilla siempre coinciden (100 %), así que el E2E existente no cambia.
4. **Aporte del TOTAL sin nada medible:** hoy la celda Aporte del TOTAL pinta `0.0%` aunque el promedio sea «—». En un año futuro eso quedaría «Promedio a la fecha: —, Aporte a la fecha: 0.0%», que se lee como un suspenso. Las dos celdas de aporte del TOTAL pintan «—» cuando su `scoreboard` no tiene nada medible (`total === null`). Cambia también la anual por coherencia; con datos medibles no cambia nada.
5. **E2E determinista sea cual sea el mes:** en lugar de fijar una cifra o la relación «≥» de la spec (falsa con esta semilla), el test lee de la propia tabla los cuatro cumplimientos trimestrales de «Ventas clientes existentes» (bajo Mar, Jun, Sep y Dic), calcula `ceil((mes + 1) / 3)` con el reloj del sistema y comprueba que «Promedio anual» es la media de los cuatro y «Promedio a la fecha» la de los transcurridos, con tolerancia 0,1 por el redondeo a un decimal. Además, la relación estricta que impone la semilla: menor que el anual en T1-T3, igual en T4. El TOTAL es **40.0 %** en las cuatro celdas en cualquier mes: `(0 · 60 + 100 · 40) / 100`.
6. **Dos tests E2E nuevos** (cabeceras + TOTAL; y el promedio a la fecha de una fila), no uno: fallan por motivos distintos y así el informe dice cuál.
7. **Móvil:** la tabla ya está dentro de un `div` con `overflow-auto` y la primera columna es `sticky`; las dos columnas nuevas llevan `min-w` como las demás. Se comprueba a mano en la Task 5 a 390 px de ancho.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/kpi-score.ts` | Modificar | `periodosTranscurridos` y `valorAlCierreDelAnio`. |
| `src/lib/__tests__/kpi-score.test.ts` | Modificar | Tests de las dos funciones y del promedio a la fecha. |
| `src/components/charts/comercial/commercial-kpi-table.tsx` | Modificar | `FilaKpi` con los campos a la fecha, filas, dos marcadores, cuatro columnas, TOTAL y cobertura. |
| `src/lib/chart-help.ts` | Modificar | Texto de ayuda de la tabla. |
| `e2e/specs/kpis-comerciales.spec.ts` | Modificar | Dos tests nuevos al final. |

---

### Task 1: `periodosTranscurridos`

**Files:**
- Modify: `src/lib/kpi-score.ts` (tras `periodTotals`, línea 236)
- Test: `src/lib/__tests__/kpi-score.test.ts` (import de las líneas 2-18 y al final del fichero)

- [ ] **Step 1: Escribir los tests**

Con Edit, en el import de `src/lib/__tests__/kpi-score.test.ts`, sustituir:

```ts
  valorAlCierre,
  periodTotals,
```

por:

```ts
  valorAlCierre,
  periodTotals,
  periodosTranscurridos,
```

Con Edit, al final del fichero (tras el cierre del `describe("valorAlCierre", ...)`), añadir:

```ts

describe("periodosTranscurridos", () => {
  // Las fechas se construyen en hora local, igual que las lee la funcion con getMonth():
  // es el mismo criterio que valorAlCierre.
  const cuenta = (hoy: Date, year = 2026) => [
    periodosTranscurridos("mensual", year, hoy),
    periodosTranscurridos("trimestral", year, hoy),
    periodosTranscurridos("semestral", year, hoy),
  ];

  it("un anio ya cerrado cuenta todos sus periodos", () => {
    expect(cuenta(new Date(2026, 8, 24), 2025)).toEqual([12, 4, 2]);
  });
  it("un anio futuro no cuenta ninguno", () => {
    expect(cuenta(new Date(2026, 8, 24), 2027)).toEqual([0, 0, 0]);
  });
  it("en enero cuenta el primer periodo de cada clase, que ya esta en curso", () => {
    expect(cuenta(new Date(2026, 0, 1))).toEqual([1, 1, 1]);
  });
  it("el ultimo dia de marzo sigue en el primer trimestre", () => {
    expect(cuenta(new Date(2026, 2, 31))).toEqual([3, 1, 1]);
  });
  it("el primer dia de abril ya cuenta el segundo trimestre", () => {
    expect(cuenta(new Date(2026, 3, 1))).toEqual([4, 2, 1]);
  });
  it("el ultimo dia de junio sigue en el primer semestre", () => {
    expect(cuenta(new Date(2026, 5, 30))).toEqual([6, 2, 1]);
  });
  it("el primer dia de julio ya cuenta el segundo semestre", () => {
    expect(cuenta(new Date(2026, 6, 1))).toEqual([7, 3, 2]);
  });
  it("en diciembre cuenta todo el anio, igual que uno cerrado", () => {
    expect(cuenta(new Date(2026, 11, 31))).toEqual([12, 4, 2]);
  });
});

describe("promedio a la fecha", () => {
  // Cumplimiento trimestral de un anio en curso: los dos trimestres que aun no han
  // llegado valen 0 % y hunden la media anual.
  const cumplimiento = [120, 80, 0, 0];
  const aLaFecha = (hoy: Date, year = 2026) =>
    kpiAverage(cumplimiento.slice(0, periodosTranscurridos("trimestral", year, hoy)));

  it("excluye los periodos futuros que valen 0", () => {
    expect(kpiAverage(cumplimiento)).toBe(50);
    expect(aLaFecha(new Date(2026, 5, 15))).toBe(100);
  });
  it("en un anio cerrado es igual que el anual", () => {
    expect(aLaFecha(new Date(2027, 1, 1))).toBe(kpiAverage(cumplimiento));
  });
  it("en un anio futuro no hay nada que promediar", () => {
    expect(aLaFecha(new Date(2025, 5, 15))).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-score.test.ts`
Expected: FAIL con `periodosTranscurridos is not a function` (o el error de import equivalente) en los 11 tests nuevos.

- [ ] **Step 3: Implementar**

Con Edit, en `src/lib/kpi-score.ts`, sustituir:

```ts
    out.push(monthly.slice(i, i + paso).reduce((a, b) => a + b, 0));
  }
  return out;
}
```

por:

```ts
    out.push(monthly.slice(i, i + paso).reduce((a, b) => a + b, 0));
  }
  return out;
}

/**
 * Cuántos periodos del año cuentan para el promedio a la fecha: los ya transcurridos,
 * incluido el que está en curso. Durante el año, los periodos que aún no han llegado
 * valen 0 y, promediados, hunden la nota sin decir nada del trabajo hecho. Un año
 * cerrado cuenta todos (a la fecha coincide con el anual) y uno futuro ninguno.
 * El mes se lee con getMonth(), en hora local, igual que valorAlCierre: las dos cifras
 * de la tabla tienen que estar de acuerdo en qué trimestre es hoy.
 */
export function periodosTranscurridos(period: KpiPeriod, year: number, hoy: Date): number {
  const paso = MESES_POR_CUBO[period];
  const actual = hoy.getFullYear();
  if (year < actual) return MESES / paso;
  if (year > actual) return 0;
  return Math.ceil((hoy.getMonth() + 1) / paso);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-score.test.ts`
Expected: PASS, todos.

Run: `npx tsc --noEmit` → sin salida.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): periodos transcurridos del anio para el promedio a la fecha"
```

---

### Task 2: `valorAlCierreDelAnio`

**Files:**
- Modify: `src/lib/kpi-score.ts` (tras `valorAlCierre`, línea 210)
- Test: `src/lib/__tests__/kpi-score.test.ts` (import y al final)

- [ ] **Step 1: Escribir los tests**

Con Edit, en el import de `src/lib/__tests__/kpi-score.test.ts`, sustituir:

```ts
  valorAlCierre,
  periodTotals,
  periodosTranscurridos,
```

por:

```ts
  valorAlCierre,
  valorAlCierreDelAnio,
  periodTotals,
  periodosTranscurridos,
```

Con Edit, al final del fichero, añadir:

```ts

describe("valorAlCierreDelAnio", () => {
  // Es la cifra anual del incremento de Servicio Tecnico: la del T4, no la del
  // trimestre en curso, que es la de a la fecha.
  const serie = [106, 67, 26.4, -8.3];
  it("en el anio en curso es el de diciembre aunque estemos en septiembre", () => {
    expect(valorAlCierreDelAnio(serie, 2026, new Date(2026, 8, 24))).toBe(-8.3);
  });
  it("en un anio cerrado es el de diciembre, igual que a la fecha", () => {
    expect(valorAlCierreDelAnio(serie, 2025, new Date(2026, 8, 24))).toBe(-8.3);
    expect(valorAlCierre(serie, 2025, new Date(2026, 8, 24))).toBe(-8.3);
  });
  it("un anio futuro no tiene valor, aunque la serie traiga diciembre", () => {
    expect(valorAlCierreDelAnio(serie, 2027, new Date(2026, 8, 24))).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/__tests__/kpi-score.test.ts`
Expected: FAIL en los 3 tests nuevos (`valorAlCierreDelAnio is not a function`).

- [ ] **Step 3: Implementar**

Con Edit, en `src/lib/kpi-score.ts`, sustituir:

```ts
  const trimestre = year < actual ? 3 : Math.floor(hoy.getMonth() / 3);
  return serie[trimestre] ?? null;
}
```

por:

```ts
  const trimestre = year < actual ? 3 : Math.floor(hoy.getMonth() / 3);
  return serie[trimestre] ?? null;
}

/**
 * Valor de la serie al cierre del año, el T4: la cifra anual de una variación
 * acumulada. Se pide a valorAlCierre con el 31 de diciembre para no duplicar su
 * lógica, pero antes se descarta el año futuro: con esa fecha, valorAlCierre lo
 * tomaría por el año en curso y devolvería un T4 que todavía no ha pasado.
 */
export function valorAlCierreDelAnio(
  serie: (number | null)[],
  year: number,
  hoy: Date
): number | null {
  if (year > hoy.getFullYear()) return null;
  return valorAlCierre(serie, year, new Date(year, 11, 31));
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/kpi-score.test.ts` → PASS.
Run: `npx tsc --noEmit` → sin salida.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): valor del incremento al cierre del anio"
```

---

### Task 3: E2E de las columnas a la fecha (rojo)

**Files:**
- Modify: `e2e/specs/kpis-comerciales.spec.ts` (al final)

- [ ] **Step 1: Escribir los tests**

Con Edit, al final de `e2e/specs/kpis-comerciales.spec.ts`, añadir:

```ts

/**
 * Columnas de resumen, tras Dic. En una fila de KPI la celda 0 es la etiqueta y las 1-12
 * son los meses, asi que el resumen va de la 13 a la 16. En la fila TOTAL los doce meses
 * son una sola celda (colSpan), asi que alli van de la 2 a la 5.
 */
const CELDA_PROMEDIO_ANUAL = 13;
const CELDA_PROMEDIO_FECHA = 15;
const CELDAS_RESUMEN_TOTAL = [2, 3, 4, 5];
/** Meses que cierran trimestre: bajo su importe va el cumplimiento del trimestre. */
const CIERRES_TRIMESTRE = [3, 6, 9, 12];

/** Ultimo porcentaje del texto de una celda: en un mes de cierre, el cumplimiento. */
function ultimoPct(texto: string): number {
  const pcts = [...texto.matchAll(/(-?[\d.]+)%/g)];
  if (pcts.length === 0) throw new Error(`sin porcentaje en "${texto}"`);
  return Number(pcts[pcts.length - 1][1]);
}

test("la tabla separa el promedio y el aporte anuales de los de a la fecha", async ({ page }) => {
  const card = await abrirComercial(page);
  await expect(card.getByText("TOTAL", { exact: true })).toBeVisible();

  const cabeceras = await card.getByRole("columnheader").allInnerTexts();
  expect(cabeceras.slice(-5)).toEqual([
    "Dic",
    "Promedio anual",
    "Aporte anual",
    "Promedio a la fecha",
    "Aporte a la fecha",
  ]);

  // Semilla (e2e/db/seed-app.mjs): ventas nuevos pesa 60 y no tiene ningun cliente nuevo,
  // asi que cumple 0 %; ventas existentes pesa 40 y supera su meta en todos los
  // trimestres, topada al 100 %. Nota (0 * 60 + 100 * 40) / 100 = 40 % y aporte 0 + 40.
  // Vale en cualquier mes: los dos KPIs tienen dato en todos los trimestres del anio.
  const total = card.getByRole("row", { name: /^TOTAL/ });
  for (const i of CELDAS_RESUMEN_TOTAL) {
    await expect(total.getByRole("cell").nth(i)).toHaveText("40.0%");
  }
  // Los mismos KPIs tienen dato y peso en los dos calculos: la cobertura sale una vez.
  await expect(total).toContainText("cobertura: 100.0% del peso");
  await expect(total).not.toContainText("cobertura a la fecha");
});

test("el promedio a la fecha de ventas existentes solo cuenta los trimestres transcurridos", async ({ page }) => {
  const card = await abrirComercial(page);
  const celdas = card.getByRole("row", { name: /Ventas clientes existentes/ }).getByRole("cell");
  // Espera a la tabla con datos antes de leer textos sueltos.
  await expect(celdas.nth(CELDA_PROMEDIO_FECHA)).toHaveText(/%$/);

  const cumplimientos: number[] = [];
  for (const mes of CIERRES_TRIMESTRE) {
    cumplimientos.push(ultimoPct(await celdas.nth(mes).innerText()));
  }
  const anual = ultimoPct(await celdas.nth(CELDA_PROMEDIO_ANUAL).innerText());
  const fecha = ultimoPct(await celdas.nth(CELDA_PROMEDIO_FECHA).innerText());

  // Mismo criterio que periodosTranscurridos para un KPI trimestral del anio en curso, con
  // el reloj del sistema, que es tambien el del navegador: el test vale cualquier mes.
  const transcurridos = Math.ceil((new Date().getMonth() + 1) / 3);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Cada cumplimiento de la celda llega redondeado a un decimal y el promedio de la tabla
  // se calcula sin redondear: pueden separarse hasta 0.05, y se deja 0.1 de margen.
  expect(Math.abs(anual - media(cumplimientos))).toBeLessThanOrEqual(0.1);
  expect(Math.abs(fecha - media(cumplimientos.slice(0, transcurridos)))).toBeLessThanOrEqual(0.1);

  // La semilla (e2e/db/seed-hub.mjs) tiene ventas tambien en los meses que aun no han
  // llegado y cada mes factura mas que el anterior: a la fecha queda por debajo del anual
  // hasta el ultimo trimestre, en el que los dos cuentan lo mismo.
  if (transcurridos < 4) expect(fecha).toBeLessThan(anual);
  else expect(fecha).toBe(anual);
});
```

`abrirComercial` ya existe en el fichero.

- [ ] **Step 2: Ejecutar y verificar que fallan**

Docker Desktop arrancado. Comprobar que el puerto 3100 está libre (`netstat -ano | grep ":3100 "` sin salida) y que han pasado 60 s desde la última ejecución de Playwright.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: fallan solo los dos tests nuevos. El primero porque las cabeceras son aún «Promedio»/«Aporte»; el segundo por tiempo agotado buscando la celda 15, que todavía no existe. El resto del fichero, en verde. Pegar la salida.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/kpis-comerciales.spec.ts
git commit -m "test(kpis): promedio y aporte a la fecha en la tabla de KPIs"
```

---

### Task 4: Columnas a la fecha en la tabla (verde)

**Files:**
- Modify: `src/components/charts/comercial/commercial-kpi-table.tsx`
- Modify: `src/lib/chart-help.ts:21`

- [ ] **Step 1: Imports**

Con Edit, sustituir:

```ts
  attainment, esTratoDeClienteNuevo, esVentaDeClienteNuevo, kpiAverage, kpiContribution,
  monthBreakdown, ofYear, periodTotals, valorAlCierre, scoreboard, splitDealsNewExisting, splitNewExisting, sumByMonth, toMonthlySeries,
```

por:

```ts
  attainment, esTratoDeClienteNuevo, esVentaDeClienteNuevo, kpiAverage, kpiContribution,
  monthBreakdown, ofYear, periodosTranscurridos, periodTotals, valorAlCierre, valorAlCierreDelAnio, scoreboard,
  splitDealsNewExisting, splitNewExisting, sumByMonth, toMonthlySeries,
```

- [ ] **Step 2: `FilaKpi`, `aporteDe` y `construirFila`**

Con Edit, sustituir el bloque desde `interface FilaKpi {` hasta el cierre de `construirFila` (líneas 95-142):

```ts
interface FilaKpi {
  def: KpiDef;
  /** Doce meses; null donde ese KPI no tiene valor que enseñar. */
  meses: (number | null)[];
  /** Cumplimiento del periodo, colgado del mes que lo cierra. */
  cierres: (number | null)[];
  promedio: number | null;
  /** Cumplimiento que puntúa en el TOTAL. Coincide con `promedio` salvo en el
   *  incremento de Servicio Técnico, cuya columna enseña el incremento en sí. */
  logro: number | null;
  peso: number;
  aporte: number | null;
}

/**
 * Una fila de la tabla. `periodos` son los valores ya agregados por periodo y
 * `mensual` la serie de doce meses cuando el KPI la tiene; cuando no, el valor
 * del periodo se enseña en el mes que lo cierra.
 */
function construirFila(
  def: KpiDef,
  periodos: (number | null)[],
  meta: KpiTargetRow | undefined,
  mensual: number[] | null
): FilaKpi {
```

…hasta:

```ts
  const promedio = kpiAverage(cumplimiento);
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres,
    promedio,
    logro: promedio,
    peso,
    aporte: promedio === null || peso <= 0 ? null : kpiContribution(promedio, peso),
  };
}
```

por:

```ts
interface FilaKpi {
  def: KpiDef;
  /** Doce meses; null donde ese KPI no tiene valor que enseñar. */
  meses: (number | null)[];
  /** Cumplimiento del periodo, colgado del mes que lo cierra. */
  cierres: (number | null)[];
  /** Sobre todos los periodos del año. */
  promedio: number | null;
  /** Cumplimiento que puntúa en el TOTAL. Coincide con `promedio` salvo en el
   *  incremento de Servicio Técnico, cuya columna enseña el incremento en sí. */
  logro: number | null;
  /** Como `promedio`, pero solo sobre los periodos transcurridos: durante el año,
   *  los que aún no han llegado no restan. */
  promedioFecha: number | null;
  /** Como `logro`, a la fecha. Puntúa en el TOTAL a la fecha. */
  logroFecha: number | null;
  peso: number;
  aporte: number | null;
  aporteFecha: number | null;
}

/** Lo que una fila suma al TOTAL. Sin logro o sin peso no aporta nada: un 0 diría
 *  que se midió y no se cumplió. */
function aporteDe(logro: number | null, peso: number): number | null {
  return logro === null || peso <= 0 ? null : kpiContribution(logro, peso);
}

/**
 * Una fila de la tabla. `periodos` son los valores ya agregados por periodo y
 * `mensual` la serie de doce meses cuando el KPI la tiene; cuando no, el valor
 * del periodo se enseña en el mes que lo cierra. `year` y `hoy` deciden cuántos
 * periodos cuentan para el promedio a la fecha.
 */
function construirFila(
  def: KpiDef,
  periodos: (number | null)[],
  meta: KpiTargetRow | undefined,
  mensual: number[] | null,
  year: number,
  hoy: Date
): FilaKpi {
```

…hasta:

```ts
  const promedio = kpiAverage(cumplimiento);
  // Solo los periodos transcurridos, incluido el que está en curso. Se reutiliza
  // kpiAverage: con la lista vacía de un año futuro ya devuelve null, «—».
  const promedioFecha = kpiAverage(cumplimiento.slice(0, periodosTranscurridos(def.period, year, hoy)));
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres,
    promedio,
    logro: promedio,
    promedioFecha,
    logroFecha: promedioFecha,
    peso,
    aporte: aporteDe(promedio, peso),
    aporteFecha: aporteDe(promedioFecha, peso),
  };
}
```

(Las líneas intermedias de `construirFila`, del comentario de `attainment` al bucle de `cierres`, no cambian: hacer dos Edit, uno para la cabecera `interface FilaKpi … ): FilaKpi {` y otro para el final `const promedio … }`.)

- [ ] **Step 3: `construirFilaIncremento`**

Con Edit, sustituir:

```ts
/**
 * Fila del incremento de Servicio Técnico. Es una variación acumulada, así que no
 * se promedia: la columna Promedio enseña el valor del trimestre en curso, y bajo
 * cada trimestre no se pinta el cumplimiento (el incremento dividido por la meta,
 * que multiplicaba la cifra y confundía). El aporte sí compara ese valor con la
 * meta, igual que el resto de filas, para que el TOTAL siga midiendo cumplimiento.
 */
function construirFilaIncremento(
  def: KpiDef,
  trimestres: (number | null)[],
  meta: KpiTargetRow | undefined,
  alCierre: number | null
): FilaKpi {
  const paso = MESES / trimestres.length;
  const meses: (number | null)[] = new Array(MESES).fill(null);
  for (const [i, valor] of trimestres.entries()) meses[(i + 1) * paso - 1] = valor;
  const logro = alCierre === null ? null : attainment(alCierre, meta?.target_value ?? 0);
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres: new Array(MESES).fill(null),
    promedio: alCierre,
    logro,
    peso,
    aporte: logro === null || peso <= 0 ? null : kpiContribution(logro, peso),
  };
}
```

por:

```ts
/**
 * Fila del incremento de Servicio Técnico. Es una variación acumulada, así que no
 * se promedia: la columna anual enseña el valor al cierre del año (T4) y la de a la
 * fecha el del trimestre en curso; en un año cerrado coinciden. Bajo cada trimestre
 * no se pinta el cumplimiento (el incremento dividido por la meta, que multiplicaba
 * la cifra y confundía). El aporte sí compara cada valor con la meta, igual que el
 * resto de filas, para que los dos TOTALES sigan midiendo cumplimiento.
 */
function construirFilaIncremento(
  def: KpiDef,
  trimestres: (number | null)[],
  meta: KpiTargetRow | undefined,
  year: number,
  hoy: Date
): FilaKpi {
  const paso = MESES / trimestres.length;
  const meses: (number | null)[] = new Array(MESES).fill(null);
  for (const [i, valor] of trimestres.entries()) meses[(i + 1) * paso - 1] = valor;
  const anual = valorAlCierreDelAnio(trimestres, year, hoy);
  const aLaFecha = valorAlCierre(trimestres, year, hoy);
  const objetivo = meta?.target_value ?? 0;
  const logro = anual === null ? null : attainment(anual, objetivo);
  const logroFecha = aLaFecha === null ? null : attainment(aLaFecha, objetivo);
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres: new Array(MESES).fill(null),
    promedio: anual,
    logro,
    promedioFecha: aLaFecha,
    logroFecha,
    peso,
    aporte: aporteDe(logro, peso),
    aporteFecha: aporteDe(logroFecha, peso),
  };
}
```

- [ ] **Step 4: Un solo `hoy` para todas las filas**

Con Edit, sustituir el bloque desde `// Un solo instante para la fila de tickets` hasta el cierre del `COMMERCIAL_KPIS.map` (líneas 371-416):

```ts
    // Un solo instante para la fila de tickets y su detalle: si el detalle calculara el
    // suyo al pulsar, un episodio abierto que cruzara las 12 horas entre medias haría que
    // el pie dijera otra cosa que la celda.
    const ahoraTickets = new Date().getTime();

    const filas = COMMERCIAL_KPIS.map((def) => {
      const meta = porClave.get(def.key);
      if (def.key === "ventas_nuevos") {
        return construirFila(def, periodTotals(split.nuevos, def.period), meta, split.nuevos);
      }
      if (def.key === "ventas_existentes") {
        return construirFila(def, periodTotals(split.existentes, def.period), meta, split.existentes);
      }
      if (def.key === "tratos_nuevos") {
        const serie = tratosSplit.nuevos;
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "tratos_existentes") {
        const serie = tratosSplit.existentes;
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "tratos_ganados") {
        const serie = toMonthlySeries(ganados);
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "incremento_st") {
        return construirFilaIncremento(def, st, meta, valorAlCierre(st, year, new Date()));
      }
      if (def.key === "tickets_st") {
        // El porcentaje ya viene por mes: son los doce periodos de una fila mensual y
        // no hay serie aparte, así que construirFila lo pinta en su mes con el
        // cumplimiento debajo. `ahora` decide qué episodios abiertos ya están fuera de
        // plazo; new Date() como en el incremento de arriba.
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets), meta, null);
      }
      if (def.key === "ingresos_proyectos") {
        // date es un `date` de Postgres ('YYYY-MM-DD'), sin hora ni zona: se lee
        // el mes con slice, nunca con new Date(...).getMonth(), que reinterpreta
        // la fecha en la zona horaria local y puede desplazarla de mes.
        const serie = sumByMonth(
          ordenesProyectoAnio.map((o) => ({ mes: Number(o.date.slice(5, 7)), importe: o.importe }))
        );
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      return construirFila(def, new Array(cubosDe(def)).fill(null), meta, null);
    });
```

por:

```ts
    // Un solo instante para todas las filas y para el detalle de tickets. Las filas lo
    // usan para decidir cuántos periodos van ya a la fecha: si cada una tomara el suyo,
    // un cambio de mes entre medias dejaría filas contando periodos distintos. El
    // detalle de tickets reutiliza el mismo: si calculara el suyo al pulsar, un episodio
    // abierto que cruzara las 12 horas entre medias haría que el pie dijera otra cosa
    // que la celda.
    const hoy = new Date();
    const ahoraTickets = hoy.getTime();

    const filas = COMMERCIAL_KPIS.map((def) => {
      const meta = porClave.get(def.key);
      if (def.key === "ventas_nuevos") {
        return construirFila(def, periodTotals(split.nuevos, def.period), meta, split.nuevos, year, hoy);
      }
      if (def.key === "ventas_existentes") {
        return construirFila(def, periodTotals(split.existentes, def.period), meta, split.existentes, year, hoy);
      }
      if (def.key === "tratos_nuevos") {
        const serie = tratosSplit.nuevos;
        return construirFila(def, periodTotals(serie, def.period), meta, serie, year, hoy);
      }
      if (def.key === "tratos_existentes") {
        const serie = tratosSplit.existentes;
        return construirFila(def, periodTotals(serie, def.period), meta, serie, year, hoy);
      }
      if (def.key === "tratos_ganados") {
        const serie = toMonthlySeries(ganados);
        return construirFila(def, periodTotals(serie, def.period), meta, serie, year, hoy);
      }
      if (def.key === "incremento_st") {
        return construirFilaIncremento(def, st, meta, year, hoy);
      }
      if (def.key === "tickets_st") {
        // El porcentaje ya viene por mes: son los doce periodos de una fila mensual y
        // no hay serie aparte, así que construirFila lo pinta en su mes con el
        // cumplimiento debajo. `ahoraTickets` decide qué episodios abiertos ya están
        // fuera de plazo. Los meses sin episodios son null y tampoco cuentan a la fecha.
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets), meta, null, year, hoy);
      }
      if (def.key === "ingresos_proyectos") {
        // date es un `date` de Postgres ('YYYY-MM-DD'), sin hora ni zona: se lee
        // el mes con slice, nunca con new Date(...).getMonth(), que reinterpreta
        // la fecha en la zona horaria local y puede desplazarla de mes.
        const serie = sumByMonth(
          ordenesProyectoAnio.map((o) => ({ mes: Number(o.date.slice(5, 7)), importe: o.importe }))
        );
        return construirFila(def, periodTotals(serie, def.period), meta, serie, year, hoy);
      }
      return construirFila(def, new Array(cubosDe(def)).fill(null), meta, null, year, hoy);
    });
```

- [ ] **Step 5: Dos marcadores y dos sumas de aportes**

Con Edit, sustituir:

```ts
  const marcador = useMemo(
    () => scoreboard(filas.map((f) => ({ average: f.logro, weight: f.peso }))),
    [filas]
  );
  const aporteTotal = useMemo(() => filas.reduce((s, f) => s + (f.aporte ?? 0), 0), [filas]);
```

por:

```ts
  // Dos TOTALES con la misma regla de renormalización: el anual y el de a la fecha.
  const marcador = useMemo(
    () => scoreboard(filas.map((f) => ({ average: f.logro, weight: f.peso }))),
    [filas]
  );
  const marcadorFecha = useMemo(
    () => scoreboard(filas.map((f) => ({ average: f.logroFecha, weight: f.peso }))),
    [filas]
  );
  const aporteTotal = useMemo(() => filas.reduce((s, f) => s + (f.aporte ?? 0), 0), [filas]);
  const aporteTotalFecha = useMemo(() => filas.reduce((s, f) => s + (f.aporteFecha ?? 0), 0), [filas]);
```

- [ ] **Step 6: Cabeceras**

Con Edit, sustituir:

```tsx
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[80px]">Promedio</th>
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[72px]">Aporte</th>
```

por:

```tsx
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[80px]">Promedio anual</th>
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[72px]">Aporte anual</th>
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[80px]">Promedio a la fecha</th>
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[72px]">Aporte a la fecha</th>
```

- [ ] **Step 7: Celdas de cada fila**

Con Edit, sustituir:

```tsx
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.aporte === null ? "—" : formatPct(f.aporte)}
                          </td>
                        </tr>
```

por:

```tsx
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.aporte === null ? "—" : formatPct(f.aporte)}
                          </td>
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.promedioFecha === null ? "—" : formatPct(f.promedioFecha)}
                          </td>
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.aporteFecha === null ? "—" : formatPct(f.aporteFecha)}
                          </td>
                        </tr>
```

- [ ] **Step 8: Fila TOTAL y cobertura**

Con Edit, sustituir:

```tsx
                        <span className="font-semibold">TOTAL</span>
                        <span className="block text-muted-foreground">
                          cobertura: {formatPct(marcador.coverage)} del peso
                        </span>
                      </td>
                      <td colSpan={MESES} />
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcador.total === null ? "—" : formatPct(marcador.total)}
                      </td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {formatPct(aporteTotal)}
                      </td>
```

por:

```tsx
                        <span className="font-semibold">TOTAL</span>
                        {/* La cobertura depende de qué KPIs tienen dato y peso, no del periodo:
                            casi siempre es la misma y se enseña una vez. Solo difiere si algún
                            KPI tiene dato únicamente en periodos que aún no han llegado, y
                            entonces se enseñan las dos para que ninguna nota parezca más
                            respaldada de lo que está. */}
                        {marcadorFecha.coverage === marcador.coverage ? (
                          <span className="block text-muted-foreground">
                            cobertura: {formatPct(marcador.coverage)} del peso
                          </span>
                        ) : (
                          <>
                            <span className="block text-muted-foreground">
                              cobertura anual: {formatPct(marcador.coverage)} del peso
                            </span>
                            <span className="block text-muted-foreground">
                              cobertura a la fecha: {formatPct(marcadorFecha.coverage)} del peso
                            </span>
                          </>
                        )}
                      </td>
                      <td colSpan={MESES} />
                      {/* Sin nada medible el aporte es «—» y no 0.0%: un cero se leería como
                          un suspenso, y en un año futuro a la fecha no hay nada que medir. */}
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcador.total === null ? "—" : formatPct(marcador.total)}
                      </td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcador.total === null ? "—" : formatPct(aporteTotal)}
                      </td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcadorFecha.total === null ? "—" : formatPct(marcadorFecha.total)}
                      </td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcadorFecha.total === null ? "—" : formatPct(aporteTotalFecha)}
                      </td>
```

- [ ] **Step 9: Texto de ayuda**

Con Edit, en `src/lib/chart-help.ts`, sustituir:

```ts
  kpisComerciales: "Cumplimiento de cada KPI frente a su meta, por periodo. El promedio es la media de los periodos medidos y el aporte aplica el peso, topado al 100%. El TOTAL se calcula solo sobre los KPIs que hoy tienen datos y la cobertura dice cuánto peso respalda esa nota.",
```

por:

```ts
  kpisComerciales: "Cumplimiento de cada KPI frente a su meta, por periodo. El promedio anual es la media de todos los periodos medidos del año; el promedio a la fecha, solo la de los ya transcurridos, incluido el que está en curso, para que los que aún no han llegado no resten. El aporte aplica el peso, topado al 100%. El TOTAL se calcula solo sobre los KPIs que hoy tienen datos y la cobertura dice cuánto peso respalda esa nota.",
```

- [ ] **Step 10: Tipos, lint y unitarios**

Run: `npx tsc --noEmit` → sin salida, código 0. (Si falla por un `construirFila` sin `year, hoy`, falta una de las ocho llamadas del Step 4.)
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`. El `new Date()` dentro del `useMemo` ya estaba ahí dentro y no sumaba warnings; si aparece uno nuevo, comprobar que el bloque se copió tal cual.
Run: `npm test` → **298 pasados + 1 saltado**.

- [ ] **Step 11: E2E del fichero en verde**

Esperar 60 s desde la Task 3 y comprobar el puerto 3100.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e -- e2e/specs/kpis-comerciales.spec.ts`
Expected: todos en verde, incluidos los dos nuevos. Pegar la salida.

- [ ] **Step 12: Commit**

```bash
git add src/components/charts/comercial/commercial-kpi-table.tsx src/lib/chart-help.ts
git commit -m "feat(kpis): promedio y aporte a la fecha en la tabla de KPIs"
```

---

### Task 5: Verificación completa

**Files:** ninguno.

- [ ] **Step 1: Unitarios, tipos y lint**

Run: `npm test`
Expected: **298 pasados + 1 saltado** (284 de hoy + 11 de la Task 1 + 3 de la Task 2).

Run: `npx tsc --noEmit` → sin salida, código 0.
Run: `npm run lint` → `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 2: Suite E2E completa**

Docker Desktop arrancado. Esperar 60 s desde la última ejecución de Playwright y comprobar que el puerto 3100 está libre.

Run: `E2E_PG_PORT=55433 npm run e2e:db:reset && E2E_PG_PORT=55433 npm run test:e2e`
Expected: **56/56** (los 54 de hoy más los dos nuevos). Si falla algo fuera de `kpis-comerciales.spec.ts`, leerlo antes de tocar nada y decir en el informe qué era.

- [ ] **Step 3: Revisión en móvil**

Con la app de la suite E2E todavía levantada en el puerto 3100 (o `npm run dev`), abrir `/analytics` → pestaña Comercial con el navegador a **390 px** de ancho (modo dispositivo de las herramientas de desarrollo, o la skill `browse`). Comprobar: la tabla hace scroll horizontal dentro de la tarjeta, la columna KPI queda fija a la izquierda, las cuatro cabeceras de resumen se leen (pueden partirse en dos líneas) y la página entera no tiene scroll horizontal. Decir en el informe qué se vio; si algo no se lee, parar y avisar antes de tocar estilos.

- [ ] **Step 4: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpi-promedio-a-la-fecha` sin ficheros modificados.

Run: `git log --oneline origin/main..HEAD`
Expected: el commit de la spec y los cuatro de este plan, ninguno con `Co-Authored-By`.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los nombres reales de comerciales y clientes son justo
> lo que no puede acabar en un repositorio público: meterlos dentro del propio comando de detección los
> filtra igual que la fuga que busca. `$NOMBRES_REALES` apunta a un fichero fuera del repositorio, un
> término por línea, que escribe quien ejecuta el plan. Si no existe, la comprobación no está hecha:
> no se puede dar por buena.

---

### Task 6: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita al usuario antes de cualquier push. Recordar que este PR **no trae migración** ni cambia consultas, y que en el año en curso el «Incremento de Servicio Técnico» anual pasa a enseñar el T4 (acumulado del año completo frente al año anterior), que hasta diciembre será muy distinto del de a la fecha, que es lo que la fila enseñaba hasta ahora.

- [ ] **Step 2: Push, PR, CI y fusión (solo tras la confirmación)**

```bash
git push -u origin feat/kpi-promedio-a-la-fecha
```

PR contra `main` titulado `feat(kpis): promedio y aporte a la fecha en la tabla de KPIs`, explicando: cuatro columnas tras Dic (promedio y aporte anuales y a la fecha); a la fecha cuentan los periodos transcurridos, incluido el que está en curso (`periodosTranscurridos`); el incremento de ST enseña el T4 como anual y el trimestre en curso a la fecha; dos TOTALES con la misma renormalización; la cobertura sale una vez salvo que difiera. Esperar a `build`, `e2e` y GitGuardian en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- Cambiar la nota que se usa en otras pantallas.
- Metas prorrateadas por periodo transcurrido: la meta de cada periodo sigue siendo la misma.
- Sacar `construirFila` a `src/lib` para probarla con vitest: la tabla la cubre el E2E, como hasta ahora.
