# Macro-categorías configurables — Diseño

**Goal:** Configurar desde Configuración qué categorías forman cada macro-categoría: **Mano de obra**, **Consumibles y repuestos**, **Equipos** y **Operaciones**. Hoy las decide `bucketForCategory` (`src/lib/customer-item.ts:19-28`) a partir del nombre de cada categoría.

**Arquitectura:** una columna nueva, `categories.macro_categoria`, **independiente** de `tech_service_bucket` (decisión del usuario, 2026-09-29). Una función pura construye un mapa de nombre de categoría a macro-categoría. Todos los consumidores usan ese mapa, y una categoría sin marcar cuenta como **Equipos**.

---

## 1. Contexto verificado (2026-09-29)

- Estas son las reglas de `bucketForCategory(nombre)`:
  - `C&R …` va a `cr`;
  - `CAL …`, `ST`, `ST …` y `Alquileres` van a `mano_obra`;
  - `Operación de Redes` y `Consultoría` van a `operacion`;
  - todo lo demás, incluidos los nombres nulos, va a `equipos`.
- La función se llama desde:
  - `src/lib/analytics-comercial.ts`, que alimenta las tarjetas de mezcla, la tarjeta por cliente y la de temporada de Comercial;
  - `src/lib/customer-detail.ts`, para el detalle de cliente;
  - `src/lib/dashboard-insights.ts`, para el donut del dashboard;
  - `src/lib/customer-item.ts`, para la página Cliente-Artículo y su exportación.
