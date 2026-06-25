# Fase 1 — IA + base UX — Diseño

**Goal:** Limpiar la información-arquitectura del menú y unificar controles repetidos de los
informes, sin cambiar la lógica de negocio.
- **IA:** eliminar rutas huérfanas/redundantes (`/kpis`, `/sales`, `/import`), añadir
  **Suscripciones** al menú, y retirar el código muerto de mutación de ventas.
- **Consistencia:** extraer piezas de control reutilizables (OV/FAC, búsqueda, CSV, estado vacío)
  y aplicarlas a los informes.

**Nota:** el **toggle de tema YA existe** en `header.tsx` (Sol/Luna) → no se toca.

**Arquitectura:** componentes presentacionales pequeños en `src/components/common/`; refactor
incremental de las páginas de informe; sin nuevas consultas ni tipos. Validación: tsc + lint + build
(UI, sin tests unitarios nuevos salvo que aplique).

---

## Parte A — IA / navegación

**A1. Eliminar rutas** (confirmado: nada las enlaza; los matches de "sales" eran la action
`sales-actions`, no la ruta):
- Borrar `src/app/(dashboard)/kpis/` (duplica Inicio).
- Borrar `src/app/(dashboard)/sales/` (redundante con Tablas/Artículos).
- Borrar `src/app/(dashboard)/import/` (solo informativa; ventas read-only).

**A2. Menú:** en `sidebar.tsx` y `mobile-nav.tsx` añadir, tras Configuración (o donde encaje),
`{ href: "/subscriptions", label: "Suscripciones", icon: CreditCard }` (importar `CreditCard`).

**A3. Código muerto de ventas:** al borrar `/sales` (y `/import`), estas acciones quedan SIN
callers → eliminarlas de `src/actions/sales-actions.ts`: `upsertSalesRecord`,
`bulkUpsertSalesRecords`, `deleteSalesRecord`, la const `SALES_READONLY_MSG` y los imports que
queden sin usar (p. ej. `requireRole`, `uuidSchema`, `salesRecordSchema`, `sql`, `z` si aplica).
**Conservar** `getSalesData`, `getMonthlyTotals`, `getAnnualByCategory`, `warnIfLargeSalesPayload`,
`hubEnabled`, `getHubSalesRows`. Verificar con `npm run lint` (0 imports sin usar).

---

## Parte B — Piezas de control reutilizables

Crear en `src/components/common/`:

- **`record-type-select.tsx`** → `RecordTypeSelect({ value, onValueChange, className? })`:
  el `Select` OV/FAC con items `INVOICE` ("Facturas (FAC)") y `SALES_ORDER` ("Órdenes de Venta (OV)")
  y el `SelectValue` mostrando la etiqueta. `value: "SALES_ORDER" | "INVOICE"`.
- **`search-input.tsx`** → `SearchInput({ value, onChange, placeholder?, className? })`:
  el `Input` con icono `Search` a la izquierda (patrón `relative` + `pl-10`).
- **`csv-button.tsx`** → `CsvButton({ onClick, disabled? })`: botón `outline sm` con icono
  `Download` y texto "CSV".
- **`empty-state.tsx`** → `EmptyState({ message })`: bloque centrado `text-muted-foreground py-10`.

**Aplicar** (reemplazo 1:1 del marcado actual, sin cambiar estado ni lógica):
- `articulos/page.tsx`: RecordTypeSelect + SearchInput + CsvButton + EmptyState.
- `clientes/page.tsx`: RecordTypeSelect + SearchInput + CsvButton + EmptyState.
- `cliente-articulo/page.tsx`: RecordTypeSelect + SearchInput + CsvButton + EmptyState.
- `tablas/page.tsx`: CsvButton + EmptyState (su selector de tipo usa `RECORD_TYPES` con
  etiquetas OV/FAC propias; si el marcado coincide, usar RecordTypeSelect; si no, dejarlo).

Cada página debe seguir compilando idéntica en comportamiento (mismos handlers/estado).

---

## Estados / errores
- `EmptyState` sustituye los textos "Sin resultados/Sin ventas…" dentro de las celdas
  `colSpan` (el `<TableCell colSpan>` se mantiene, su contenido pasa a `<EmptyState message=…/>`).
- Errores: se mantiene el error boundary del dashboard (no se crea `ErrorState`).

## Tests / validación
- UI: `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores (sin imports sin usar tras A3) ·
  `npm test` (los existentes siguen verdes) · `npm run build` (las 3 rutas borradas desaparecen
  de la salida; `/subscriptions` sigue).

## Fuera de alcance
- `<ReportToolbar>` monolítico (se prefieren piezas pequeñas).
- Resto del roadmap (Fase 2+): periodo global, drill-down, Excel, etc.
- Contexto de periodo global, comparador, cmd-k.
