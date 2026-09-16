# KPIs comerciales · PR 2: cálculo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existen y están probados los helpers puros que convierten ventas y registros de Servicio Técnico en cumplimiento por periodo, promedio anual, aporte ponderado y puntuación total renormalizada.

**Architecture:** Todo el cálculo vive en funciones puras sin acceso a base de datos: `src/lib/kpi-score.ts` para los KPIs de ventas y la puntuación, y `stGrowthByQuarter` dentro del `src/lib/tech-service.ts` que ya existe, porque reutiliza sus listas de categorías. El PR siguiente añade la consulta al hub y la tabla que los consume.

**Tech Stack:** TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-kpis-comerciales-design.md` (sección 4)

**Segundo PR de tres.** El primero (`0008_kpi_targets`, catálogo, acciones y pantalla de Configuración) está fusionado en #6 y #7. El tercero traerá la consulta por vendedor y la tabla en la pestaña Comercial.

---

## Por qué este PR no cambia nada visible

El cálculo y la tabla juntos pasan de 600 líneas, y la revisión se resiente igual que habría pasado en el PR1. Además se prueban con herramientas distintas: estos helpers son funciones puras que vitest cubre al detalle, mientras que la consulta SQL por vendedor solo se ejerce de verdad cuando hay una tabla que la pinte, es decir con Playwright. Partir por esa costura deja cada mitad con la prueba que le corresponde, en vez de meter SQL sin red en un PR que no puede ejecutarlo.

## Contexto para quien ejecuta

- **Repo:** `salestracker-pro/`. Todos los comandos se lanzan desde ahí. El Bash es Git Bash.
- **Rama:** `feat/kpis-calculo`, creada desde `main`. No cambiar de rama, no hacer push.
- **Repo público:** ninguna cifra real de negocio en código, tests ni comentarios. Los importes de los tests son redondos e inventados.
- **Commits:** convencionales, en español sin tildes, **sin** `Co-Authored-By` ni atribución a IA.
- **Prohibido reescribir historia:** nada de `git commit --amend`, `git rebase` o `git reset`.
- **Lint:** baseline de exactamente 10 warnings y 0 errores.
- **Sin migración, sin E2E, sin Docker.** Este PR no toca la base de datos ni la interfaz.
- **TDD estricto:** cada test se escribe antes y se comprueba que falla por el motivo esperado.

## Contexto verificado del código actual

- `buildNewVsRecurring` (`src/lib/analytics-comercial.ts:119`) calcula el primer año de cada cliente en una primera pasada interna, sobre las filas que recibe. No lo exporta.
- Sus tests viven en `src/lib/__tests__/analytics-comercial.test.ts:104`.
- `ST_CATEGORIES` y `buildTechServiceData` están en `src/lib/tech-service.ts`. `buildTechServiceData` recibe `(recordsA, recordsB, catMap, recordType, viewMode)` y clasifica por **nombre** de categoría, resuelto con un `Map<category_id, category_name>`.
- Los registros de Servicio Técnico salen de la tabla local `sales_records` (`SalesRecord`), no del hub.
- El catálogo `COMMERCIAL_KPIS` y el tipo `KpiPeriod` están en `src/lib/commercial-kpis.ts`.
- `CustomerMonthRow` es `{ customer, mes, importe }` y `CustomerYearRow` es `{ customer, year, ventas, source? }` (`src/types/database.ts`).

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/analytics-comercial.ts` | Modificar | Exportar `firstYearByCustomer` y usarlo dentro de `buildNewVsRecurring`. |
| `src/lib/kpi-score.ts` | Crear | Reparto nuevo/existente, cubos por periodicidad, cumplimiento, promedio, aporte y total. |
| `src/lib/__tests__/kpi-score.test.ts` | Crear | Tests de los helpers. |
| `src/lib/tech-service.ts` | Modificar | `stGrowthByQuarter`. |
| `src/lib/__tests__/tech-service.test.ts` | Crear o modificar | Tests de `stGrowthByQuarter`. |