- `BUCKET_LABELS` y las etiquetas locales de `bucket-mix-card.tsx`, `bucket-by-client-card.tsx`, `season-by-bucket-card.tsx`, `customer-bucket-mix-card.tsx` y `cliente-articulo/page.tsx` repiten los nombres «Mano de Obra / Cal», «C&R», «Equipos» y «Operación».
- Las ventas llegan del hub con el **nombre** de la categoría. `categories.name` es único por compañía.
- La última migración es la `0012`. La `0009` está reservada.
- La tarjeta «Categorías de Servicio Técnico» (#31) es el patrón que se replica:
  - `src/app/(dashboard)/settings/_components/tech-service-categories-form.tsx`;
  - `src/lib/tech-service-selection.ts`;
  - `saveTechServiceBuckets`.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Relación con Servicio Técnico | Independiente: dos columnas y dos tarjetas, que pueden no coincidir. |
| Categoría sin marcar | Cuenta como **Equipos**, igual que hoy. Equipos se puede marcar también de forma explícita. |
| Nombres | En la tarjeta, los gráficos y las exportaciones se usan **Mano de obra**, **Consumibles y repuestos**, **Equipos** y **Operaciones**. |
| Permisos | Lectura con `requireApproved()`. Escritura con `requireRole(...ROLES_EDITAN_METAS)`, es decir Admin y Editor. |
| Ubicación | Configuración, debajo de «Categorías de Servicio Técnico». |
| Inactivas | Conservan su macro-categoría, como en Servicio Técnico. |

## 3. Datos

Migración `drizzle/0013_macro_categoria.sql`:

- `ALTER TABLE categories ADD COLUMN IF NOT EXISTS macro_categoria text;`
- `CHECK (macro_categoria IS NULL OR macro_categoria IN ('mano_obra','cr','equipos','operacion'))`, dentro de `DO $$ … EXCEPTION WHEN duplicate_object`.
- `UPDATE` que replica las reglas actuales, solo sobre filas con `macro_categoria IS NULL`. Eso **no basta** para volver a ejecutarla sin riesgo: una categoría desmarcada en la app también queda en nulo y la regla antigua la volvería a marcar. Por eso la 0013 se ejecuta **una sola vez**, como la 0011:
  - `name LIKE 'C&R %'` se marca como `cr`;
  - `name LIKE 'CAL %' OR name = 'ST' OR name LIKE 'ST %' OR name = 'Alquileres'` se marca como `mano_obra`;
  - `name IN ('Operación de Redes','Consultoría')` se marca como `operacion`.
- Las demás categorías quedan en nulo y cuentan como Equipos.
- `src/db/schema.ts` refleja la columna y su `check`.

**Cambio de comportamiento conocido.** Una venta cuya categoría del hub **no existe** en la tabla `categories` de la app, pero cuyo nombre empieza por «C&R » o «CAL », hoy se clasifica por su prefijo. A partir de ahora caerá en Equipos, porque no tiene fila que configurar. Antes de desplegar se comprueba con una consulta si existe algún caso así.

## 4. Lógica pura

- En `src/lib/customer-item.ts`:
  - `type Bucket` se mantiene: `mano_obra`, `cr`, `equipos` y `operacion`;
  - `BUCKET_LABELS` pasa a **Mano de obra**, **Consumibles y repuestos**, **Equipos** y **Operaciones**.
- Hay una función nueva, `mapaMacroCategorias(categorias): Map<string, Bucket>`. La clave es el nombre de la categoría. Incluye solo las categorías clasificadas, activas e inactivas.
- `bucketForCategory(nombre, mapa)` devuelve la entrada del mapa, o `equipos` si no la hay.
- Los consumidores reciben el mapa como parámetro y siguen siendo funciones puras.
- Las etiquetas locales duplicadas en los componentes se sustituyen por `BUCKET_LABELS`.
- La lógica de selección de la interfaz se generaliza de dos grupos (ST y C&R) a N grupos. La tarjeta de Servicio Técnico la sigue usando sin cambiar su comportamiento.

## 5. Servidor

- `getMacroCategorias()`: `requireApproved()`. Devuelve todas las categorías de la compañía, activas e inactivas, con `id`, `name`, `is_active` y `macro_categoria`. Su clave de react-query es `["categories", "macro-categorias"]`.
- `saveMacroCategorias({ mano_obra, cr, equipos, operacion }: Record<Bucket, string[]>)`:
  - requiere `requireRole(...ROLES_EDITAN_METAS)`;
  - valida con zod: UUIDs, sin duplicados y sin que un mismo id aparezca en dos grupos;
  - en una transacción, pone a nulo las categorías de la compañía y después marca cada grupo, siempre filtrando por `company_id`;
  - termina con `revalidatePath` de las rutas afectadas.

## 6. Interfaz

La tarjeta **«Macro-categorías»** (`src/app/(dashboard)/settings/_components/macro-categories-form.tsx`) se monta debajo de la de Servicio Técnico.
- Tiene cuatro selectores múltiples con buscador, con el mismo patrón `Popover` que la tarjeta de Servicio Técnico. Cada uno lista las categorías activas.
- Una categoría marcada en un grupo aparece desactivada en los demás, con la nota «en Equipos», por ejemplo.
- Debajo de cada selector se muestran las etiquetas de sus categorías, incluidas las inactivas. Admin y Editor pueden quitar cada una con una X.
- La descripción avisa de que lo que no esté marcado cuenta como Equipos.
- El botón «Guardar macro-categorías» solo se activa si hay cambios. Al guardar invalida `["categories"]`, lo que refresca por prefijo todas las consultas de categorías.
- El Lector solo ve las etiquetas, y la descripción indica «Solo lectura».

## 7. Consumidores

Los componentes que hoy llaman, directa o indirectamente, a `bucketForCategory` cargan `getMacroCategorias` con la clave `["categories", "macro-categorias"]`. Construyen el mapa y se lo pasan a las funciones puras. Mientras la consulta carga, muestran su estado de carga, nunca cifras calculadas con un mapa vacío.

## 8. Pruebas

**vitest:**
- `mapaMacroCategorias` incluye las categorías inactivas y no incluye las que no están marcadas.
- `bucketForCategory` devuelve Equipos por defecto.
- Coherencia con la migración: aplicar las reglas antiguas a un conjunto de nombres da lo mismo que el mapa sembrado con esas reglas.
- Validación zod: rechaza un id en dos grupos, los duplicados y lo que no sea UUID.
- Selección de N grupos: exclusión mutua, quitar con la X y detección de cambios. Los tests de la selección de Servicio Técnico siguen en verde.
- Se adaptan los tests existentes de exportación y consumidores a los nombres y la firma nuevos.

**E2E:**
- La semilla asigna macro-categorías inventadas a sus categorías.
- Un admin mueve una categoría de macro-categoría, guarda y el cambio persiste al recargar.
- El test restaura el estado al terminar.
- El Lector ve las etiquetas sin controles.

## 9. Despliegue

1. Consulta previa: listar las categorías de venta del hub que no existen en `categories` y cuyo nombre empieza por «C&R » o «CAL ».
2. Ejecutar `drizzle/0013_macro_categoria.sql` en `sales_tracker` **una sola vez** (ver sección 3).
3. Desplegar la app.

## 10. Fuera de alcance

- Crear, renombrar o borrar macro-categorías: son cuatro fijas.
- Unificar con la clasificación de Servicio Técnico.
