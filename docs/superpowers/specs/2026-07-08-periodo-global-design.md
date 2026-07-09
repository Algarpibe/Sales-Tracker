# Contexto de periodo global — Diseño

**Goal:** Compartir `tipo` (OV/FAC) entre todas las vistas y un "año foco" entre las vistas de 1 año, con persistencia en localStorage. Cambias el periodo en una vista y persiste al navegar a otra y al recargar.

**Arquitectura:** `PeriodProvider` (React context, client) en el layout del dashboard; cada selector existente se enlaza al contexto en vez de a estado local. Helper puro para parsear/validar el estado guardado.

**Tech:** Next 16 (App Router), React context, localStorage, vitest.

---

## Estado y decisiones
- `tipo: "SALES_ORDER" | "INVOICE"` — default **INVOICE (FAC)**.
- `year: number` — default año actual.
- Persistencia en `localStorage["salestracker.period"]` = `{ tipo, year }`.

## Reparto por vista
| Vista | tipo | año |
|---|---|---|
| Tablas | shared | shared |
| Cliente×Artículo | shared | shared |
| Detalle cliente (`/clientes/[customer]`) | shared | shared |
| Análisis | shared | `yearA` shared · **`yearB` local** |
| Artículos | shared | **rango local** (desde/hasta ISO) |
| Clientes | shared | **rango local** (desde/hasta año) |

---

## Helper — `src/lib/period.ts`
```ts
export type Tipo = "SALES_ORDER" | "INVOICE";
export interface Period { tipo: Tipo; year: number }
export function parseStoredPeriod(raw: string | null, fallback: Period): Period;
```
- `raw` null / JSON inválido → `fallback`.
- Valida `tipo` (solo los dos valores) y `year` (número finito); campos inválidos → los del fallback.

## Provider — `src/components/providers/period-provider.tsx`
```tsx
"use client";
export function usePeriod(): { tipo: Tipo; setTipo: (t: Tipo) => void; year: number; setYear: (y: number) => void };
export function PeriodProvider({ children }): JSX.Element;
```
- `useState` con defaults (tipo INVOICE, year = año actual).
- `useEffect` de carga (una vez, tras montar): `parseStoredPeriod(localStorage.getItem(KEY), { tipo, year })` → set state; marca `hydrated`.
- `useEffect` de persistencia: si `hydrated`, escribe `localStorage.setItem(KEY, JSON.stringify({ tipo, year }))` en cada cambio.
- `usePeriod` lanza si se usa fuera del provider.
- `KEY = "salestracker.period"`.

## Integración
- **`src/app/(dashboard)/layout.tsx`**: envolver el contenido (Header + main) con `<PeriodProvider>` (junto al `CommandProvider` ya existente; orden indiferente).
- **Rewiring de cada página** (misma UI): sustituir el `useState` local de `tipo` por `const { tipo, setTipo } = usePeriod()`, y en las de 1 año el `useState` del año por `const { year, setYear } = usePeriod()`. Los selectores (`RecordTypeSelect`, `Select` de año) pasan a usar esos valores/setters.
  - Tablas: `typeFilter`→tipo, `year`→year.
  - Cliente×Artículo: `tipo`→tipo, `anio`→year.
  - Detalle cliente: `tipo`→tipo, `anio`→year.
  - Análisis: `recordType`→tipo, `yearA`→year (dejar `yearB` local).
  - Artículos: `tipo`→tipo (mantener `desde`/`hasta` locales).
  - Clientes: `tipo`→tipo (mantener `desdeAnio`/`hastaAnio` locales).

## Tests — `src/lib/__tests__/period.test.ts`
`parseStoredPeriod`: JSON válido → valores; `tipo` inválido → tipo del fallback; `year` no numérico → year del fallback; `raw` null → fallback; JSON corrupto → fallback (sin lanzar).

## Notas
- Default global FAC → **Tablas y Análisis abrirán en FAC** (antes OV): unificación acordada.
- Breve flash del default antes de leer localStorage (patrón hidratación-segura; aceptable).
- `usePeriod` requiere que todas las páginas del dashboard rendericen dentro de `PeriodProvider` (lo están, vía el layout).

## Fuera de alcance
Sincronizar con la URL; forzar el año en las vistas de rango; barra de periodo global nueva.
