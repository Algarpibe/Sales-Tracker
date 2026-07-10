# Favoritos de clientes (Vistas guardadas / favoritos — Sub-lote A) — Diseño

**Contexto:** Primer sub-lote de "vistas guardadas / favoritos" (ambos, BD por usuario, en 2 sub-lotes). Este: **favoritos de clientes** con estrella + filtro.

**Goal:** Marcar clientes como favoritos (por usuario, en BD) desde la vista Clientes, y filtrar "Solo favoritos".

**Arquitectura:** Tabla nueva `favorites` (BD del app, Drizzle); actions `getFavorites`/`toggleFavorite`; UI en Clientes (estrella + filtro) con react-query. **El deploy NO migra solo** → la migración es un paso manual del operador.

**Tech:** Next 16, Drizzle/Postgres, react-query, vitest.

---

## Esquema — `src/db/schema.ts` (añadir)
```ts
export const favorites = pgTable("favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  customer_name: text("customer_name").notNull(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
}, (t) => [unique("favorites_user_customer_unique").on(t.user_id, t.customer_name)]);
```

## Migración — `drizzle/0005_favorites.sql`
`CREATE TABLE IF NOT EXISTS "favorites" (...)` con FK a `"user"("id")` ON DELETE CASCADE y UNIQUE(user_id, customer_name). Idempotente. Comentario de cabecera (aditivo, aplicar en prod tras deploy) al estilo de las migraciones existentes.

## Actions — `src/actions/favorites-actions.ts`
```ts
"use server";
export async function getFavorites(): Promise<string[]>;   // nombres del usuario; try/catch → [] si falla (tabla ausente)
export async function toggleFavorite(customer: string): Promise<void>; // requireApproved; delete-or-insert por (user_id, customer)
```
- `getFavorites`: `requireApproved()`, `select customer_name where user_id = profile.id`. **Envuelto en try/catch → `[]`** para degradar con gracia si la migración aún no está aplicada (Clientes no debe romperse).
- `toggleFavorite`: `requireApproved()`; si existe (user_id, customer) → delete; si no → insert. Lanza en error (lo maneja la mutación en cliente con toast).

## Componente — `src/components/common/favorite-star.tsx`
`FavoriteStar({ active, onToggle })`: botón con icono `Star` (lucide); lleno ámbar si `active`, contorno si no. Presentacional (la página gestiona estado + mutación).

## Vista Clientes — `clientes/page.tsx`
- `useQuery(["favorites"], getFavorites)` → `favSet = new Set(data)`.
- `useMutation(toggleFavorite)` → `onSuccess` invalida `["favorites"]`; `onError` → `toast.error("No se pudo guardar el favorito")`.
- Estado `onlyFav` (Switch "Solo favoritos"). `visible` = `filterCustomers(matrix, search)` y, si `onlyFav`, además `.filter(r => favSet.has(r.customer))`.
- En la celda del nombre: `<FavoriteStar active={favSet.has(r.customer)} onToggle={() => mut.mutate(r.customer)} />` junto al `<Link>`.
- Control "Solo favoritos" en la barra de controles cliente.

## Testing
Mayormente BD/UI (sin lógica pura relevante). Si el filtro "solo favoritos" se extrae a helper puro, se testea; si no, se valida en build + uso real. tsc/lint como gate.

## Rollout (operador)
Tras desplegar, aplicar `drizzle/0005_favorites.sql` a la **BD del app** (no el hub):
`psql "$DATABASE_URL" -f drizzle/0005_favorites.sql` (o pegar el SQL). Hasta aplicarla, la estrella no persiste y `getFavorites` devuelve `[]` (Clientes sigue funcionando).

## Fuera de alcance
Vistas guardadas / presets (sub-lote B); estrella en el detalle del cliente; favoritos de artículos.
