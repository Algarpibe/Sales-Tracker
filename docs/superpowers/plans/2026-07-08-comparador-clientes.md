# Comparador de periodos — Sub-lote 1: Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor de comparación compartido (`computeDelta`/`formatDeltaPct`) + su aplicación en `/clientes`: selectores A/B y columna Δ % ordenable y coloreada.

**Architecture:** Helper puro reutilizable; en Clientes, todo client-side sobre `buildCustomerMatrix` (sin SQL nuevo).

**Tech Stack:** Next 16, React, vitest.

---

### Task 1: Motor compartido `compare.ts` + test (TDD)

**Files:** Create `src/lib/compare.ts`, `src/lib/__tests__/compare.test.ts`

- [ ] **Step 1: Test (falla)** — crear `src/lib/__tests__/compare.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeDelta, formatDeltaPct } from "@/lib/compare";

describe("computeDelta", () => {
  it("a>b → positivo", () => { expect(computeDelta(120, 100)).toEqual({ delta: 20, deltaPct: 0.2 }); });
  it("b=0 → deltaPct null", () => { expect(computeDelta(50, 0)).toEqual({ delta: 50, deltaPct: null }); });
  it("a=b → 0", () => { expect(computeDelta(100, 100)).toEqual({ delta: 0, deltaPct: 0 }); });
});

describe("formatDeltaPct", () => {
  it("positivo", () => { expect(formatDeltaPct(0.2)).toBe("+20.0%"); });
  it("negativo", () => { expect(formatDeltaPct(-0.08)).toBe("−8.0%"); });
  it("cero", () => { expect(formatDeltaPct(0)).toBe("0.0%"); });
  it("null → guion", () => { expect(formatDeltaPct(null)).toBe("—"); });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/compare.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — crear `src/lib/compare.ts`:
```ts
export interface Delta {
  delta: number;
  deltaPct: number | null;
}

export function computeDelta(a: number, b: number): Delta {
  return { delta: a - b, deltaPct: b !== 0 ? (a - b) / b : null };
}

export function formatDeltaPct(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct * 100).toFixed(1)}%`;
}
```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/compare.ts src/lib/__tests__/compare.test.ts
git commit -m "feat(comparar): motor computeDelta / formatDeltaPct + test"
```

---

### Task 2: Extender `sortCustomerMatrix` con "delta" + test

**Files:** Modify `src/lib/customer-sales.ts`, `src/lib/__tests__/customer-sales.test.ts`

- [ ] **Step 1: Test (falla)** — en `src/lib/__tests__/customer-sales.test.ts`, añade:
```ts
describe("sortCustomerMatrix delta", () => {
  it("ordena por delta A vs B; null (B=0) al final en desc", () => {
    const matrix = [
      { customer: "A", byYear: { 2025: 100, 2024: 50 }, total: 150 },  // +100%
      { customer: "B", byYear: { 2025: 100, 2024: 200 }, total: 300 }, // -50%
      { customer: "C", byYear: { 2025: 100, 2024: 0 }, total: 100 },   // null
    ];
    const s = sortCustomerMatrix(matrix, "delta", "desc", { a: 2025, b: 2024 });
    expect(s.map((r) => r.customer)).toEqual(["A", "B", "C"]);
  });
});
```
(Asegura que `sortCustomerMatrix` está en el import del test.)

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-sales.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/customer-sales.ts`:
  - Añade `import { computeDelta } from "@/lib/compare";` arriba.
  - Cambia el tipo:
    ```ts
    export type CustomerSortKey = "customer" | "total" | "delta" | number; // number = año
    ```
  - Reemplaza `sortCustomerMatrix` por:
    ```ts
    export function sortCustomerMatrix(
      matrix: CustomerMatrixRow[],
      sortKey: CustomerSortKey,
      sortDir: CustomerSortDir,
      compare?: { a: number; b: number }
    ): CustomerMatrixRow[] {
      const dir = sortDir === "asc" ? 1 : -1;
      const val = (r: CustomerMatrixRow): string | number => {
        if (sortKey === "customer") return r.customer.toLowerCase();
        if (sortKey === "total") return r.total;
        if (sortKey === "delta") {
          if (!compare) return 0;
          const p = computeDelta(r.byYear[compare.a] ?? 0, r.byYear[compare.b] ?? 0).deltaPct;
          return p ?? -Infinity; // null (B=0) al fondo en desc
        }
        return r.byYear[sortKey] ?? 0;
      };
      return [...matrix].sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    ```

- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/customer-sales.ts src/lib/__tests__/customer-sales.test.ts
git commit -m "feat(comparar): sortCustomerMatrix admite orden por delta A/B"
```

---

### Task 3: Comparador en `/clientes`

**Files:** Modify `src/app/(dashboard)/clientes/page.tsx`

- [ ] **Step 1: Imports** — añade:
```tsx
import { computeDelta, formatDeltaPct } from "@/lib/compare";
```

- [ ] **Step 2: DeltaCell (módulo-level)** — tras el componente `SortHeader` (antes de `export default function ClientesPage`), añade:
```tsx
// Celda de variación coloreada (módulo-level por react-hooks/static-components).
function DeltaCell({ a, b }: { a: number; b: number }) {
  const p = computeDelta(a, b).deltaPct;
  const cls = p === null || p === 0 ? "text-muted-foreground" : p > 0 ? "text-emerald-500" : "text-rose-500";
  return <span className={cls}>{formatDeltaPct(p)}</span>;
}
```

- [ ] **Step 3: Estado** — tras `const [sortDir, setSortDir] = useState<CustomerSortDir>("desc");` añade:
```tsx
  const [compareA, setCompareA] = useState(thisYear);
  const [compareB, setCompareB] = useState(thisYear - 1);
```

- [ ] **Step 4: sorted con compare** — reemplaza la línea de `sorted`:
```tsx
  const sorted = useMemo(() => sortCustomerMatrix(visible, sortKey, sortDir), [visible, sortKey, sortDir]);
```
por:
```tsx
  const sorted = useMemo(
    () => sortCustomerMatrix(visible, sortKey, sortDir, { a: compareA, b: compareB }),
    [visible, sortKey, sortDir, compareA, compareB]
  );
```

- [ ] **Step 5: Control A/B** — dentro de "Controles cliente" (el `div` con SearchInput + ExportMenu, líneas ~163-166), tras `<ExportMenu .../>` añade el selector de comparación:
```tsx
        <div className="flex items-end gap-2 ml-auto">
          <span className="text-xs text-muted-foreground self-center">Comparar</span>
          <Select value={String(compareA)} onValueChange={(v) => { if (v) setCompareA(Number(v)); }}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground self-center">vs</span>
          <Select value={String(compareB)} onValueChange={(v) => { if (v) setCompareB(Number(v)); }}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
```

- [ ] **Step 6: Columna Δ (cabecera)** — tras `<TableHead className="text-right">%</TableHead>` (línea ~180) añade:
```tsx
                <SortHeader label={`Δ ${compareA}/${compareB}`} colKey="delta" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
```

- [ ] **Step 7: colSpan del vacío** — cambia `colSpan={years.length + 3}` (línea ~186) por `colSpan={years.length + 4}`.

- [ ] **Step 8: Celda Δ por fila** — tras la celda de `pct(r.total)` (línea ~201) añade:
```tsx
                      <TableCell className="text-right tabular-nums"><DeltaCell a={r.byYear[compareA] ?? 0} b={r.byYear[compareB] ?? 0} /></TableCell>
```

- [ ] **Step 9: Celda Δ del TOTAL** — tras la celda de `pct(totals.grand)` (línea ~210) añade:
```tsx
                    <TableCell className="text-right tabular-nums"><DeltaCell a={totals.byYear[compareA] ?? 0} b={totals.byYear[compareB] ?? 0} /></TableCell>
```

- [ ] **Step 10:** `npx tsc --noEmit` (limpio) + `npm run lint` (0 errores, sin nuevos warnings).
- [ ] **Step 11:** Commit:
```bash
git add "src/app/(dashboard)/clientes/page.tsx"
git commit -m "feat(comparar): columna Δ A/B en la vista Clientes"
```

---

### Task 4: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- `computeDelta`/`formatDeltaPct` son el motor que reusarán los sub-lotes 2 (Artículos) y 3 (Cliente×Artículo).
- Δ coloreado: verde ↑, rojo ↓, neutro (0/null). `DeltaCell` a nivel de módulo (evita warning static-components).
- Export CSV/Excel de Clientes se deja sin la columna Δ (v1).
- Deploy en EasyPanel; validar: elegir A/B → columna Δ con % coloreado; ordenar por Δ.
