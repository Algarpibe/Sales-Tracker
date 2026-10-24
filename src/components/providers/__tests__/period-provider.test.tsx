import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PeriodProvider, usePeriod } from "@/components/providers/period-provider";
import { PERIOD_STORAGE_KEY } from "@/lib/period-store";

// vitest corre en node sin DOM: se renderiza a HTML estático, que es lo mismo que
// pinta el servidor y lo que React espera encontrar al hidratar.

function Probe() {
  const { tipo, year } = usePeriod();
  return <span>{`${tipo}-${year}`}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PeriodProvider", () => {
  it("el HTML del servidor usa el periodo por defecto aunque haya uno guardado (sin React #418)", () => {
    // Aunque el entorno tenga un periodo guardado, el render del servidor (y por tanto
    // la hidratación) no puede depender de él: el servidor no tiene localStorage.
    const guardado = JSON.stringify({ tipo: "SALES_ORDER", year: 2020 });
    const localStorage = { getItem: (k: string) => (k === PERIOD_STORAGE_KEY ? guardado : null), setItem: () => {} };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage });

    const html = renderToStaticMarkup(
      <PeriodProvider>
        <Probe />
      </PeriodProvider>,
    );
    expect(html).toBe(`<span>INVOICE-${new Date().getFullYear()}</span>`);
  });

  it("usePeriod fuera del provider avisa del error de montaje", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow("usePeriod debe usarse dentro de <PeriodProvider>");
  });
});