---

### Task 1: `firstYearByCustomer` deja de estar escondido

`buildNewVsRecurring` ya sabe calcular el primer año de cada cliente, pero lo hace en una variable local. La tabla de KPIs necesita exactamente ese cálculo sobre **otra** ventana de datos (facturas desde 2015 con histórico, para toda la compañía), así que se extrae y se exporta en vez de duplicarlo.

**Files:**
- Modify: `src/lib/analytics-comercial.ts`
- Modify: `src/lib/__tests__/analytics-comercial.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/__tests__/analytics-comercial.test.ts`, añadir `firstYearByCustomer` al import existente y este bloque al final:

```ts
describe("firstYearByCustomer", () => {
  it("devuelve el primer anio con ventas de cada cliente", () => {
    const rows = [
      { customer: "Alfa", year: 2022, ventas: 100 },
      { customer: "Alfa", year: 2021, ventas: 50 },
      { customer: "Beta", year: 2023, ventas: 200 },
    ];
    const m = firstYearByCustomer(rows);
    expect(m.get("Alfa")).toBe(2021);
    expect(m.get("Beta")).toBe(2023);
  });

  it("ignora los anios sin ventas", () => {
    const rows = [
      { customer: "Alfa", year: 2021, ventas: 0 },
      { customer: "Alfa", year: 2022, ventas: 100 },
    ];
    expect(firstYearByCustomer(rows).get("Alfa")).toBe(2022);
  });

  it("no inventa clientes", () => {
    expect(firstYearByCustomer([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- src/lib/__tests__/analytics-comercial.test.ts`
Expected: falla porque `firstYearByCustomer` no se exporta.

- [ ] **Step 3: Extraer el helper**

En `src/lib/analytics-comercial.ts`, justo antes de `buildNewVsRecurring`:

```ts
/**
 * Primer año con ventas de cada cliente, **dentro de las filas recibidas**. Quién es
 * "nuevo" depende por tanto de la ventana consultada: la tabla de KPIs la pide de
 * compañía y con histórico, mientras que el gráfico de nuevos vs recurrentes arranca
 * en 2021 y por eso ese primer año sale entero como nuevo.
 */
export function firstYearByCustomer(rows: CustomerYearRow[]): Map<string, number> {
  const firstYear = new Map<string, number>();
  for (const r of rows) {
    if (r.ventas > 0) {
      const cur = firstYear.get(r.customer);
      if (cur === undefined || r.year < cur) firstYear.set(r.customer, r.year);
    }
  }
  return firstYear;
}
```

Y dentro de `buildNewVsRecurring`, sustituir la primera pasada por `const firstYear = firstYearByCustomer(rows);`, dejando el resto igual.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/analytics-comercial.test.ts`
Expected: pasan los nuevos y **siguen pasando los de `buildNewVsRecurring`**, que son la prueba de que la extracción no cambió el comportamiento.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics-comercial.ts src/lib/__tests__/analytics-comercial.test.ts
git commit -m "refactor(comercial): firstYearByCustomer se exporta para reutilizarlo"
```

---

### Task 2: Helpers de puntuación (TDD con vitest)

