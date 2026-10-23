import { describe, it, expect, vi } from "vitest";

/**
 * PRIV-017: el aviso de «payload grande» de readSalesData registra los filtros para
 * diagnosticar, pero `search` es texto libre del usuario (puede ser el nombre de un
 * cliente) y el filtro de PII del logger no lo reconoce por su clave. No se registra.
 */

const logWarn = vi.hoisted(() => vi.fn());

// Más filas que el umbral del aviso (5000) por el camino de sales_records.
const ROWS = vi.hoisted(() =>
  Array.from({ length: 5001 }, (_, i) => ({
    record: { id: String(i), amount_usd: "1" },
    category_name: "Aguas",
    category_color: "#000",
  }))
);

vi.mock("@/db", () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: async () => ROWS,
  };
  return { db: { select: () => chain } };
});
vi.mock("@/db/hub", () => ({ hubEnabled: () => false }));
vi.mock("@/lib/logger", () => ({ logWarn, logError: vi.fn(), logInfo: vi.fn() }));

import { readSalesData } from "@/lib/data-reads";

describe("readSalesData: aviso de payload grande", () => {
  it("registra los filtros sin el texto de búsqueda", async () => {
    await readSalesData("company", { year: 2024, record_type: "INVOICE", search: "Cliente Secreto SAS" });

    expect(logWarn).toHaveBeenCalledTimes(1);
    const meta = logWarn.mock.calls[0][1] as { filters: Record<string, unknown> };
    expect(meta.filters).toMatchObject({ year: 2024, record_type: "INVOICE", hasSearch: true });
    expect(meta.filters).not.toHaveProperty("search");
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("Cliente Secreto");
  });
});
