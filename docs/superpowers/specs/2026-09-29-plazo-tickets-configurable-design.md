# Plazo configurable de «Tickets de Servicio Técnico en plazo» — Diseño

**Goal:** Configurar desde Configuración → «Metas de KPIs comerciales» cuántas horas laborables cuentan como plazo en el KPI «Tickets de Servicio Técnico en plazo». Hoy es la constante `PLAZO_HORAS = 12` de `src/lib/kpi-tickets.ts`.

**Arquitectura:** una columna nueva, `plazo_horas`, en `kpi_targets`. Solo se rellena en la fila del KPI `tickets_st` del ámbito «Total compañía» de cada año. La lógica de tickets recibe el plazo como parámetro en lugar de leer la constante.

---

## 1. Contexto verificado (2026-09-29)

- `PLAZO_HORAS = 12` (`src/lib/kpi-tickets.ts:21`) solo se usa en `clasificarEpisodio` (líneas 233 y 237). Esa función alimenta `contarTicketsEnPlazo`, `ticketsEnPlazoPorMes` (la celda) y `detalleTicketsMes` (el diálogo de detalle), así que las cifras de la celda y del detalle salen del mismo cálculo.
- Regla actual:
  - episodio cerrado: está en plazo si `horas < plazo`;
  - episodio abierto: está fuera de plazo si `horas >= plazo` y, si no, cuenta como «abierto sin vencer».
- `kpi_targets` guarda una fila por (compañía, año, KPI, ámbito), con `target_value` y `weight_pct`. `saveKpiTargets` solo guarda los KPIs con peso mayor que 0. Lee con `requireApproved()` y escribe con `requireRole(...ROLES_EDITAN_METAS)`, es decir Admin y Editor.
- La clave del KPI es `tickets_st` (`src/lib/commercial-kpis.ts:26`). El KPI de tickets **solo se mide a nivel compañía**.
- La tabla de KPIs pide las metas del ámbito elegido con `getKpiTargets(year, salesperson)` (`commercial-kpi-table.tsx:300`). Si hay un vendedor seleccionado, esas metas no incluyen el plazo del total.
- La última migración es la `0011`. La `0009` está reservada.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Alcance | Por año, junto a la meta. Cambiar el plazo de un año no recalcula los demás. |
| Ámbito | Solo «Total compañía», porque el KPI solo se mide a nivel compañía. |
| Valor por defecto | 12 horas laborables si el año no tiene plazo guardado. Tras desplegar, las cifras no cambian. |
| Formato | Horas laborables mayores que 0, con dos decimales como mucho (por ejemplo 4,5). |
| Permisos | Los mismos que las metas: Admin y Editor editan, el Lector ve. |
| Almacenamiento | Columna `kpi_targets.plazo_horas`, nullable. |

## 3. Datos

Migración `drizzle/0012_kpi_plazo_horas.sql`:

