# Evolución histórica por macro-categoría — Diseño

**Goal:** Añadir en Análisis → Exploración, debajo de «Evolución Histórica por Grupo», un gráfico equivalente: **«Evolución Histórica por Macro-categoría»**. Tiene las mismas funciones: vistas anual, trimestral y mensual, conmutador OV/FAC y selección de varias series.

**Arquitectura:** una lectura nueva en el servidor devuelve las ventas repartidas entre las cuatro macro-categorías, en el mismo formato que usa el gráfico de grupos (`GroupingAnalysisResult`). El componente del gráfico de grupos se generaliza a una tarjeta de evolución que recibe el título, los textos y el origen de datos. Los dos gráficos la comparten.

---

## 1. Contexto verificado (2026-10-08)

- `src/components/charts/premium/group-evolution-card.tsx` tiene 449 líneas:
  - carga `getGroupingAnalysisData(recordType)` con `useEffect`;
  - guarda en su estado el tipo (OV/FAC), la vista (`ANNUAL`, `QUARTERLY`, `MONTHLY`), el año seleccionado y los grupos seleccionados;
  - al cargar selecciona los tres primeros grupos y el último año;
  - filtra los años anteriores a `FIRST_YEAR`.
- Se monta en `src/app/(dashboard)/analytics/page.tsx:293` (pestaña Exploración) y como widget del dashboard en `src/lib/widget-registry.tsx:175`.
- `GroupingAnalysisResult` tiene `rows`, `years` y `yearTotals`. Cada fila, `GroupingAnalysisRow`, tiene:
  - `groupId`, `groupName` y `color`;
  - `years`: por año, `{ amount, percentage }`;
  - `months`: por año y mes, el importe;
  - `average`.
- `getGroupingAnalysisData` (`src/actions/grouping-actions.ts:280`) lee las ventas del hub en vivo con `getHubSalesRows()` si el hub está activo, o de `sales_records` si no. Casa cada venta con las categorías de la app por nombre en minúsculas y descarta las ventas cuya categoría no existe en la app.
- Las macro-categorías (#35):
  - se guardan en `categories.macro_categoria`;
  - `BUCKETS` y `BUCKET_LABELS` están en `src/lib/customer-item.ts`;
  - lo que no está marcado cuenta como Equipos.
- Los colores de las tarjetas de mezcla (`bucket-mix-card.tsx:21-24`) son:
  - `mano_obra`: `#6366f1`;
  - `cr`: `#10b981`;
  - `equipos`: `#f59e0b`;
  - `operacion`: `#ef4444`.
- Al guardar las macro-categorías, `saveMacroCategorias` invalida `["categories"]` en el cliente y llama a `revalidatePath`.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Ubicación | Análisis → Exploración, justo debajo del gráfico de grupos. No se añade como widget del dashboard. |
| Series | Las cuatro macro-categorías. Al abrir salen las cuatro seleccionadas. |
| Clasificación | La de Configuración. Sin marcar cuenta como Equipos. Las inactivas clasificadas cuentan. |
| Ventas incluidas | Las mismas que en el gráfico de grupos: se descartan las ventas cuya categoría no existe en la app, como en el resto de gráficos de macro-categorías que parten de las ventas por categoría. |
| Colores | Los de las tarjetas de mezcla. Pasan a una constante compartida, `BUCKET_COLORS`. |
| Código | Una tarjeta genérica de evolución compartida. El gráfico de grupos no cambia su comportamiento. |

## 3. Lógica pura

`src/lib/macro-evolution.ts`:
- `buildMacroEvolution(records, bucketPorCategoriaId): GroupingAnalysisResult`.
  - `records`: `{ category_id, record_year, record_month, amount_usd }[]`, ya filtrados por tipo.
  - `bucketPorCategoriaId`: `Map<string, Bucket>` con las categorías clasificadas. Una categoría sin entrada cuenta como `equipos`.
  - Devuelve siempre cuatro filas, en el orden de `BUCKETS`, con:
    - `groupId` igual a la clave de la macro-categoría;
    - `groupName` igual a `BUCKET_LABELS[b]`;
    - `color` igual a `BUCKET_COLORS[b]`;
    - `years[año] = { amount, percentage }`, donde el porcentaje es sobre el total del año;
    - `months[año][mes]`;
    - `average`, calculado igual que en el gráfico de grupos.
  - `years` va ordenado de forma ascendente. `yearTotals` es la suma de las cuatro filas.
- `BUCKET_COLORS: Record<Bucket, string>` se define en `src/lib/customer-item.ts`. Las tarjetas que hoy repiten los colores pasan a usarlo.

## 4. Servidor

`getMacroEvolutionData(recordType: RecordType): Promise<GroupingAnalysisResult>`, en `src/actions/grouping-actions.ts` o en un fichero de acciones propio:
- Usa la misma autorización que `getGroupingAnalysisData` (perfil aprobado de la compañía).
- Lee las ventas del mismo origen (hub en vivo o `sales_records`) y con el mismo cruce por nombre en minúsculas. Ese tramo se extrae a un helper común para no duplicarlo.
- Lee todas las categorías de la compañía, activas e inactivas, con su `macro_categoria`.
- Devuelve `buildMacroEvolution(...)`.

## 5. Componente

- `group-evolution-card.tsx` se generaliza a una tarjeta de evolución, `EvolutionCard`, que recibe:
  - `title` y `description`;
  - `help`, el texto de ayuda;
  - `fetcher: (recordType) => Promise<GroupingAnalysisResult>`;
  - `seleccionInicial: "primeras3" | "todas"`;
  - los textos del selector («N Grupos Seleccionados» o «N Macro-categorías seleccionadas», y el texto del estado vacío);
  - una clave para refrescar cuando cambia la clasificación.
- `GroupEvolutionCard` queda como una envoltura fina, con las mismas props y el mismo comportamiento que hoy.
- `MacroEvolutionCard` es otra envoltura:
  - título «Evolución Histórica por Macro-categoría»;
  - descripción «Tendencia anual y desglose porcentual de tus macro-categorías.»;
  - arranca con las cuatro seleccionadas;
  - vuelve a pedir los datos cuando se invalida la clasificación (`MACRO_CATEGORIAS_KEY`).
- Se monta en `analytics/page.tsx`, debajo de `<GroupEvolutionCard />`, con el mismo `recordType` inicial y la misma carga diferida (`dynamic`).
- Se añade un texto de ayuda nuevo en `src/lib/chart-help.ts`.

## 6. Pruebas

**vitest:**
- `buildMacroEvolution`:
  - siempre devuelve cuatro filas, en el orden de `BUCKETS`, con sus nombres y colores;
  - una categoría sin entrada en el mapa cuenta como Equipos;
  - los importes por año y por mes son correctos;
  - los porcentajes de las cuatro filas suman 100 en cada año con ventas;
  - `yearTotals` es la suma de las filas;
  - sin ventas, las filas valen cero y `years` está vacío.

**E2E** (`e2e/specs/evolucion-macro.spec.ts`):
- En Análisis → Exploración, la tarjeta «Evolución Histórica por Macro-categoría» aparece debajo de la de grupos.
- Se puede cambiar entre Anual, Trimestral y Mensual, y entre OV y FAC, sin errores.
- Se puede quitar una macro-categoría y volver a añadirla.
- La tarjeta de grupos sigue funcionando.

## 7. Despliegue

Solo código: no necesita migración.

## 8. Fuera de alcance

- Un widget en el dashboard configurable.
- Contar como Equipos las ventas de categorías del hub que no existen en la app.
