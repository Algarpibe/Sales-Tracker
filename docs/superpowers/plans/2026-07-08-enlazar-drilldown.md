# Enlazar drill-down de cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las 5 superficies que muestran un cliente navegan a `/clientes/[cliente]`: 2 tablas (`<Link>`) y 3 gráficos recharts (clic en la barra).

**Architecture:** Helper `customerHref(name)` compartido. Tablas → `<Link>`. Gráficos → `useRouter` + `<Bar onClick>`. Sin datos ni SQL nuevos.

**Tech Stack:** Next 16 (next/link, next/navigation), recharts, vitest.

---

### Task 1: Helper `customerHref` + test (TDD)

**Files:** Modify `src/lib/customer-detail.ts`, `src/lib/__tests__/customer-detail.test.ts`

- [ ] **Step 1: Test (falla)** — en `src/lib/__tests__/customer-detail.test.ts`, añade `customerHref` al import desde `@/lib/customer-detail` y añade al final:

```ts
describe("customerHref", () => {
  it("codifica espacios y caracteres especiales", () => {
    expect(customerHref("Acme S.A.S.")).toBe("/clientes/Acme%20S.A.S.");
    expect(customerHref("Compañía & Co")).toBe("/clientes/Compa%C3%B1%C3%ADa%20%26%20Co");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/customer-detail.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `src/lib/customer-detail.ts`, añade al final:

```ts
export function customerHref(name: string): string {
  return `/clientes/${encodeURIComponent(name)}`;
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/customer-detail.test.ts` → PASS.
- [ ] **Step 5:** `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 6:** Commit:
```bash
git add src/lib/customer-detail.ts src/lib/__tests__/customer-detail.test.ts
git commit -m "feat(cliente): helper customerHref + test"
```

---

### Task 2: Enlazar las 2 tablas

**Files:** Modify `src/app/(dashboard)/cliente-articulo/page.tsx`, `src/components/charts/comercial/month-heatmap-card.tsx`

- [ ] **Step 1: cliente-articulo** — añade imports arriba:
```tsx
import Link from "next/link";
import { customerHref } from "@/lib/customer-detail";
```
Reemplaza la línea 122:
```tsx
                        <TableCell colSpan={5}>{g.customer}</TableCell>
```
por:
```tsx
                        <TableCell colSpan={5}>
                          <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                        </TableCell>
```

- [ ] **Step 2: month-heatmap-card** — añade imports arriba:
```tsx
import Link from "next/link";
import { customerHref } from "@/lib/customer-detail";
```
Reemplaza la línea 51:
```tsx
                    <td className="sticky left-0 z-10 bg-card truncate max-w-[160px] pr-2" title={r.customer}>{r.customer}</td>
```
por:
```tsx
                    <td className="sticky left-0 z-10 bg-card truncate max-w-[160px] pr-2" title={r.customer}>
                      <Link href={customerHref(r.customer)} className="hover:text-primary hover:underline">{r.customer}</Link>
                    </td>
```

- [ ] **Step 3:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings).
- [ ] **Step 4:** Commit:
```bash
git add "src/app/(dashboard)/cliente-articulo/page.tsx" src/components/charts/comercial/month-heatmap-card.tsx
git commit -m "feat(cliente): enlazar cliente al detalle en Cliente×Artículo y heatmap C4"
```

---

### Task 3: Clic en barra en los 3 gráficos

**Files:** Modify `src/components/charts/comercial/client-pareto-card.tsx`, `src/components/charts/comercial/bucket-by-client-card.tsx`, `src/components/charts/margin/margin-by-customer-card.tsx`

Patrón común para los 3 (añadir a cada uno):
- Imports: `import { useRouter } from "next/navigation";` y `import { customerHref } from "@/lib/customer-detail";`
- Dentro del componente, tras los hooks existentes: `const router = useRouter();`
- Handler (justo antes del `return`):
```tsx
  const goCustomer = (d: { customer?: string; payload?: { customer?: string } }) => {
    const name = d?.payload?.customer ?? d?.customer;
    if (name) router.push(customerHref(name));
  };
```
- `ResponsiveContainer` → añadir `className="cursor-pointer"`.
- En cada `<Bar ...>` añadir `onClick={goCustomer}`.

Si `tsc` marca incompatibilidad de tipos en `onClick` de recharts, tipar el parámetro de `goCustomer` como el tipo que recharts espera (recharts pasa `(data, index, event)`; `data` lleva los campos de la fila y `payload`). Una opción segura si hiciera falta: `onClick={(d) => goCustomer(d as { customer?: string; payload?: { customer?: string } })}`.

- [ ] **Step 1: client-pareto-card.tsx**
  - Añadir imports + `const router = useRouter();` + `goCustomer`.
  - `<ResponsiveContainer width="100%" height={...} className="cursor-pointer">`.
  - `<Bar ... dataKey="ventas" ... onClick={goCustomer} />` (línea 54).
  - Tras `<CardTitle>...</CardTitle>` (línea 39) añadir:
    ```tsx
        <p className="text-xs text-muted-foreground">Clic en un cliente para ver su detalle.</p>
    ```

- [ ] **Step 2: bucket-by-client-card.tsx**
  - Añadir imports + `const router = useRouter();` + `goCustomer`.
  - `<ResponsiveContainer ... className="cursor-pointer">`.
  - En el `.map` de SERIES, cada `<Bar key={s.key} ... onClick={goCustomer} />` (línea 63).
  - Tras `<CardTitle>...</CardTitle>` (línea 47) añadir la misma `<p>` de hint.

- [ ] **Step 3: margin-by-customer-card.tsx**
  - Añadir imports + `const router = useRouter();` + `goCustomer`.
  - `<ResponsiveContainer ... className="cursor-pointer">`.
  - `<Bar dataKey="margen" ... onClick={goCustomer} />` (línea 53).
  - La card ya tiene subtítulo (línea 39): reemplazar su texto por
    `Margen $ estimado; solo bienes con costo. Clic en un cliente para ver su detalle.`

- [ ] **Step 4:** `npx tsc --noEmit` (limpio) + `npm run lint` (sin nuevos warnings para estos 3 archivos).
- [ ] **Step 5:** Commit:
```bash
git add src/components/charts/comercial/client-pareto-card.tsx src/components/charts/comercial/bucket-by-client-card.tsx src/components/charts/margin/margin-by-customer-card.tsx
git commit -m "feat(cliente): clic en barra → detalle en Pareto/M3/Margen por cliente"
```

---

### Task 4: Build + push

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` → todo verde.
- [ ] **Step 2:** `git push origin main`

---

## Notas
- Destino `/clientes/[nombre]`; el detalle usa sus defaults (FAC + año actual). Sin arrastrar tipo/año.
- `useRouter` de `next/navigation` (App Router). Los 3 gráficos ya son `"use client"`.
- Deploy en EasyPanel al terminar; validar clic desde las 5 superficies.
