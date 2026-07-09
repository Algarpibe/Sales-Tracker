# Contexto de periodo global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compartir `tipo` (OV/FAC) entre todas las vistas y un "año foco" entre las de 1 año, con persistencia en localStorage.

**Architecture:** `PeriodProvider` (context) en el layout; cada selector se enlaza al contexto (aliasando al desestructurar → JSX intacto). Helper puro para parsear el estado guardado.

**Tech Stack:** Next 16, React context, localStorage, vitest.

---

### Task 1: Helper period.ts + test + PeriodProvider

**Files:** Create `src/lib/period.ts`, `src/lib/__tests__/period.test.ts`, `src/components/providers/period-provider.tsx`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/period.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseStoredPeriod, type Period } from "@/lib/period";

const fb: Period = { tipo: "INVOICE", year: 2026 };

describe("parseStoredPeriod", () => {
  it("JSON válido → valores", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }), fb)).toEqual({ tipo: "SALES_ORDER", year: 2024 });
  });
  it("tipo inválido → fallback.tipo", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "X", year: 2024 }), fb)).toEqual({ tipo: "INVOICE", year: 2024 });
  });
  it("year no numérico → fallback.year", () => {
    expect(parseStoredPeriod(JSON.stringify({ tipo: "SALES_ORDER", year: "x" }), fb)).toEqual({ tipo: "SALES_ORDER", year: 2026 });
  });
  it("null → fallback", () => {
    expect(parseStoredPeriod(null, fb)).toEqual(fb);
  });
  it("JSON corrupto → fallback sin lanzar", () => {
    expect(parseStoredPeriod("{not json", fb)).toEqual(fb);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/period.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/period.ts`:
```ts
export type Tipo = "SALES_ORDER" | "INVOICE";
export interface Period { tipo: Tipo; year: number }

export function parseStoredPeriod(raw: string | null, fallback: Period): Period {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as { tipo?: unknown; year?: unknown };
    const tipo: Tipo = p.tipo === "SALES_ORDER" || p.tipo === "INVOICE" ? p.tipo : fallback.tipo;
    const year = typeof p.year === "number" && Number.isFinite(p.year) ? p.year : fallback.year;
    return { tipo, year };
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4:** vitest PASS.

- [ ] **Step 5: PeriodProvider** — crear `src/components/providers/period-provider.tsx`:
```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { parseStoredPeriod, type Tipo } from "@/lib/period";

const KEY = "salestracker.period";

interface PeriodCtx {
  tipo: Tipo;
  setTipo: (t: Tipo) => void;
  year: number;
  setYear: (y: number) => void;
}

const Ctx = createContext<PeriodCtx | null>(null);

export function usePeriod(): PeriodCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePeriod debe usarse dentro de <PeriodProvider>");
  return c;
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [tipo, setTipo] = useState<Tipo>("INVOICE");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = parseStoredPeriod(localStorage.getItem(KEY), { tipo: "INVOICE", year: new Date().getFullYear() });
    setTipo(p.tipo);
    setYear(p.year);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ tipo, year }));
    } catch {}
  }, [tipo, year, hydrated]);

  return <Ctx.Provider value={{ tipo, setTipo, year, setYear }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 6:** `npx tsc --noEmit` + `npm run lint` (sin nuevos warnings).
- [ ] **Step 7:** Commit:
```bash
git add src/lib/period.ts src/lib/__tests__/period.test.ts src/components/providers/period-provider.tsx
git commit -m "feat(periodo): helper parseStoredPeriod + PeriodProvider + test"
```

---

### Task 2: Montar PeriodProvider en el layout

**Files:** Modify `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1:** Añade `import { PeriodProvider } from "@/components/providers/period-provider";`.
- [ ] **Step 2:** Envolver el bloque que hoy está dentro de `<CommandProvider>` — poner `<PeriodProvider>` por fuera de `<CommandProvider>`:
  actual:
  ```tsx
        <CommandProvider>
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </CommandProvider>
  ```
  nuevo:
  ```tsx
        <PeriodProvider>
          <CommandProvider>
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
            </div>
          </CommandProvider>
        </PeriodProvider>
  ```
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/layout.tsx"
git commit -m "feat(periodo): montar PeriodProvider en el layout del dashboard"
```

---

### Task 3: Enlazar las 6 páginas al contexto

**Files:** Modify `tablas/page.tsx`, `cliente-articulo/page.tsx`, `clientes/[customer]/page.tsx`, `analytics/page.tsx`, `articulos/page.tsx`, `clientes/page.tsx`

En cada página: añade `import { usePeriod } from "@/components/providers/period-provider";` y sustituye la(s) línea(s) de estado local por la desestructuración aliaseada (el resto del JSX no cambia porque los nombres de variable se conservan). Tras cada edición, si `RecordType` o `useState` quedan sin uso, quítalos del import (lo confirma `npm run lint`). Los `value={tipo as "SALES_ORDER" | "INVOICE"}` existentes quedan redundantes pero válidos.

- [ ] **Step 1: tablas/page.tsx** — sustituye:
```tsx
  const [year, setYear] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState<RecordType>("SALES_ORDER");
```
por:
```tsx
  const { tipo: typeFilter, setTipo: setTypeFilter, year, setYear } = usePeriod();
```

- [ ] **Step 2: cliente-articulo/page.tsx** — sustituye:
```tsx
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [anio, setAnio] = useState(thisYear);
```
por:
```tsx
  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
```

- [ ] **Step 3: clientes/[customer]/page.tsx** — sustituye:
```tsx
  const [tipo, setTipo] = useState<"SALES_ORDER" | "INVOICE">("INVOICE");
  const [anio, setAnio] = useState(thisYear);
```
por:
```tsx
  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
```

- [ ] **Step 4: analytics/page.tsx** — sustituye:
```tsx
  const [yearA, setYearA] = useState(new Date().getFullYear());
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
  const [recordType, setRecordType] = useState<"SALES_ORDER" | "INVOICE">("SALES_ORDER");
```
por:
```tsx
  const { tipo: recordType, setTipo: setRecordType, year: yearA, setYear: setYearA } = usePeriod();
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
```

- [ ] **Step 5: articulos/page.tsx** — sustituye SOLO la línea de tipo:
```tsx
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
```
por:
```tsx
  const { tipo, setTipo } = usePeriod();
```
(mantener `desde`/`hasta` locales.)

- [ ] **Step 6: clientes/page.tsx** — sustituye SOLO la línea de tipo:
```tsx
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
```
por:
```tsx
  const { tipo, setTipo } = usePeriod();
```
(mantener `desdeAnio`/`hastaAnio` locales.)

- [ ] **Step 7:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores; sin nuevos warnings — quita imports que hayan quedado sin uso). Verifica que no quedó ningún `useState<RecordType>` de tipo en esas 6 páginas: `grep -rn "useState<RecordType>\|useState<\"SALES_ORDER" "src/app/(dashboard)"` debe devolver, como mucho, `yearB` no (yearB usa `useState(number)` sin tipo genérico) — en concreto no debe quedar ningún tipo/año que debiera ser compartido.
- [ ] **Step 8:** Commit:
```bash
git add "src/app/(dashboard)/tablas/page.tsx" "src/app/(dashboard)/cliente-articulo/page.tsx" "src/app/(dashboard)/clientes/[customer]/page.tsx" "src/app/(dashboard)/analytics/page.tsx" "src/app/(dashboard)/articulos/page.tsx" "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(periodo): enlazar tipo/año de las 6 vistas al PeriodProvider"
```

---

### Task 4: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Aliasing al desestructurar (`tipo: typeFilter`, `year: anio`, etc.) → el JSX que usa esas variables no cambia; solo cambia la línea de declaración.
- Default global FAC → Tablas y Análisis abrirán en FAC (antes OV): unificación acordada.
- `yearB` de Análisis y los rangos de Artículos/Clientes siguen locales.
- Persistencia: `localStorage["salestracker.period"]`; carga tras montar (hidratación-segura) con breve flash del default.
- Deploy en EasyPanel; validar: cambiar OV/FAC + año en una vista → persiste al navegar a otra y al recargar (F5).
