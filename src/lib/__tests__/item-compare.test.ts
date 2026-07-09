import { describe, it, expect } from "vitest";
import { buildItemCompare } from "@/lib/item-compare";
import type { ItemSalesRow } from "@/types/database";

const A: ItemSalesRow[] = [
  { item_id: "1", sku: "A1", nombre: "uno", categoria: "C", cantidad: 1, importe: 120 },
  { item_id: "2", sku: "A2", nombre: "dos", categoria: null, cantidad: 1, importe: 100 },
];
const B: ItemSalesRow[] = [
  { item_id: "1", sku: "A1", nombre: "uno", categoria: "C", cantidad: 1, importe: 100 },
  { item_id: "3", sku: "A3", nombre: "tres", categoria: null, cantidad: 1, importe: 50 },
];

describe("buildItemCompare", () => {
  it("une por item_id; solo-A y solo-B con 0; deltaPct", () => {
    const rows = buildItemCompare(A, B);
    const byId = Object.fromEntries(rows.map((r) => [r.item_id, r]));
    expect(byId["1"]).toMatchObject({ importeA: 120, importeB: 100, deltaPct: 0.2 });
    expect(byId["2"]).toMatchObject({ importeA: 100, importeB: 0, deltaPct: null }); // B=0 → null
    expect(byId["3"]).toMatchObject({ importeA: 0, importeB: 50, nombre: "tres", deltaPct: -1 });
    expect(rows).toHaveLength(3);
  });
});
