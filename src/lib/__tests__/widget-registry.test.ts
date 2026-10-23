import { describe, it, expect } from "vitest";
import { isValidElement } from "react";

import { WIDGET_IDS } from "@/lib/dashboard-layout";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";
import { WIDGETS, WIDGET_MAP, type WidgetContext } from "@/lib/widget-registry";

// Sustituye a la constante MISSING_WIDGETS, que nadie comprobaba (AI-083): el registro
// debe cubrir exactamente los ids canónicos del layout persistido.
describe("registro de widgets", () => {
  it("cada id canónico tiene su entrada en el registro", () => {
    expect(WIDGET_IDS.filter((id) => !WIDGET_MAP.has(id))).toEqual([]);
  });

  it("no hay entradas fuera de los ids canónicos ni repetidas", () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...WIDGET_IDS].sort());
  });
});

// FE-055: los gráficos se cargan con next/dynamic. Construir el árbol de cada widget no
// descarga ni pinta nada (eso pasa al montarlo en el navegador), pero comprueba que
// cada `render` produce un elemento de React con el contexto del dashboard, sin lanzar.
describe("render de cada widget", () => {
  const metrics = computeDashboardMetrics([], []);
  const ctx: WidgetContext = {
    recordType: "INVOICE",
    year: 2025,
    records: [],
    prevRecords: [],
    catMap: new Map(),
    categories: [],
    metrics,
    metricsPrev: metrics,
  };

  it.each(WIDGETS.map((w) => [w.id, w] as const))("%s", (_id, def) => {
    expect(isValidElement(def.render(ctx))).toBe(true);
  });
});
