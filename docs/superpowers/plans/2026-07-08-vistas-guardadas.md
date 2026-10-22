# Vistas guardadas (Sub-lote B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presets de la vista Clientes (guardar/restaurar/borrar el estado de filtros/periodo), BD por usuario, tabla genérica.

**Architecture:** Tabla `saved_views` (jsonb) + migración manual + actions get/save/delete + helper de validación + menú en Clientes.

**Tech Stack:** Next 16, Drizzle/Postgres, @tanstack/react-query, vitest.

---

### Task 1: Esquema + migración + actions

**Files:** Modify `src/db/schema.ts`; Create `drizzle/0006_saved_views.sql`, `src/actions/saved-views-actions.ts`

- [ ] **Step 1: Esquema** — en `src/db/schema.ts`: añade `jsonb` al import de `drizzle-orm/pg-core` (junto a `text`, `uuid`, etc.). Al final del archivo añade:
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

- [ ] **Step 2: Migración** — crear `drizzle/0006_saved_views.sql`:
```sql
-- Vistas guardadas (presets) por usuario y vista. Aditivo, no destructivo.
-- Aplicar en la BD del app tras el deploy:
--   psql "$DATABASE_URL" -f drizzle/0006_saved_views.sql
CREATE TABLE IF NOT EXISTS "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"view_key" text NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_user_key_name_unique" UNIQUE("user_id","view_key","name")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- [ ] **Step 3: Actions** — crear `src/actions/saved-views-actions.ts`:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";

export interface SavedViewDTO {
  id: string;
  name: string;
  state: unknown;
}

// Degrada con gracia (→ []) si la tabla aún no existe.
export async function getSavedViews(viewKey: string): Promise<SavedViewDTO[]> {
  const { profile } = await requireApproved();
  try {
    const rows = await db
      .select({ id: savedViews.id, name: savedViews.name, state: savedViews.state })
      .from(savedViews)
      .where(and(eq(savedViews.user_id, profile.id), eq(savedViews.view_key, viewKey)))
      .orderBy(savedViews.name);
    return rows.map((r) => ({ id: r.id, name: r.name, state: r.state }));
  } catch {
    return [];
  }
}

export async function saveView(viewKey: string, name: string, state: unknown): Promise<void> {
  const { profile } = await requireApproved();
  const trimmed = name.trim();
  if (!trimmed) return;
  await db
    .insert(savedViews)
    .values({ user_id: profile.id, view_key: viewKey, name: trimmed, state })
    .onConflictDoUpdate({
      target: [savedViews.user_id, savedViews.view_key, savedViews.name],
      set: { state },
    });
}

export async function deleteSavedView(id: string): Promise<void> {
  const { profile } = await requireApproved();
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.user_id, profile.id)));
}
```
READ `src/actions/favorites-actions.ts` para confirmar el estilo (`db` de `@/db`, `requireApproved`).

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings). No se ejecuta la BD.
- [ ] **Step 5:** Commit:
```bash
git add src/db/schema.ts drizzle/0006_saved_views.sql src/actions/saved-views-actions.ts
git commit -m "feat(vistas): tabla saved_views + migración + actions get/save/delete"
```

---

### Task 2: Helper clientes-view-state + test (TDD)

**Files:** Create `src/lib/clientes-view-state.ts`, `src/lib/__tests__/clientes-view-state.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/clientes-view-state.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseClientesState } from "@/lib/clientes-view-state";

const valid = {
  tipo: "INVOICE" as const, desdeAnio: 2021, hastaAnio: 2026, search: "acme",
  sortKey: "total" as const, sortDir: "desc" as const, compareA: 2026, compareB: 2025, onlyFav: true,
};

describe("parseClientesState", () => {
  it("estado válido → objeto", () => { expect(parseClientesState(valid)).toEqual(valid); });
  it("sortKey numérico (año) válido", () => { expect(parseClientesState({ ...valid, sortKey: 2024 })?.sortKey).toBe(2024); });
  it("tipo inválido → null", () => { expect(parseClientesState({ ...valid, tipo: "X" })).toBeNull(); });
  it("falta un campo → null", () => {
    const { onlyFav: _omit, ...rest } = valid;
    expect(parseClientesState(rest)).toBeNull();
  });
  it("null / no-objeto → null", () => {
    expect(parseClientesState(null)).toBeNull();
    expect(parseClientesState("x")).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/clientes-view-state.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/clientes-view-state.ts`:
```ts
import type { CustomerSortKey, CustomerSortDir } from "@/lib/customer-sales";

export interface ClientesViewState {
  tipo: "SALES_ORDER" | "INVOICE";
  desdeAnio: number;
  hastaAnio: number;
  search: string;
  sortKey: CustomerSortKey;
  sortDir: CustomerSortDir;
  compareA: number;
  compareB: number;
  onlyFav: boolean;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function parseClientesState(raw: unknown): ClientesViewState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const okTipo = s.tipo === "SALES_ORDER" || s.tipo === "INVOICE";
  const okSortKey = s.sortKey === "customer" || s.sortKey === "total" || s.sortKey === "delta" || isNum(s.sortKey);
  const okDir = s.sortDir === "asc" || s.sortDir === "desc";
  if (
    !okTipo || !isNum(s.desdeAnio) || !isNum(s.hastaAnio) || typeof s.search !== "string" ||
    !okSortKey || !okDir || !isNum(s.compareA) || !isNum(s.compareB) || typeof s.onlyFav !== "boolean"
  ) {
    return null;
  }
  return {
    tipo: s.tipo as "SALES_ORDER" | "INVOICE",
    desdeAnio: s.desdeAnio as number,
    hastaAnio: s.hastaAnio as number,
    search: s.search as string,
    sortKey: s.sortKey as CustomerSortKey,
    sortDir: s.sortDir as CustomerSortDir,
    compareA: s.compareA as number,
    compareB: s.compareB as number,
    onlyFav: s.onlyFav as boolean,
  };
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/clientes-view-state.ts src/lib/__tests__/clientes-view-state.test.ts
git commit -m "feat(vistas): parseClientesState + test"
```