**Files:**
- Create: `src/lib/__tests__/kpi-score.test.ts`
- Create: `src/lib/kpi-score.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/__tests__/kpi-score.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  splitNewExisting,
  periodTotals,
  attainment,
  kpiAverage,
  kpiContribution,
  scoreboard,
} from "@/lib/kpi-score";

const primerAnio = new Map<string, number>([
  ["Alfa", 2024],
  ["Beta", 2026],
]);

describe("splitNewExisting", () => {
  it("manda cada importe a su serie segun el primer anio del cliente", () => {
    const rows = [
      { customer: "Alfa", mes: 1, importe: 100 },
      { customer: "Beta", mes: 1, importe: 300 },
    ];
    const s = splitNewExisting(rows, primerAnio, 2026);
    expect(s.nuevos[0]).toBe(300);
    expect(s.existentes[0]).toBe(100);
  });

  it("devuelve doce meses aunque solo llegue uno", () => {
    const s = splitNewExisting([{ customer: "Alfa", mes: 3, importe: 10 }], primerAnio, 2026);
    expect(s.nuevos).toHaveLength(12);
    expect(s.existentes).toHaveLength(12);
    expect(s.existentes[2]).toBe(10);
  });

  it("suma los importes que caen en el mismo mes", () => {
    const rows = [
      { customer: "Alfa", mes: 5, importe: 10 },
      { customer: "Alfa", mes: 5, importe: 15 },
    ];
    expect(splitNewExisting(rows, primerAnio, 2026).existentes[4]).toBe(25);
  });

  it("trata como existente al cliente que no esta en el mapa", () => {
    // Si no aparece en la ventana consultada, no es su primer anio: no puede ser nuevo.
    const s = splitNewExisting([{ customer: "Gamma", mes: 1, importe: 40 }], primerAnio, 2026);
    expect(s.nuevos[0]).toBe(0);
    expect(s.existentes[0]).toBe(40);
  });

  it("ignora los meses fuera de rango", () => {
    const rows = [
      { customer: "Alfa", mes: 0, importe: 10 },
      { customer: "Alfa", mes: 13, importe: 10 },
    ];
    const s = splitNewExisting(rows, primerAnio, 2026);
    expect(s.existentes.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("periodTotals", () => {
  const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("mensual devuelve los doce meses tal cual", () => {
    expect(periodTotals(meses, "mensual")).toEqual(meses);
  });

  it("trimestral agrupa de tres en tres", () => {
    expect(periodTotals(meses, "trimestral")).toEqual([6, 15, 24, 33]);
  });

  it("semestral agrupa de seis en seis", () => {
    expect(periodTotals(meses, "semestral")).toEqual([21, 57]);
  });
});

describe("attainment", () => {
  it("es el porcentaje del valor sobre la meta", () => {
    expect(attainment(50, 200)).toBe(25);
  });

  it("no se topa: superar la meta se ve", () => {
    expect(attainment(300, 200)).toBe(150);
  });

  it("sin meta util no hay cumplimiento que calcular", () => {
    expect(attainment(50, 0)).toBeNull();
    expect(attainment(50, -1)).toBeNull();
  });
});

describe("kpiAverage", () => {
  it("promedia solo los periodos con cumplimiento", () => {
    expect(kpiAverage([100, null, 50, null])).toBe(75);
  });

  it("sin ningun periodo medible no hay promedio", () => {
    expect(kpiAverage([null, null])).toBeNull();
    expect(kpiAverage([])).toBeNull();
  });
});

describe("kpiContribution", () => {
  it("aporta la parte del peso que corresponde al cumplimiento", () => {
    expect(kpiContribution(50, 20)).toBe(10);
  });

  it("el exceso sobre la meta no aporta de mas", () => {
    // Sin tope, un KPI desbordado taparia el incumplimiento de los demas.
    expect(kpiContribution(300, 20)).toBe(20);
  });
});

describe("scoreboard", () => {
  it("renormaliza sobre los KPIs que si se pueden medir", () => {
    // 60 de peso medible con 50% de cumplimiento: el total es ese 50,
    // no el 30 que saldria de repartir sobre los 100 puntos completos.
    const r = scoreboard([
      { average: 50, weight: 60 },
      { average: null, weight: 40 },
    ]);
    expect(r.total).toBe(50);
    expect(r.coverage).toBe(60);
  });

  it("con todo medible el total es la suma de aportes", () => {
    const r = scoreboard([
      { average: 100, weight: 70 },
      { average: 50, weight: 30 },
    ]);
    expect(r.total).toBe(85);
    expect(r.coverage).toBe(100);
  });

  it("sin nada medible no hay puntuacion", () => {
    const r = scoreboard([{ average: null, weight: 100 }]);
    expect(r.total).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("un peso a cero no cuenta como cobertura", () => {
    const r = scoreboard([
      { average: 80, weight: 0 },
      { average: 40, weight: 50 },
    ]);
    expect(r.coverage).toBe(50);
    expect(r.total).toBe(40);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts`
