import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// vitest corre en node sin DOM. ResponsiveContainer no pinta el SVG en el servidor
// (no puede medir), así que se comprueba el resumen accesible, que sí sale en el HTML.
const query = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: query.data, isLoading: false, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CumulativeYoYChart } from "@/components/charts/dashboard/cumulative-yoy-chart";
import { BrandMixCard } from "@/components/charts/comercial/brand-mix-card";
import { CustomerSeasonCard } from "@/components/customers/customer-season-card";

/** Cabeceras y filas de la tabla sr-only, en texto, para comparar sin depender del marcado. */
function tabla(html: string): { caption: string; headers: string[]; rows: string[][] } {
  const table = html.match(/<table class="sr-only">([\s\S]*?)<\/table>/)?.[1] ?? "";
  const texto = (s: string) => s.replace(/<[^>]+>/g, "");
  const caption = texto(table.match(/<caption>([\s\S]*?)<\/caption>/)?.[1] ?? "");
  const headers = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => texto(m[1]));
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => texto(c[1]))
  );
  return { caption, headers, rows };
}

describe("resumen accesible de los gráficos (FE-061)", () => {
  it("Acumulado año vs año: una fila por mes con el acumulado de cada año", () => {
    const html = renderToStaticMarkup(
      <CumulativeYoYChart
        current={[
          { category_id: "a", record_type: "INVOICE", record_month: 1, amount_usd: 100 },
          { category_id: "a", record_type: "INVOICE", record_month: 2, amount_usd: 50.5 },
        ]}
        previous={[{ category_id: "a", record_type: "INVOICE", record_month: 1, amount_usd: 1000 }]}
        yearActual={2025}
        yearPrev={2024}
      />
    );

    expect(html).toContain('role="figure" aria-label="Acumulado 2025 vs 2024"');
    const t = tabla(html);
    expect(t.caption).toBe("Datos del gráfico");
    expect(t.headers).toEqual(["Mes", "2025", "2024"]);
    expect(t.rows).toHaveLength(12);
    expect(t.rows[0]).toEqual(["Ene", "$100", "$1,000"]);
    expect(t.rows[1]).toEqual(["Feb", "$150.5", "$1,000"]);
    expect(t.rows[11]).toEqual(["Dic", "$150.5", "$1,000"]);
  });

  it("Mix por marca: cada porción con su importe y su peso, como el tooltip", () => {
    query.data = [
      { customer: "Cliente A", marca: "Marca X", importe: 300 },
      { customer: "Cliente B", marca: "Marca Y", importe: 100 },
    ];
    const html = renderToStaticMarkup(<BrandMixCard recordType="INVOICE" year={2025} />);

    expect(html).toContain('role="figure" aria-label="Mix por marca 2025"');
    const t = tabla(html);
    expect(t.headers).toEqual(["Marca", "Importe", "% del total"]);
    expect(t.rows).toEqual([
      ["Marca X", "$300", "75.0%"],
      ["Marca Y", "$100", "25.0%"],
    ]);
  });

  it("Estacionalidad de un cliente: doce meses con su importe", () => {
    query.data = [
      { customer: "Cliente A", mes: 3, importe: 1234.56 },
      { customer: "Otro", mes: 3, importe: 999 },
    ];
    const html = renderToStaticMarkup(<CustomerSeasonCard customer="Cliente A" recordType="INVOICE" year={2025} />);

    expect(html).toContain('role="figure" aria-label="Estacionalidad 2025"');
    const t = tabla(html);
    expect(t.headers).toEqual(["Mes", "Importe"]);
    expect(t.rows).toHaveLength(12);
    expect(t.rows[2]).toEqual(["Mar", "$1,234.56"]);
    expect(t.rows[0]).toEqual(["Ene", "$0"]);
  });
});
