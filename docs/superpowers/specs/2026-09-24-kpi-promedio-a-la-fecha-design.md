# Promedio a la fecha en la tabla de KPIs comerciales — Diseño

**Goal:** La tabla de KPIs comerciales enseña, además del promedio y el aporte anuales, un **promedio y un aporte a la fecha**, calculados solo sobre los periodos transcurridos, incluido el que está en curso. La fila TOTAL tiene también su versión a la fecha. Así, durante el año, la nota no queda penalizada por los meses que aún no han llegado.

**Arquitectura:** Una función pura nueva en `src/lib/kpi-score.ts` decide cuántos periodos se promedian. Cada fila de la tabla calcula las dos parejas (promedio y aporte) y el marcador calcula dos TOTALES. No hay consulta nueva, ni migración, ni cambios en el worker.

---

## 1. Contexto verificado

- Hoy la columna **Promedio** es `kpiAverage(cumplimiento)`, la media de todos los periodos del año con cumplimiento no nulo (`construirFila`, `src/components/charts/comercial/commercial-kpi-table.tsx`). En el año en curso, los periodos futuros de las filas de ventas, tratos y proyectos valen 0 y cuentan como 0 %, lo que arrastra la media hacia abajo.
- **Aporte** = `kpiContribution(promedio, peso)`, con el cumplimiento topado al 100 %.
- La **fila TOTAL** enseña bajo Promedio `scoreboard(...).total`, la nota renormalizada sobre lo medible con su cobertura, y bajo Aporte, la suma de los aportes.
- Hay dos filas especiales:
  - **Incremento de Servicio Técnico** (`construirFilaIncremento`): su promedio y su logro son `valorAlCierre(serie, year, hoy)`, el valor del trimestre en curso, o del T4 en un año cerrado.
  - **Tickets en plazo:** los meses sin episodios valen `null`, «—», y no cuentan.
- La regla de que un periodo sin meta vale `null` (`attainment`) se mantiene.

## 2. Reglas (acordadas con el usuario)

1. **Periodos transcurridos:** hasta el periodo en curso, **incluido**.
   - Mensual: de enero al mes actual.
   - Trimestral: hasta el trimestre actual.
   - Semestral: hasta el semestre actual.
2. **Año pasado:** todos los periodos, así que «a la fecha» es igual a «anual». **Año futuro:** ninguno, así que «a la fecha» vale `null` y se pinta «—».
3. **Promedio a la fecha** = `kpiAverage` del cumplimiento de los periodos transcurridos.
4. **Aporte a la fecha** = `kpiContribution(promedio a la fecha, peso)`.
5. **TOTAL a la fecha:** `scoreboard` sobre el logro a la fecha de cada fila y la suma de los aportes a la fecha, con la misma regla de renormalización que el anual.
6. **Incremento de Servicio Técnico:**
   - **anual** = el valor al cierre del año, es decir `valorAlCierre` con el 31 de diciembre del año, que es el T4;
   - **a la fecha** = el valor del trimestre en curso, lo que la fila enseña hoy.

   En un año cerrado los dos coinciden.
7. **Cobertura:** se enseña una sola vez, la del anual. Depende de qué KPIs tienen dato y peso, no del periodo. Si la cobertura a la fecha fuera distinta, por ejemplo porque un KPI solo tiene dato en periodos futuros, se enseñan las dos.

## 3. Cambios

### 3.1 `src/lib/kpi-score.ts`

- **`periodosTranscurridos(period: KpiPeriod, year: number, hoy: Date): number`** devuelve cuántos periodos del año cuentan:
  - año pasado → 12, 4 o 2;
  - año futuro → 0;
  - año en curso → mes actual (1–12) para mensual, `ceil(mes / 3)` para trimestral y `ceil(mes / 6)` para semestral.

  El mes se lee con `hoy.getMonth()` de la hora local del navegador, que es lo que ya usa `valorAlCierre`.
- El promedio a la fecha es `kpiAverage(cumplimiento.slice(0, periodosTranscurridos(...)))`. No se crea otra función de media: se reutiliza `kpiAverage`, que ya devuelve `null` con una lista vacía, como en un año futuro.
- **Tests:**
  - `periodosTranscurridos` para los tres periodos en un año pasado, en el año en curso (inicio, mitad y final de periodo) y en un año futuro;
  - el promedio a la fecha excluye los periodos futuros con 0.

### 3.2 `commercial-kpi-table.tsx`

- `FilaKpi` gana `promedioFecha`, `logroFecha` y `aporteFecha`. `construirFila` y `construirFilaIncremento` los calculan con las reglas de §2. `construirFila` recibe `year` y `hoy` para saber cuántos periodos cuentan.
- Hay un segundo `scoreboard` y una segunda suma de aportes para el TOTAL a la fecha.
- **Cabeceras:** «Promedio anual», «Aporte anual», «Promedio a la fecha» y «Aporte a la fecha», en ese orden, tras la columna Dic. La fila TOTAL rellena las cuatro celdas.
- `hoy` se toma una vez por cálculo, el mismo instante para todas las filas, como ya hace `ahoraTickets`.

### 3.3 E2E

- Actualizar las aserciones que buscan las cabeceras «Promedio» y «Aporte», o sus celdas por posición.
- **Test nuevo:** en el año en curso de la semilla, un KPI mensual con periodos futuros a 0 tiene «Promedio a la fecha» mayor o igual que «Promedio anual», y en la fila TOTAL aparecen las dos notas.
  - La cifra exacta se calcula a mano a partir de la semilla y la fecha del sistema. Si depende del mes en que se ejecuta, el test compara la relación entre los valores, o calcula lo esperado con la misma función pura, en lugar de fijar un número.
- Revisar que la tabla sigue siendo usable en móvil: gana dos columnas y ya tiene scroll horizontal.

## 4. Fuera de alcance

- Cambiar la nota que se usa en otras pantallas.
- Metas prorrateadas por periodo transcurrido. La meta de cada periodo sigue siendo la misma.

Sin migración. Repositorio público: los tests usan solo la semilla inventada.
