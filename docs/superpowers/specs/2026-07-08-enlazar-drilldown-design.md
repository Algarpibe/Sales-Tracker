# Enlazar drill-down de cliente — Diseño

**Goal:** Hacer que las 5 superficies que muestran un cliente naveguen a su detalle `/clientes/[cliente]`: 2 tablas (enlace directo) y 3 gráficos recharts (clic en la barra).

**Arquitectura:** Helper compartido `customerHref(name)` para la ruta codificada. Tablas usan `<Link>`; gráficos usan `useRouter` + `onClick` en `<Bar>`. Sin datos ni SQL nuevos.

**Tech:** Next 16 (next/link, next/navigation), recharts, vitest.

---

## Helper (`src/lib/customer-detail.ts`, añadir)

```ts
export function customerHref(name: string): string {
  return `/clientes/${encodeURIComponent(name)}`;
}
```
Test: `customerHref("Acme S.A.S.")` → `"/clientes/Acme%20S.A.S."`; con acentos codifica bien.

## Tablas (enlace directo)

- `src/app/(dashboard)/cliente-articulo/page.tsx`: la celda de cabecera de grupo `{g.customer}` se envuelve en `<Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">`.
- `src/components/charts/comercial/month-heatmap-card.tsx` (C4): la celda `<td>` del nombre `{r.customer}` se envuelve igual en `<Link>`.

## Gráficos (clic en barra)

En `client-pareto-card.tsx`, `bucket-by-client-card.tsx` (M3) y `margin-by-customer-card.tsx`:
- Importar `useRouter` (`next/navigation`) y `customerHref`.
- `const router = useRouter();` en el componente.
- En cada `<Bar>`, `onClick={(d) => { const name = d?.payload?.customer ?? d?.customer; if (name) router.push(customerHref(name)); }}`. (M3 tiene 4 Bar apiladas → onClick en las 4.)
- `ResponsiveContainer` con `className="cursor-pointer"` como afordancia.
- Subtítulo en la card: "Clic en un cliente para ver su detalle."
- Si `tsc` se queja del tipo del `onClick` de recharts, tipar el parámetro para que compile (recharts entrega el dato con los campos de fila + `payload`).

Los datos ya exponen `customer`: `ParetoRow.customer`, `BucketClientRow.customer`, `MarginCustomerPoint.customer`.

## Destino
`/clientes/[nombre]`; el detalle abre con sus defaults (FAC + año actual). No se arrastra tipo/año de origen.

## Archivos
- Modificar: `src/lib/customer-detail.ts` (+ test), `cliente-articulo/page.tsx`, `month-heatmap-card.tsx`, `client-pareto-card.tsx`, `bucket-by-client-card.tsx`, `margin-by-customer-card.tsx`.

## Fuera de alcance
Sincronizar selectores con la URL; enlazar desde vistas sin cliente individual (nuevos-vs-recurrentes, mix por marca).
