# Favoritos de clientes (Sub-lote A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Favoritos de clientes por usuario (BD): estrella en la vista Clientes + filtro "Solo favoritos".

**Architecture:** Tabla `favorites` (Drizzle) + migración SQL manual + actions `getFavorites`/`toggleFavorite` + UI en Clientes con react-query.

**Tech Stack:** Next 16, Drizzle/Postgres, @tanstack/react-query, vitest.

---

### Task 1: Esquema + migración + actions

**Files:** Modify `src/db/schema.ts`; Create `drizzle/0005_favorites.sql`, `src/actions/favorites-actions.ts`

- [ ] **Step 1: Esquema** — en `src/db/schema.ts`, al final (tras la última tabla), añade (usa `user`, `uuid`, `text`, `timestamp`, `unique`, `tsString` ya importados/definidos en el archivo):
```ts
export const favorites = pgTable("favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  customer_name: text("customer_name").notNull(),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
}, (t) => [unique("favorites_user_customer_unique").on(t.user_id, t.customer_name)]);
```

- [ ] **Step 2: Migración** — crear `drizzle/0005_favorites.sql`:
```sql
-- Favoritos de clientes por usuario (estrella en la vista Clientes).
-- Cambio aditivo, no destructivo. Aplicar en la BD del app tras el deploy:
--   psql "$DATABASE_URL" -f drizzle/0005_favorites.sql
CREATE TABLE IF NOT EXISTS "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_customer_unique" UNIQUE("user_id","customer_name")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- [ ] **Step 3: Actions** — crear `src/actions/favorites-actions.ts`:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";

// Devuelve los nombres de cliente favoritos del usuario. Degrada con gracia
// (→ []) si la tabla aún no existe (migración no aplicada) para no romper Clientes.
export async function getFavorites(): Promise<string[]> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ name: favorites.customer_name })
      .from(favorites)
      .where(eq(favorites.user_id, profile.id));
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

export async function toggleFavorite(customer: string): Promise<void> {
  const { profile } = await requireApproved();
  const cond = and(eq(favorites.user_id, profile.id), eq(favorites.customer_name, customer));
  const existing = await db.select({ id: favorites.id }).from(favorites).where(cond).limit(1);
  if (existing.length > 0) {
    await db.delete(favorites).where(cond);
  } else {
    await db.insert(favorites).values({ user_id: profile.id, customer_name: customer });
  }
}
```
READ `src/actions/category-actions.ts` para confirmar el import de `db` (`@/db`) y `requireApproved` (`@/lib/auth/guards`).

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings). (No se ejecuta la BD; tsc/lint es el gate.)
- [ ] **Step 5:** Commit:
```bash
git add src/db/schema.ts drizzle/0005_favorites.sql src/actions/favorites-actions.ts
git commit -m "feat(favoritos): tabla favorites + migración + actions get/toggle"
```

---

### Task 2: Componente FavoriteStar

**Files:** Create `src/components/common/favorite-star.tsx`

- [ ] **Step 1: Implementar**
```tsx
"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function FavoriteStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={active ? "Quitar de favoritos" : "Marcar como favorito"}
      className="inline-flex shrink-0 text-muted-foreground/40 hover:text-amber-400 transition-colors"
    >
      <Star className={cn("h-4 w-4", active && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/common/favorite-star.tsx
git commit -m "feat(favoritos): componente FavoriteStar"
```

---

### Task 3: Estrella + filtro en `/clientes`

**Files:** Modify `src/app/(dashboard)/clientes/page.tsx`

READ el archivo. Referencias: `import { useQuery }` de react-query; estado `search`/`sortDir`/`compareA`/`compareB` (~85-89); `visible` (~107) `= filterCustomers(matrix, search)`; "Controles cliente" con `SearchInput` + `ExportMenu` (~175-176); la celda del nombre (~216-218). `toast` (sonner) ya importado.

- [ ] **Step 1: Imports** — añade a la línea de react-query `useMutation, useQueryClient` (`import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";`); y:
```tsx
import { getFavorites, toggleFavorite } from "@/actions/favorites-actions";
import { FavoriteStar } from "@/components/common/favorite-star";
import { Switch } from "@/components/ui/switch";
```

- [ ] **Step 2: Estado + queries** — tras `const [compareB, setCompareB] = useState(thisYear - 1);` añade:
```tsx
  const [onlyFav, setOnlyFav] = useState(false);
  const qc = useQueryClient();
  const favQ = useQuery({ queryKey: ["favorites"], queryFn: getFavorites });
  const favSet = useMemo(() => new Set(favQ.data ?? []), [favQ.data]);
  const favMut = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
    onError: () => toast.error("No se pudo guardar el favorito"),
  });
```

- [ ] **Step 3: Filtro onlyFav** — reemplaza la línea de `visible`:
```tsx
  const visible = useMemo(() => filterCustomers(matrix, search), [matrix, search]);
```
por:
```tsx
  const visible = useMemo(() => {
    const base = filterCustomers(matrix, search);
    return onlyFav ? base.filter((r) => favSet.has(r.customer)) : base;
  }, [matrix, search, onlyFav, favSet]);
```

- [ ] **Step 4: Control "Solo favoritos"** — en "Controles cliente", tras `<ExportMenu ... />` añade:
```tsx
        <label className="flex items-center gap-2 self-center text-sm">
          <Switch checked={onlyFav} onCheckedChange={setOnlyFav} /> Solo favoritos
        </label>
```

- [ ] **Step 5: Estrella en la celda del nombre** — reemplaza:
```tsx
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <Link href={`/clientes/${encodeURIComponent(r.customer)}`} className="hover:text-primary hover:underline">{r.customer}</Link>
                      </TableCell>
```
por:
```tsx
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <span className="inline-flex items-center gap-2">
                          <FavoriteStar active={favSet.has(r.customer)} onToggle={() => favMut.mutate(r.customer)} />
                          <Link href={`/clientes/${encodeURIComponent(r.customer)}`} className="hover:text-primary hover:underline">{r.customer}</Link>
                        </span>
                      </TableCell>
```

- [ ] **Step 6:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores, sin nuevos warnings).
- [ ] **Step 7:** Commit:
```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(favoritos): estrella + filtro 'Solo favoritos' en Clientes"
```

---

### Task 4: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `getFavorites` degrada a `[]` si la tabla no existe → **Clientes no se rompe** aunque el deploy vaya antes de la migración.
- La mutación usa `onError` (no throwOnError global, que es solo para queries) → toast si falla.
- **Rollout (operador):** tras deploy, aplicar `drizzle/0005_favorites.sql` a la BD del app (no el hub): `psql "$DATABASE_URL" -f drizzle/0005_favorites.sql`.
- Deploy en EasyPanel; validar: estrella marca/desmarca (persiste al recargar), filtro "Solo favoritos".
