# Categorías de Servicio Técnico configurables — Diseño

**Goal:** Que Admin y Editor elijan desde Configuración qué categorías cuentan como **ST** (mano de obra) y cuáles como **C&R** (consumibles y repuestos). Hoy son dos listas fijas en `src/lib/tech-service.ts` (`ST_CATEGORIES`, `CR_CATEGORIES`). El Lector ve la clasificación sin poder cambiarla.

**Arquitectura:** Una columna nueva en `categories` guarda el grupo de cada categoría. El gráfico «Análisis de Servicio Técnico», su widget del dashboard y el KPI «Incremento de ventas de Servicio Técnico» leen esa columna, así que siempre usan la misma clasificación.

---

## 1. Contexto verificado (2026-09-25)

- `ST_CATEGORIES` (12 nombres) y `CR_CATEGORIES` (15 nombres) viven en `src/lib/tech-service.ts`. Las usan:
  - `buildTechServiceData`, que alimenta el gráfico y el widget;
  - `acumuladoServicioTecnico`, que usa `stGrowthByQuarter` para calcular el KPI de la tabla comercial.
- La comparación se hace por nombre exacto. Si se renombra una categoría o se crea una nueva, deja de contar sin ningún aviso.
- Los tres consumidores cargan las categorías con `getCategories()` (`src/actions/category-actions.ts`) y la clave de react-query `["categories"]`. La consulta hace `select()` de la tabla completa.
- `categories` es por compañía, con un nombre único por compañía (`categories_company_name_unique`).
- La última migración es la `0010`. La `0009` está reservada para el reset de contraseña.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Tipo | Configuración guardada, compartida por el gráfico y el KPI. No es un filtro de vista. |
| Alcance | Única para todos los años. Al cambiarla se recalculan también los años pasados. La comparación interanual sigue siendo coherente, porque aplica la misma lista a los dos años. |
| Permisos | Lectura con `requireApproved()`. Escritura con `requireRole(...ROLES_EDITAN_METAS)`, es decir Admin y Editor, la misma regla que las metas. |
| Ubicación | Configuración, en una tarjeta nueva debajo de «Metas de KPIs comerciales». |
| Almacenamiento | Columna `categories.tech_service_bucket`. Una categoría no puede estar en los dos grupos, porque la columna solo guarda un valor. Si se renombra, conserva su grupo. |

## 3. Datos

Migración `drizzle/0011_tech_service_bucket.sql`:

```sql
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tech_service_bucket text;
ALTER TABLE categories ADD CONSTRAINT categories_tech_service_bucket_check
  CHECK (tech_service_bucket IS NULL OR tech_service_bucket IN ('st', 'cr'));
UPDATE categories SET tech_service_bucket = 'st' WHERE name IN (...12 nombres ST actuales...);
UPDATE categories SET tech_service_bucket = 'cr' WHERE name IN (...15 nombres C&R actuales...);
```

- El `UPDATE` copia las listas fijas de hoy. Tras desplegar, las cifras no cambian.
- El `ADD CONSTRAINT` va dentro de `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;`, el mismo patrón idempotente que `0005_favorites.sql`.
- `src/db/schema.ts`: `tech_service_bucket: text("tech_service_bucket")`, con su `check`.
- Tipo: `type TechServiceBucket = "st" | "cr"`.

## 4. Lógica pura (`src/lib/tech-service.ts`)

- Se eliminan `ST_CATEGORIES` y `CR_CATEGORIES`.
- `gruposServicioTecnico(categorias): Map<string, TechServiceBucket>` recibe las categorías con `id` y `tech_service_bucket`. Devuelve solo las clasificadas, incluidas las inactivas, para que sus ventas históricas sigan contando.
- `buildTechServiceData` y `stGrowthByQuarter` (a través de `acumuladoServicioTecnico`) reciben ese mapa en lugar del `catMap` de nombres. Siguen siendo funciones puras.
- Los tres consumidores (`analytics/page.tsx`, `tech-service-widget.tsx` y `commercial-kpi-table.tsx`) construyen el mapa con la misma función, a partir de la consulta `["categories"]` que ya hacen.

## 5. Servidor (`src/actions/category-actions.ts`)

`saveTechServiceBuckets(st: string[], cr: string[]): Promise<ActionResult>`:

- `requireRole(...ROLES_EDITAN_METAS)`.
- Validación zod (`techServiceBucketsSchema` en `src/lib/validation.ts`):
  - listas de UUID;
  - sin duplicados;
  - sin intersección entre `st` y `cr`.
- En una transacción:
  1. pone `tech_service_bucket = NULL` en todas las categorías de la compañía;
  2. marca `'st'` las de la lista `st` y `'cr'` las de la lista `cr`, siempre con `company_id = profile.company_id`. Los identificadores de otra compañía no se tocan.
- `revalidatePath("/settings")` y `revalidatePath("/analytics")`.

## 6. Interfaz (`src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`)

Una tarjeta nueva, «Categorías de Servicio Técnico», que se monta en `settings/page.tsx` debajo de `KpiTargetsForm`.

- Tiene dos desplegables de selección múltiple con buscador, con el mismo patrón `Popover` que el de «Histórico Anual» (`historical-sales-category.tsx`):
  - **Categorías de ST (mano de obra)**;
  - **Categorías de C&R (consumibles y repuestos)**.
- Cada desplegable lista las categorías activas de la compañía.
- Una categoría marcada en un grupo aparece desactivada en el otro, con la nota «en ST» o «en C&R».
- Debajo de cada desplegable, las categorías marcadas se muestran como etiquetas. Una categoría inactiva ya clasificada sigue apareciendo como etiqueta.
- El botón «Guardar» envía los dos grupos a la vez. Al terminar, invalida `["categories"]`, así que el gráfico y el KPI se recalculan sin recargar la página.
- Se permiten listas vacías: un grupo sin categorías vale 0.
- El Lector (`!puedeEditarMetas(role)`) ve solo las dos listas de etiquetas, sin desplegables ni botón. La descripción dice «Solo lectura».
- La lógica de selección (alternar, exclusión mutua y estado inicial a partir de las categorías) va en una función pura con test, no dentro del componente.

## 7. Pruebas

**vitest:**
- `gruposServicioTecnico`: solo las clasificadas, incluidas las inactivas.
- `buildTechServiceData` y `stGrowthByQuarter` con el mapa. Se adaptan los tests existentes.
- Coherencia: con la misma clasificación, el acumulado anual del gráfico y el del KPI coinciden.
- La lógica de selección de la interfaz: alternar y exclusión entre grupos.
- `techServiceBucketsSchema`: rechaza la intersección, los duplicados y lo que no sea UUID.

**E2E:**
- La semilla (`e2e/db/seed-app.mjs`) clasifica al menos una categoría en cada grupo, con datos inventados.
- Un admin mueve una categoría de grupo en Configuración, guarda y el cambio persiste al recargar.
- El Lector ve las etiquetas, pero no los desplegables ni el botón.

## 8. Despliegue

La migración `0011` se ejecuta a mano en `sales_tracker` antes de desplegar la app, como las anteriores. No hace falta tocar el worker ni el hub.

## 9. Fuera de alcance

- Clasificación distinta por año.
- Más grupos además de ST y C&R.
- Filtrar el gráfico sin guardar la selección.