Expected: falla porque `@/lib/kpi-score` no existe.

- [ ] **Step 3: Crear los helpers**

Crear `src/lib/kpi-score.ts`:

```ts
import type { KpiPeriod } from "@/lib/commercial-kpis";
import type { CustomerMonthRow } from "@/types/database";

/** Las dos series de doce meses en las que se parte la facturación del año. */
export interface MonthlySplit {
  nuevos: number[];
  existentes: number[];
}

const MESES = 12;

function doceCeros(): number[] {
  return new Array(MESES).fill(0);
}

/**
 * Reparte los importes mensuales en clientes nuevos y existentes. Es nuevo quien
 * tiene su primer año con ventas en el año analizado; el mapa se calcula aparte,
 * de compañía y con histórico, para que no dependa del comercial ni del
 * conmutador OV/FAC.
 */
export function splitNewExisting(
  rows: CustomerMonthRow[],
  firstYear: Map<string, number>,
  year: number
): MonthlySplit {
  const out: MonthlySplit = { nuevos: doceCeros(), existentes: doceCeros() };
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx < 0 || idx >= MESES) continue;
    const serie = firstYear.get(r.customer) === year ? out.nuevos : out.existentes;
    serie[idx] += r.importe;
  }
  return out;
}

const MESES_POR_CUBO: Record<KpiPeriod, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
};

/** Agrupa los doce meses en los cubos que le tocan a esa periodicidad: 12, 4 o 2. */
export function periodTotals(monthly: number[], period: KpiPeriod): number[] {
  const paso = MESES_POR_CUBO[period];
  const out: number[] = [];
  for (let i = 0; i < MESES; i += paso) {
    out.push(monthly.slice(i, i + paso).reduce((a, b) => a + b, 0));
  }
  return out;
}

/**
 * Cumplimiento en porcentaje. Devuelve null cuando no hay meta con la que comparar:
 * un cero ahí significaría "no cumplió", y lo cierto es que no se puede saber.
 */
export function attainment(value: number, target: number): number | null {
  if (target <= 0) return null;
  return (value / target) * 100;
}

/** Media simple de los periodos que sí se pudieron medir. */
export function kpiAverage(values: (number | null)[]): number | null {
  const medibles = values.filter((v): v is number => v !== null);
  if (medibles.length === 0) return null;
  return medibles.reduce((a, b) => a + b, 0) / medibles.length;
}

/**
 * Lo que ese KPI aporta al total. El cumplimiento se topa al 100 %: sin el tope,
 * un KPI muy desbordado compensaría el incumplimiento de los demás y el total
 * dejaría de decir si se están cumpliendo los objetivos.
 */
export function kpiContribution(average: number, weight: number): number {
  return (Math.min(average, 100) * weight) / 100;
}

export interface ScoreInput {
  average: number | null;
  weight: number;
}

export interface Scoreboard {
  /** Puntuación sobre 100, renormalizada. Null si no hay nada medible. */
  total: number | null;
  /** Porcentaje del peso total que sí se ha podido medir. */
  coverage: number;
}

/**
 * Puntuación total sobre los KPIs que hoy tienen datos. Se renormaliza en vez de
 * repartir sobre los 100 puntos completos: con cinco de ocho KPIs esperando a que
 * el hub replique CRM y Desk, el reparto plano daría siempre un suspenso que no
 * describe nada. `coverage` dice cuánto del peso respalda esa nota.
 */
export function scoreboard(rows: ScoreInput[]): Scoreboard {
  const medibles = rows.filter((r) => r.average !== null && r.weight > 0);
  const coverage = medibles.reduce((s, r) => s + r.weight, 0);
  if (coverage === 0) return { total: null, coverage: 0 };
  const aporte = medibles.reduce((s, r) => s + kpiContribution(r.average as number, r.weight), 0);
  return { total: (aporte / coverage) * 100, coverage };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/kpi-score.test.ts`
