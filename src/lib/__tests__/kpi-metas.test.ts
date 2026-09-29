import { describe, it, expect } from "vitest";
import { filaDeMeta } from "@/lib/kpi-metas";

describe("filaDeMeta", () => {
  it("convierte a numero los numeric que Drizzle devuelve como texto", () => {
    expect(filaDeMeta({ kpi_key: "tickets_st", target_value: "80.00", weight_pct: "40.00", plazo_horas: "4.50" }))
      .toEqual({ kpi_key: "tickets_st", target_value: 80, weight_pct: 40, plazo_horas: 4.5 });
  });

  // Number(null) es 0: sin este cuidado, un anio sin plazo guardado mediria con plazo 0
  // y todos sus tickets saldrian fuera de plazo.
  it("un plazo nulo sigue siendo nulo, no 0", () => {
    expect(
      filaDeMeta({ kpi_key: "ventas_nuevos", target_value: "1000.00", weight_pct: "60.00", plazo_horas: null }).plazo_horas
    ).toBeNull();
  });
});
