# Ingresos por proyectos — Diseño

**Goal:** Un administrador marca a mano qué órdenes de venta corresponden a proyectos, desde un diálogo que se abre al pulsar la cabecera de la fila "Ingresos por proyectos". La fila deja de estar vacía y suma esas órdenes por mes.

**Arquitectura:** Una tabla nueva en la base de la app (`kpi_project_orders`) guarda solo la referencia a la orden (su id de Zoho), no su importe: el importe y la fecha se calculan siempre en vivo contra el hub, igual que el resto de la tabla de KPIs. Un buscador servidor-por-consulta permite encontrar la orden entre miles sin cargarlas todas. Sin cambios en Zoho.

**Tech:** Next 16, Drizzle, zod, @tanstack/react-query, `cmdk` (`src/components/ui/command.tsx`), vitest, Playwright.

---

## 1. Contexto verificado

- **Zoho no distingue "proyecto" de ninguna forma.** Se comprobó contra la organización real: las órdenes de venta no tienen ningún campo personalizado poblado (`custom_fields_list` vacío en todas, y la organización no tiene custom fields definidos para Órdenes de venta), y el `Type` de los tratos de CRM solo vale "Cliente Nuevo" o "Cliente Existente", nada relacionado con proyectos. El etiquetado manual es la única vía: no hay nada que automatizar.
- La última migración es la `0008`; la `0009` está reservada por el spec del reset de contraseña, sin implementar. Esta usa la `0010`.
- `books.sales_orders` en el hub tiene `salesorder_id` (clave), `date`, `status`, `customer_name`, `bcy_sub_total`, `raw` (jsonb). El número legible de la orden (`OV-2026-173` en Zoho) puede estar en `raw->>'salesorder_number'`, pero no está confirmado contra el hub real: se verifica al implementar, y si no está, la búsqueda funciona igual por cliente e id interno.
- El importe neto de una línea ya tiene una fórmula probada en el resto de la app: `bcy_rate * quantity * (1 - descuento de cabecera / bcy_sub_total)`, la misma que usa `getHubCustomerMonthSales`. Se reutiliza aquí para que una orden aporte al KPI exactamente lo mismo que aportaría si apareciera en "Ventas clientes existentes".
- `profiles.id` (uuid) referencia al usuario de better-auth; `requireRole("admin")` en `src/lib/auth/guards.ts` es el guard que ya usa `saveKpiTargets`.
- Existe `src/components/ui/command.tsx` (sobre `cmdk`) para listas con buscador, ya usado en `grouping-manager.tsx` y similares. Se reutiliza en vez de escribir un buscador nuevo.
- El diálogo de detalle por celda que ya tiene la tabla (PR #14/#15/#16) es de solo lectura y se abre desde una celda de mes. Este es distinto: se abre desde la **cabecera de la fila**, y permite escribir (añadir o quitar órdenes), no solo leer.

## 2. Migración — `drizzle/0010_kpi_project_orders.sql` (nueva)

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

`tagged_by` es **nullable** con `ON DELETE SET NULL`, no `CASCADE`. Mismo motivo que ya resolvió `deleteUser` en `src/actions/admin-actions.ts` para `sales_records.created_by`/`updated_by`: si `tagged_by` arrastrara la fila entera, borrar la cuenta de un administrador borraría también las órdenes que marcó, reduciendo el KPI sin que nadie lo pidiera. `tagged_by`/`tagged_at` no se muestran en esta versión, así que perder el valor al borrar el usuario no quita nada visible; lo que hay que proteger es la marca, no quién la puso.

**No hace falta tocar `deleteUser`** en `src/actions/admin-actions.ts`: su paso 3 ya borra explícitamente la fila de `profiles`, y el `ON DELETE SET NULL` de `tagged_by` se dispara solo con ese borrado. A diferencia de `sales_records.created_by`/`updated_by` (que referencian `user.id` sin acción de borrado y necesitan el `UPDATE` manual previo para no violar la restricción), aquí la acción va declarada en la propia migración.

`kpiProjectOrders` se añade a `src/db/schema.ts` al final, después de `kpiTargets`.

## 3. Consultas al hub — `src/db/hub-kpi.ts`

### `searchHubSalesOrders(query: string): Promise<{ hub_order_id, customer_name, date, importe }[]>`
Busca por cliente, por id interno y por `raw->>'salesorder_number'` si existe, excluye `void`/`draft`, limita a 25 resultados ordenados por fecha descendente. Usa la misma fórmula de importe neto que el resto de la app.

### `getHubOrdersByIds(ids: string[]): Promise<{ hub_order_id, customer_name, date, importe }[]>`
Mismo cálculo, filtrado por `salesorder_id = ANY($1)`. Alimenta tanto la lista de "ya marcadas" del diálogo como el cálculo del KPI. Con `ids` vacío devuelve `[]` sin consultar el hub.

## 4. Acciones — `src/actions/kpi-actions.ts`

- `searchSalesOrdersForProjects(query: string)`: `requireApproved`, delega en `searchHubSalesOrders`. Lectura, cualquier usuario aprobado puede buscar (no expone nada que no vea ya en la app).
- `getKpiProjectOrders()`: `requireApproved`, lee los `hub_order_id` de `kpi_project_orders` para la empresa y los resuelve con `getHubOrdersByIds`. Si una orden marcada ya no existe en el hub (borrada en Zoho), no aparece en el resultado; no hace falta limpiarla de la tabla de marcas, simplemente no suma.
- `addProjectOrder(hub_order_id: string)`: `requireRole("admin")`, valida con zod que no está vacío, inserta con `onConflictDoNothing` (idempotente: marcar dos veces la misma orden no falla ni duplica). Devuelve `ActionResult`.
- `removeProjectOrder(hub_order_id: string)`: `requireRole("admin")`, borra por `(company_id, hub_order_id)`. Devuelve `ActionResult`.

## 5. Cálculo — `src/lib/kpi-score.ts`

```ts
export interface MonthAmountRow { mes: number; importe: number; }

/** Suma un importe por mes. Misma forma que toMonthlySeries, pero con dinero en vez
 *  de conteos: los nombres de campo lo dicen porque no son lo mismo. */
export function sumByMonth(rows: MonthAmountRow[]): number[]
```

El mes de cada orden se calcula en el propio servidor SQL o extrayendo del `date` (un `date`, no `timestamptz`, así que sin ambigüedad de zona horaria: `Number(fecha.slice(5, 7))`), nunca con `new Date(...).getMonth()`.

## 6. Catálogo — `src/lib/commercial-kpis.ts`

`ingresos_proyectos` pasa de `source: "pendiente"` a `source: "auto"`, pierde `pendingReason`. Con cero órdenes marcadas, la fila muestra `$0` en todos los meses — un cero real, calculado, no un guion de "sin datos": ya no falta ningún origen, falta que el administrador marque órdenes.

## 7. La tabla — `src/components/charts/comercial/commercial-kpi-table.tsx`

- Junto a la etiqueta de la fila `ingresos_proyectos`, un botón pequeño ("Gestionar órdenes", icono de lápiz o engranaje) visible **solo para administradores** — mismo criterio que la pantalla de metas. El resto de usuarios ve la fila con su cifra, sin el botón.
- Al pulsarlo se abre un diálogo nuevo y distinto del de detalle por celda que ya existe, para no confundir las dos interacciones:
  - Un buscador (`Command`/`CommandInput`) que llama a `searchSalesOrdersForProjects` según se escribe (debounce), mostrando cliente, fecha e importe de cada resultado con un botón "Agregar".
  - Debajo, la lista de órdenes ya marcadas (`getKpiProjectOrders`), con cliente, fecha, importe y un botón "Quitar".
  - Cada acción invalida `["kpi-project-orders"]` para refrescar tanto el diálogo como la fila de la tabla.
- La consulta `["kpi-project-orders"]` no depende de año ni de ámbito: son las órdenes marcadas, punto; el reparto por mes/año sale de la fecha de cada orden, igual que las demás filas.
- `sumByMonth(...)` alimenta la fila, siguiendo el mismo patrón que las demás (`construirFila`).

## 8. Pruebas

### Vitest — `sumByMonth`
Coloca cada importe en su mes, acumula los del mismo mes, mes vacío, meses fuera de rango, doce posiciones siempre.

### E2E — `e2e/specs/kpis-comerciales.spec.ts`
1. Con el usuario aprobado (no admin) la fila de ingresos por proyectos no tiene botón de gestionar.
2. Con el admin: buscar una orden ficticia de la semilla, marcarla, comprobar que su importe aparece en el mes correspondiente de la fila. Quitarla y comprobar que vuelve a `$0`.

La semilla del hub necesita al menos una orden de venta identificable por nombre de cliente para buscarla en el test; ya existen varias.

## 9. Gates
- Typecheck limpio.
- Lint: exactamente 10 warnings y 0 errores.
- Vitest: los actuales más los de `sumByMonth`.
- E2E: los actuales más 2.

## 10. Entrega
- Rama `feat/kpi-ingresos-proyectos`, un solo PR: migración, consultas, acciones, cálculo y diálogo son una unidad, partirlos dejaría piezas sin sentido por separado.
- **Trae migración** (`0010`): el usuario debe ejecutarla en el cliente Postgres antes de desplegar.

## 11. Fuera de alcance
- Marcar facturas, solo órdenes de venta.
- Que la fila siga el conmutador OV/FAC: no aplica, se marcan órdenes concretas.
- Deshacer un borrado accidental de marca (no hay papelera).
- Mostrar en el diálogo a quién y cuándo se marcó cada orden (la columna `tagged_by`/`tagged_at` existe para auditoría futura, no se expone en esta versión).