Expected: los 19 tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-score.ts src/lib/__tests__/kpi-score.test.ts
git commit -m "feat(kpis): helpers de cumplimiento, aporte y puntuacion total"
```

---

### Task 3: Incremento de Servicio Técnico (TDD con vitest)

**Files:**
- Create: `src/lib/__tests__/tech-service.test.ts` (si ya existe, añadir al final)
- Modify: `src/lib/tech-service.ts`

- [ ] **Step 1: Comprobar si ya hay tests**

Run: `ls src/lib/__tests__/tech-service.test.ts`
Si existe, añadir el bloque nuevo al final respetando sus imports. Si no, crear el fichero.

- [ ] **Step 2: Escribir los tests que fallan**

```ts
import { describe, it, expect } from "vitest";
import { stGrowthByQuarter, ST_CATEGORIES } from "@/lib/tech-service";
import type { SalesRecord } from "@/types/database";

const CAT_ST = "cat-st";
const CAT_OTRA = "cat-otra";
const catMap = new Map<string, string>([
  [CAT_ST, ST_CATEGORIES[0]],
  [CAT_OTRA, "Categoria sin relacion"],
]);

function registro(anio: number, mes: number, importe: number, cat = CAT_ST): SalesRecord {
  return {
    record_year: anio,
    record_month: mes,
    record_type: "INVOICE",
    category_id: cat,
    amount_usd: importe,
  } as unknown as SalesRecord;
}

