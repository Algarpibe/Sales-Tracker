import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { CHART_SUMMARY_MAX_ROWS } from "@/lib/chart-summary";
import { formatUSD } from "@/lib/constants";

// vitest corre en node sin DOM: se renderiza a HTML estático y se mira el marcado.
type Punto = { mes: string; ventas: number };

function render(data: Punto[], label = "Ventas mensuales 2025") {
  return renderToStaticMarkup(
    <ChartFigure
      label={label}
      summary={{
        data,
        categoryLabel: "Mes",
        category: (p: Punto) => p.mes,
        series: [{ label: "Ventas", value: (p: Punto) => p.ventas, format: formatUSD }],
      }}
    >
      <svg data-testid="grafico" />
    </ChartFigure>
  );
}

describe("ChartFigure", () => {
  it("etiqueta la región del gráfico con su título y conserva el gráfico dentro", () => {
    const html = render([{ mes: "Ene", ventas: 10 }]);
    expect(html).toMatch(/^<div role="figure" aria-label="Ventas mensuales 2025"/);
    expect(html).toContain('<svg data-testid="grafico"></svg>');
  });

  it("añade una tabla solo para lectores de pantalla, después del gráfico", () => {
    const html = render([
      { mes: "Ene", ventas: 1234.5 },
      { mes: "Feb", ventas: 0 },
    ]);
    expect(html).toContain('<table class="sr-only">');
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("<table"));
    expect(html).toContain("<caption>Datos del gráfico</caption>");
    expect(html).toContain('<th scope="col">Mes</th><th scope="col">Ventas</th>');
    expect(html).toContain('<tr><th scope="row">Ene</th><td>$1,234.5</td></tr>');
    expect(html).toContain('<tr><th scope="row">Feb</th><td>$0</td></tr>');
  });

  it("el título no se repite como texto en el resumen (los E2E buscan el título por texto)", () => {
    const html = render([{ mes: "Ene", ventas: 1 }], "Margen por artículo 2024");
    const sinAtributos = html.replace(/aria-label="[^"]*"/g, "");
    expect(sinAtributos).not.toContain("Margen por artículo 2024");
  });

  it("con series largas enseña las primeras filas y dice cuántas faltan", () => {
    const data = Array.from({ length: CHART_SUMMARY_MAX_ROWS + 3 }, (_, i) => ({ mes: `P${i + 1}`, ventas: i }));
    const html = render(data);
    expect(html).toContain(`<caption>Datos del gráfico (primeras ${CHART_SUMMARY_MAX_ROWS} de ${CHART_SUMMARY_MAX_ROWS + 3} filas)</caption>`);
    expect(html).toContain(`<th scope="row">P${CHART_SUMMARY_MAX_ROWS}</th>`);
    expect(html).not.toContain(`<th scope="row">P${CHART_SUMMARY_MAX_ROWS + 1}</th>`);
    expect(html).toContain('<tr><td colSpan="2">y 3 más</td></tr>');
  });

  it("sin datos no pinta una tabla vacía: lo dice en texto oculto", () => {
    const html = render([]);
    expect(html).not.toContain("<table");
    expect(html).toContain('<p class="sr-only">Sin datos en el gráfico</p>');
  });
});
