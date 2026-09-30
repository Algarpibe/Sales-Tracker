import { describe, it, expect } from "vitest";
import { buildCustomerCategoryCompare } from "@/lib/customer-category-compare";
import type { CustomerItemRow } from "@/types/database";

const fila = (customer: string, sku: string, categoria: string | null, importe: number): CustomerItemRow =>
  ({ customer, sku, marca: null, nombre: `art ${sku}`, categoria, cantidad: 1, importe });

const A: CustomerItemRow[] = [
  fila("AGQ", "1", "Aguas", 120),
  fila("AGQ", "2", "Aguas", 30),
  fila("AGQ", "3", null, 100),
  fila("Beta", "9", "Aire", 300),
];
const B: CustomerItemRow[] = [
  fila("AGQ", "1", "Aguas", 100),
  fila("AGQ", "4", "Suelos", 50),
  fila("Gamma", "7", "Aire", 40),
];

describe("buildCustomerCategoryCompare", () => {
  it("una categoria que solo aparece en un anio sale con 0 en el otro, en el orden establecido", () => {
    const agq = buildCustomerCategoryCompare(A, B).find((g) => g.customer === "AGQ")!;
    // Por importe A desc; con importe A empatado, por importe B desc.
    expect(agq.categorias).toEqual([
      { categoria: "Aguas", importeA: 150, importeB: 100, deltaPct: 0.5 },
      { categoria: null, importeA: 100, importeB: 0, deltaPct: null },
      { categoria: "Suelos", importeA: 0, importeB: 50, deltaPct: -1 },
    ]);
  });

  it("totales por anio de cada cliente, incluidos los que solo tienen ventas en uno", () => {
    const groups = buildCustomerCategoryCompare(A, B);
    expect(groups.map((g) => g.customer)).toEqual(["AGQ", "Beta", "Gamma"]);
    const [agq, beta, gamma] = groups;
    expect(agq.totalA).toBe(250);
    expect(agq.totalB).toBe(150);
    expect(agq.deltaPct).toBeCloseTo(2 / 3);
    expect(beta).toMatchObject({ totalA: 300, totalB: 0, deltaPct: null });
    expect(gamma).toMatchObject({ totalA: 0, totalB: 40, deltaPct: -1 });
    expect(gamma.categorias).toEqual([{ categoria: "Aire", importeA: 0, importeB: 40, deltaPct: -1 }]);
  });
});
