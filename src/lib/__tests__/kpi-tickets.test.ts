import { describe, it, expect } from "vitest";
import { festivosColombia } from "@/lib/kpi-tickets";

describe("festivosColombia", () => {
  it("2025 coincide con la lista oficial completa", () => {
    // San Pedro y San Pablo (29 jun, domingo) pasa al lunes 30, el mismo dia que el
    // Sagrado Corazon (Pascua 20 abr + 71): dos festivos en una fecha, 17 fechas.
    expect([...festivosColombia(2025)].sort()).toEqual([
      "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18",
      "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20",
      "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17",
      "2025-12-08", "2025-12-25",
    ]);
  });

  it("2026 coincide con la lista oficial completa", () => {
    // Pascua 5 abr. 29 jun y 12 oct caen en lunes y no se trasladan.
    expect([...festivosColombia(2026)].sort()).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
      "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
      "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02",
      "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("un festivo trasladable que ya cae en lunes se queda en su fecha", () => {
    expect(festivosColombia(2026).has("2026-10-12")).toBe(true);
    expect(festivosColombia(2026).has("2026-10-19")).toBe(false);
  });
});
