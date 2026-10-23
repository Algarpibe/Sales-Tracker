import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  buildChartSummary,
  chartSummaryCaption,
  chartSummaryOmittedText,
  type ChartSummaryInput,
} from "@/lib/chart-summary";

/**
 * Envoltura accesible de un gráfico de Recharts (FE-061). El SVG no dice nada a un
 * lector de pantalla, así que la región se anuncia como figura con el título de la
 * tarjeta y lleva detrás una tabla `sr-only` con los mismos puntos que pinta el
 * gráfico, formateados como su tooltip.
 *
 * Decisiones que protegen a los E2E y a la hidratación:
 * - El título va en `aria-label` y no se repite como texto: `getByText(título)` sigue
 *   encontrando un solo elemento.
 * - La tabla va DESPUÉS del gráfico: los `getByText(...).first()` siguen cayendo en la
 *   etiqueta o la leyenda visibles.
 * - Sin enlaces ni botones dentro: no añade nada que casen los localizadores por rol
 *   `link`/`button` de las páginas.
 * - Todo sale de las props, sin fechas ni locale del navegador: el HTML del servidor y
 *   el del cliente coinciden.
 *
 * Ocupa todo el alto y ancho del contenedor, como el ResponsiveContainer que envuelve.
 */
export function ChartFigure<T>({
  label,
  summary,
  className,
  children,
}: {
  /** Nombre de la figura: el título de la tarjeta, en texto plano. */
  label: string;
  summary: ChartSummaryInput<T>;
  className?: string;
  children: ReactNode;
}) {
  const resumen = buildChartSummary(summary);
  const caption = chartSummaryCaption(resumen);
  return (
    <div role="figure" aria-label={label} className={cn("relative h-full w-full", className)}>
      {children}
      {resumen.total === 0 ? (
        <p className="sr-only">{caption}</p>
      ) : (
        <table className="sr-only">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {resumen.headers.map((h, i) => (
                <th key={i} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumen.rows.map(([categoria, ...valores], i) => (
              <tr key={i}>
                <th scope="row">{categoria}</th>
                {valores.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
            {resumen.omitted > 0 && (
              <tr>
                <td colSpan={resumen.headers.length}>{chartSummaryOmittedText(resumen.omitted)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
