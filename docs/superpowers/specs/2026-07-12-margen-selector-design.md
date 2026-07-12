# Selector $/% en los gráficos de Margen — Diseño

**Goal:** En "Margen por artículo (top 15)" e "Importe vs margen", un selector segmentado `$ | %` dentro del gráfico para ver el margen en importe ($) o en porcentaje (%).

**Arquitectura:** Estado local `mode: "money" | "pct"` en cada tarjeta + componente compartido `AmountModeToggle`. Ambos valores (`margen`, `margenPct`) ya vienen en `MarginItemPoint`; sin datos nuevos.

**Tech:** Next 16, recharts.

---

## Componente — `src/components/common/amount-mode-toggle.tsx`
`AmountModeToggle({ value: AmountMode, onChange, className? })` con `type AmountMode = "money" | "pct"`. Dos botones "$" y "%" (segmentado compacto), `aria-pressed`.

## Margen por artículo — `margin-by-item-card.tsx`
- Estado `mode` (default `"money"`). Toggle en la cabecera (derecha).
- `$`: barras por `margen`, eje X USD (`formatCompactUSD`), top 15 por margen $ (orden actual de `buildMarginItems`).
- `%`: barras por `margenPct`, eje X `%`, **re-ordenado top 15 por margen %** (client-side).
- Subtítulo adapta: "Margen $ estimado…" / "Margen % estimado…".
- Tooltip interno sin cambios (ya muestra $ y %).

## Importe vs margen — `margin-scatter-card.tsx`
- Estado `mode` (default `"pct"`). Toggle en la cabecera.
- `%` (actual): `yPlot = max(margenPct, FLOOR_PCT=-50)`, YAxis dominio [−50,100] con ticks fijos y `%`; línea equilibrio 0 + línea ámbar del % global.
- `$`: `yPlot = margen`, YAxis dominio automático (incluye negativos), tick USD; solo línea de equilibrio en 0 (sin línea ámbar ni recorte de outliers).
- Título: `Importe vs margen $ {year}` / `Importe vs margen % {year}`. Subtítulo adapta.

## Copy tooltips (`chart-help.ts`)
- `margenPorArticulo` y `margenScatter`: añadir mención "Usa el selector $/% para ver importe o porcentaje."

## Testing
UI. Gate = tsc + lint + build. Verificación manual: alternar $/% recalcula ejes, orden (barras) y líneas de referencia.

## Fuera de alcance
- Toggle en "Margen por cliente" (no pedido) — se puede replicar luego si se quiere.
- Umbral mínimo de ventas para el top 15 por % (posible ruido de ítems triviales) — no en este lote.
