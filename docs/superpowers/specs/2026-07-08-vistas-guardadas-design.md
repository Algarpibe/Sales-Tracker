# Vistas guardadas (Sub-lote B) — Diseño

**Contexto:** Segundo sub-lote de "vistas guardadas / favoritos". Presets del estado de filtros/periodo, BD por usuario, tabla genérica, **v1 acotado a la vista Clientes**.

**Goal:** Guardar el estado de la vista Clientes con un nombre y restaurarlo; borrar presets.

**Arquitectura:** Tabla genérica `saved_views` (por `view_key`); actions get/save/delete; helper puro para validar el estado; menú en Clientes. **El deploy no migra solo** → migración manual.

**Tech:** Next 16, Drizzle/Postgres (jsonb), react-query, vitest.

---

## Esquema — `src/db/schema.ts` (añadir)
Añadir `jsonb` al import de `drizzle-orm/pg-core`. Tabla:
```ts
export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  view_key: text("view_key").notNull(),
  name: text("name").notNull(),
  state: jsonb("state").notNull(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
}, (t) => [unique("saved_views_user_key_name_unique").on(t.user_id, t.view_key, t.name)]);
```

## Migración — `drizzle/0006_saved_views.sql`
`CREATE TABLE IF NOT EXISTS "saved_views"` (id uuid, user_id uuid + FK a user, view_key text, name text, state jsonb, created_at timestamptz) + UNIQUE(user_id, view_key, name). Idempotente, mismo estilo que 0005.

## Actions — `src/actions/saved-views-actions.ts`
```ts
"use server";
export interface SavedViewDTO { id: string; name: string; state: unknown }
export async function getSavedViews(viewKey: string): Promise<SavedViewDTO[]>; // por usuario+viewKey; try/catch → []
export async function saveView(viewKey: string, name: string, state: unknown): Promise<void>; // upsert por (user,viewKey,name)
export async function deleteSavedView(id: string): Promise<void>; // scoped por user_id
```
- Todo `requireApproved`; aislamiento por `profile.id`. `getSavedViews` degrada a `[]` si la tabla no existe. `saveView` usa `onConflictDoUpdate` (guardar con nombre existente sobreescribe). `deleteSavedView` filtra por `user_id` (no borra ajenas).

## Helper — `src/lib/clientes-view-state.ts`
```ts
export interface ClientesViewState { tipo; desdeAnio; hastaAnio; search; sortKey; sortDir; compareA; compareB; onlyFav }
export function parseClientesState(raw: unknown): ClientesViewState | null;
```
- Valida todos los campos (tipo enum; años/compare numéricos; sortKey = "customer"|"total"|"delta"|number; sortDir enum; search string; onlyFav bool). Cualquier campo inválido/faltante → `null` (preset viejo/corrupto se ignora).

## Componente — `src/components/clientes/saved-views-menu.tsx`
`SavedViewsMenu({ current: ClientesViewState, onApply: (s) => void })`:
- Botón **"Guardar vista"** → `window.prompt` nombre → `saveView("clientes", name, current)` (react-query mutation + invalidación + toast).
- Menú **"Vistas ▾"** con los presets (`getSavedViews("clientes")`): clic en un preset → `onApply(parseClientesState(state))` (si válido); una **✕** por preset → `deleteSavedView(id)` (con `stopPropagation` para no cargar al borrar).
- Estados: "Sin vistas guardadas" si vacío.

## Vista Clientes — `clientes/page.tsx`
- `currentView: ClientesViewState` = objeto con el estado actual (tipo, desdeAnio, hastaAnio, search, sortKey, sortDir, compareA, compareB, onlyFav).
- `applyView(s)`: `setTipo(s.tipo)` (usePeriod) + los setters locales.
- Renderizar `<SavedViewsMenu current={currentView} onApply={applyView} />` en los controles.

## Tests — `src/lib/__tests__/clientes-view-state.test.ts`
`parseClientesState`: válido → objeto; `sortKey` numérico (año) válido; tipo inválido → null; falta un campo → null; null/no-objeto → null.

## Rollout (operador)
Tras deploy: `psql "$DATABASE_URL" -f drizzle/0006_saved_views.sql` (BD del app). Idempotente. Hasta aplicarla, "Vistas" muestra vacío y guardar dará error-toast (Clientes no se rompe: `getSavedViews` → []).

## Fuera de alcance
Presets en otras vistas (la tabla ya es genérica); compartir entre usuarios; diálogo de guardado (v1 usa `window.prompt`).