```sql
ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS plazo_horas numeric(6,2);
DO $$ BEGIN
  ALTER TABLE kpi_targets ADD CONSTRAINT kpi_targets_plazo_horas_check
    CHECK (plazo_horas IS NULL OR plazo_horas > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- No incluye ningún `UPDATE`: el valor nulo equivale a 12, así que se puede volver a ejecutar sin efectos.
- `src/db/schema.ts`: se añade `plazo_horas: numeric("plazo_horas", { precision: 6, scale: 2 })` con su `check`.
- `KpiTargetRow` gana `plazo_horas: number | null`, convertido con `Number()` como los demás campos numéricos.

## 4. Lógica pura (`src/lib/kpi-tickets.ts`)

- `PLAZO_HORAS` pasa a llamarse `PLAZO_HORAS_POR_DEFECTO = 12`.
- `clasificarEpisodio(e, ahora, plazoHoras)`, `contarTicketsEnPlazo(…, plazoHoras)`, `ticketsEnPlazoPorMes(…, plazoHoras)` y `detalleTicketsMes(…, plazoHoras)` reciben el plazo como parámetro obligatorio, para que ningún consumidor use la constante sin darse cuenta.
- Hay una función nueva, `plazoTicketsDelAnio(metasTotal: KpiTargetRow[]): number`. Devuelve el `plazo_horas` de la fila `tickets_st`, o 12 si no existe o es nulo.

## 5. Servidor

- `kpiTargetsSchema` acepta `plazo_horas` opcional en cada item: número mayor que 0, `multipleOf(0.01)`, máximo 999, o `null`. Se rechaza si lo lleva un KPI distinto de `tickets_st`, o si `salesperson` no es nulo.
- `saveKpiTargets` guarda `plazo_horas` en el insert y en la actualización de la fila en conflicto.
- `getKpiTargets` devuelve `plazo_horas`.

## 6. Tabla de KPIs (`commercial-kpi-table.tsx`)

- La tabla obtiene el plazo con `plazoTicketsDelAnio` a partir de las metas del **total de la compañía** del año:
  - si el ámbito elegido ya es el total, reutiliza esa consulta;
  - si es un vendedor, hace una consulta aparte, `getKpiTargets(year, null)`, con su propia clave de react-query.
- Pasa ese plazo a `ticketsEnPlazoPorMes` y a `detalleTicketsMes`.
- El diálogo de detalle (`tickets-detalle-dialog.tsx`) muestra el plazo aplicado, por ejemplo «En plazo: menos de 12 h laborables», en lugar de un 12 fijo si lo lleva escrito.

## 7. Interfaz de metas (`kpi-targets-form.tsx`)

- En el ámbito «Total compañía», la fila «Tickets de Servicio Técnico en plazo» tiene un tercer campo, **Plazo (h)**, con `aria-label` «Plazo de Tickets de Servicio Técnico en plazo». Cuando no hay nada guardado aparece relleno con 12.
- En el ámbito de un vendedor, ese campo no aparece.
- El Lector ve el campo en solo lectura, igual que la meta y el peso.
- El botón de guardar se desactiva si el plazo no es un número mayor que 0.
- `saveKpiTargets` borra las filas de los KPIs sin peso. Por eso, un plazo distinto de 12 solo se puede guardar si «Tickets de Servicio Técnico en plazo» tiene meta y peso. Si no los tiene, el formulario lo avisa y bloquea el guardado, para que el plazo no se pierda en silencio.
- La lógica de conversión del borrador (texto → número, valor por defecto) va en funciones puras con test, no dentro del componente.

## 8. Pruebas

**vitest:**
- `clasificarEpisodio` con distintos plazos (8 y 12). La frontera es exacta: `horas == plazo` queda fuera de plazo y justo por debajo queda en plazo, tanto con episodios cerrados como abiertos.
- `plazoTicketsDelAnio`: sin fila, con plazo nulo y con valor.
- `kpiTargetsSchema`: acepta el plazo en `tickets_st` del total; lo rechaza en otro KPI o en el ámbito de un vendedor; rechaza 0, negativos y más de dos decimales.
- Se adaptan los tests existentes de `kpi-tickets` a la firma nueva.

**E2E:**
- Un admin cambia el plazo del año en Configuración y la cifra de tickets de ese mes cambia en la tabla. Para eso la semilla del hub necesita episodios entre los dos plazos que se prueben. Si la semilla actual no los tiene, se añaden con datos inventados.
- El Lector ve el plazo sin poder editarlo.
- El test restaura el plazo original al terminar.

## 9. Despliegue

Ejecutar `drizzle/0012_kpi_plazo_horas.sql` en `sales_tracker` antes de desplegar. Se puede volver a ejecutar sin efectos.

## 10. Fuera de alcance

- Un plazo por vendedor.
- Configurar el horario laboral (lunes a viernes, de 8:00 a 17:00) o los festivos.