describe("stGrowthByQuarter", () => {
  it("compara el acumulado de cada trimestre con el del anio anterior", () => {
    const a = [registro(2026, 1, 120)];
    const b = [registro(2025, 1, 100)];
    // Acumulado T1: 120 frente a 100 = +20 %. El acumulado se arrastra, asi que
    // los trimestres siguientes repiten mientras no entren mas ventas.
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")).toEqual([20, 20, 20, 20]);
  });

  it("sin base con la que comparar no hay variacion", () => {
    expect(stGrowthByQuarter([registro(2026, 1, 50)], [], catMap, "INVOICE")).toEqual([
      null, null, null, null,
    ]);
  });

  it("solo mira las categorias de Servicio Tecnico", () => {
    const a = [registro(2026, 1, 1000, CAT_OTRA)];
    const b = [registro(2025, 1, 100)];
    // Las mil de otra categoria no entran: el acumulado del anio A sigue a cero.
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")[0]).toBe(-100);
  });

  it("respeta el tipo de registro pedido", () => {
    const a = [{ ...registro(2026, 1, 200), record_type: "SALES_ORDER" } as SalesRecord];
    const b = [registro(2025, 1, 100)];
    expect(stGrowthByQuarter(a, b, catMap, "INVOICE")[0]).toBe(-100);
  });

  it("devuelve siempre cuatro trimestres", () => {
    expect(stGrowthByQuarter([], [], catMap, "INVOICE")).toHaveLength(4);
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npm test -- src/lib/__tests__/tech-service.test.ts`
Expected: falla porque `stGrowthByQuarter` no existe.

- [ ] **Step 4: Añadir el helper**

En `src/lib/tech-service.ts`, al final, **sin tocar `buildTechServiceData`**:

```ts
const TRIMESTRES = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
];

function acumuladoSt(
  records: SalesRecord[],
  meses: number[],
  catMap: Map<string, string>,
  recordType: RecordType
): number {
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    if (!meses.includes(Number(r.record_month))) continue;
    const cat = catMap.get(r.category_id);
    if (cat && ST_CATEGORIES.includes(cat)) total += Number(r.amount_usd);
  }
  return total;
}

/**
 * Variación acumulada de las ventas de Servicio Técnico frente al mismo periodo del
 * año anterior, trimestre a trimestre. Es un KPI de compañía: estas líneas no llevan
 * comercial asignado, así que no se filtra por vendedor.
 *
 * Devuelve null en el trimestre donde el año de referencia no tiene ventas: dividir
 * por cero no es un 0 % de crecimiento, es la ausencia de una base con la que comparar.
 */
export function stGrowthByQuarter(
  recordsA: SalesRecord[],
  recordsB: SalesRecord[],
  catMap: Map<string, string>,
  recordType: RecordType
): (number | null)[] {
  const out: (number | null)[] = [];
  let acumMeses: number[] = [];
  for (const trimestre of TRIMESTRES) {
    acumMeses = [...acumMeses, ...trimestre];
    const a = acumuladoSt(recordsA, acumMeses, catMap, recordType);
    const b = acumuladoSt(recordsB, acumMeses, catMap, recordType);
    out.push(b === 0 ? null : ((a - b) / b) * 100);
  }
  return out;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npm test -- src/lib/__tests__/tech-service.test.ts`
Expected: los 5 tests pasan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tech-service.ts src/lib/__tests__/tech-service.test.ts
git commit -m "feat(kpis): incremento acumulado de ventas de servicio tecnico por trimestre"
```

---

### Task 4: Verificación

**Files:** ninguno.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: los 143 anteriores más 3 de `firstYearByCustomer`, 19 de `kpi-score` y 5 de `stGrowthByQuarter` = **170 pasados + 1 saltado**. Si la cifra no cuadra, contar los tests reales y reportar la diferencia en vez de ajustar el número a ojo.

- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Expected: sin salida, código 0.

Run: `npm run lint`
Expected: `✖ 10 problems (0 errors, 10 warnings)`.

- [ ] **Step 3: Estado y datos sensibles**

Run: `git status -sb`
Expected: `## feat/kpis-calculo` sin ficheros modificados.

Run: `git diff origin/main..HEAD | grep -n -i -E '^\+.*(\$[0-9]{1,3}([,.][0-9]{3})+|[0-9]{1,3}(\.[0-9]{3}){2,}|([0-9]{1,3}\.){3}[0-9]{1,3}|\.ssh/)'`
Expected: sin salida.

Run: `git diff origin/main..HEAD | grep -n -i -F -f "$NOMBRES_REALES"`
Expected: sin salida.

> **El patrón no se escribe en este fichero.** Los apellidos reales de los comerciales y las
> metas reales de negocio son justo lo que no puede acabar en un repositorio público: meterlos
> dentro del propio comando de detección los filtra igual que la fuga que busca. `$NOMBRES_REALES`
> apunta a un fichero fuera del repositorio, un término por línea, que escribe quien ejecuta el
> plan. Si no existe, la comprobación no está hecha: no se puede dar por buena.

---

### Task 5: Entrega (requiere confirmación del usuario)

**Files:** ninguno.

- [ ] **Step 1: Confirmar antes de publicar**

Pedir confirmación explícita. Recordar que este PR **no trae migración y no cambia nada visible**: el despliegue es opcional y se puede esperar al tercero.

- [ ] **Step 2: Push, PR, CI y fusión**

```bash
git push -u origin feat/kpis-calculo
```

PR contra `main` con título `feat(kpis): calculo de cumplimiento de los kpis comerciales`, cuerpo explicando que es el segundo de tres, que son funciones puras sin interfaz, y las cifras reales de los gates. Esperar a que `build`, `e2e` y GitGuardian estén en verde —comprobando el estado real si el comando devuelve un código raro— y fusionar con merge commit `título (#N)`. Después `git checkout main && git fetch origin && git merge --ff-only origin/main`.

---

## Fuera de alcance

- La consulta `getHubCustomerMonthByOwner` y su acción: van en el tercer PR, donde el E2E las ejerce.
- La tabla `commercial-kpi-table.tsx` y su hueco en la pestaña Comercial.
- La clave de `CHART_HELP` y el `formatPct` que la tabla necesitará.
- Los 5 KPIs sin origen de datos.
