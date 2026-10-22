import { describe, it, expect } from "vitest";

import { WIDGET_IDS } from "@/lib/dashboard-layout";
import { WIDGETS, WIDGET_MAP } from "@/lib/widget-registry";

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