---

### Task 3: Componente SavedViewsMenu

**Files:** Create `src/components/clientes/saved-views-menu.tsx`

- [ ] **Step 1: Implementar** (READ `src/components/common/export-menu.tsx` para el patrón `DropdownMenuTrigger render={...}`):
```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSavedViews, saveView, deleteSavedView } from "@/actions/saved-views-actions";
import { parseClientesState, type ClientesViewState } from "@/lib/clientes-view-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Bookmark, ChevronDown, Save, X } from "lucide-react";
import { toast } from "sonner";

const VIEW_KEY = "clientes";

export function SavedViewsMenu({ current, onApply }: { current: ClientesViewState; onApply: (s: ClientesViewState) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved-views", VIEW_KEY], queryFn: () => getSavedViews(VIEW_KEY) });
  const views = q.data ?? [];

  const saveMut = useMutation({
    mutationFn: (name: string) => saveView(VIEW_KEY, name, current),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saved-views", VIEW_KEY] }); toast.success("Vista guardada"); },
    onError: () => toast.error("No se pudo guardar la vista"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-views", VIEW_KEY] }),
    onError: () => toast.error("No se pudo borrar la vista"),
  });

  const onSave = () => {
    const name = window.prompt("Nombre de la vista");
    if (name && name.trim()) saveMut.mutate(name.trim());
  };
  const onLoad = (state: unknown) => {
    const s = parseClientesState(state);
    if (s) onApply(s);
    else toast.error("Vista no válida");
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onSave}>
        <Save className="mr-2 h-4 w-4" /> Guardar vista
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => (
            <Button variant="outline" size="sm" {...props}>
              <Bookmark className="mr-2 h-4 w-4" /> Vistas <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          )}
        />
        <DropdownMenuContent align="end">
          {views.length === 0 ? (
            <DropdownMenuItem disabled>Sin vistas guardadas</DropdownMenuItem>
          ) : (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onLoad(v.state)} className="flex items-center justify-between gap-4">
                <span>{v.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Borrar vista"
                  onClick={(e) => { e.stopPropagation(); delMut.mutate(v.id); }}
                  className="text-muted-foreground hover:text-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```
Nota: si base-ui cierra el menú al pulsar la ✕ antes de que actúe el `stopPropagation`, verifica en `tsc`/lint que compila; el borrado igualmente dispara `delMut`. Si el `onClick` del ítem (cargar) se dispara al borrar, mueve la ✕ fuera del `DropdownMenuItem` o usa `onMouseDown` con `preventDefault`.

- [ ] **Step 2:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/clientes/saved-views-menu.tsx
git commit -m "feat(vistas): SavedViewsMenu (guardar / cargar / borrar presets)"
```

---

### Task 4: Integrar en `/clientes`

**Files:** Modify `src/app/(dashboard)/clientes/page.tsx`

READ el archivo. Estado relevante: `tipo` (usePeriod, con `setTipo`), `desdeAnio/setDesdeAnio`, `hastaAnio/setHastaAnio`, `search/setSearch`, `sortKey/setSortKey`, `sortDir/setSortDir`, `compareA/setCompareA`, `compareB/setCompareB`, `onlyFav/setOnlyFav`. Los controles cliente (~línea 188) tienen SearchInput + ExportMenu + Switch "Solo favoritos".

- [ ] **Step 1: Imports** — añade:
```tsx
import { SavedViewsMenu } from "@/components/clientes/saved-views-menu";
import type { ClientesViewState } from "@/lib/clientes-view-state";
```

- [ ] **Step 2: currentView + applyView** — tras el bloque de estado/favoritos (después de `favMut`), añade:
```tsx
  const currentView: ClientesViewState = useMemo(
    () => ({ tipo, desdeAnio, hastaAnio, search, sortKey, sortDir, compareA, compareB, onlyFav }),
    [tipo, desdeAnio, hastaAnio, search, sortKey, sortDir, compareA, compareB, onlyFav]
  );
  const applyView = (s: ClientesViewState) => {
    setTipo(s.tipo);
    setDesdeAnio(s.desdeAnio);
    setHastaAnio(s.hastaAnio);
    setSearch(s.search);
    setSortKey(s.sortKey);
    setSortDir(s.sortDir);
    setCompareA(s.compareA);
    setCompareB(s.compareB);
    setOnlyFav(s.onlyFav);
  };
```
(`useMemo` ya está importado en el archivo.)

- [ ] **Step 3: Render del menú** — dentro del `div` de "Controles cliente", tras el `<label>` del Switch "Solo favoritos", añade:
```tsx
        <SavedViewsMenu current={currentView} onApply={applyView} />
```

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores, sin nuevos warnings).
- [ ] **Step 5:** Commit:
```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(vistas): integrar SavedViewsMenu en Clientes (guardar/restaurar estado)"
```

---

### Task 5: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `getSavedViews` degrada a `[]` si la tabla no existe → Clientes no se rompe pre-migración.
- Aislamiento por usuario en las 3 actions. `saveView` sobreescribe si el nombre ya existe (`onConflictDoUpdate`).
- **Rollout (operador):** tras deploy, `psql "$DATABASE_URL" -f drizzle/0006_saved_views.sql`.
- Deploy en EasyPanel; validar: Guardar vista (nombre) → aparece en "Vistas"; cargarla restaura filtros/periodo/orden; ✕ la borra.
