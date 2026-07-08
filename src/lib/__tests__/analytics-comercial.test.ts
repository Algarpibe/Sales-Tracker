import { describe, it, expect } from "vitest";
import {
  buildBucketMixByYear,
  buildClientPareto,
  topItems,
  buildItemPareto,
  buildBrandMix,
  buildBucketByClient,
} from "@/lib/analytics-comercial";
import type { CustomerYearRow, ItemSalesRow, CustomerItemRow } from "@/types/database";

describe("buildBucketMixByYear", () => {
  it("filtra por tipo y año>=2021, clasifica buckets y agrega por año", () => {
    const records = [
      { categories: { name: "EDM180 Series" }, record_type: "INVOICE", record_year: 2024, amount_usd: 1000 },
      { categories: { name: "C&R EDM 180" }, record_type: "INVOICE", record_year: 2024, amount_usd: 200 },
      { categories: { name: "CAL PM" }, record_type: "INVOICE", record_year: 2025, amount_usd: 500 },
      { categories: { name: "Operación de Redes" }, record_type: "INVOICE", record_year: 2025, amount_usd: 300 },
      { categories: { name: "EDM180 Series" }, record_type: "SALES_ORDER", record_year: 2025, amount_usd: 999 },
      { categories: { name: "EDM180 Series" }, record_type: "INVOICE", record_year: 2019, amount_usd: 888 },
    ];
    const r = buildBucketMixByYear(records, "INVOICE");
    expect(r).toEqual([
      { year: 2024, mano_obra: 0, cr: 200, equipos: 1000, operacion: 0 },
      { year: 2025, mano_obra: 500, cr: 0, equipos: 0, operacion: 300 },
    ]);
  });
});

describe("buildClientPareto", () => {
  it("suma por cliente, ordena desc, % acumulado (último 100%)", () => {
    const rows: CustomerYearRow[] = [
      { customer: "A", year: 2025, ventas: 60 },
      { customer: "B", year: 2025, ventas: 30 },
      { customer: "C", year: 2025, ventas: 10 },
    ];
    const p = buildClientPareto(rows);
    expect(p.map((x) => x.customer)).toEqual(["A", "B", "C"]);
    expect(p[0].cumPct).toBeCloseTo(60);
    expect(p[1].cumPct).toBeCloseTo(90);
    expect(p[2].cumPct).toBeCloseTo(100);
  });
});

describe("topItems", () => {
  const rows: ItemSalesRow[] = [
    { item_id: "1", sku: "X", nombre: "uno", categoria: null, cantidad: 5, importe: 10 },
    { item_id: "2", sku: "Y", nombre: "dos", categoria: null, cantidad: 1, importe: 30 },
    { item_id: "3", sku: "Z", nombre: "tres", categoria: null, cantidad: 9, importe: 20 },
  ];
  it("ordena por importe y recorta", () => {
    expect(topItems(rows, "importe", 2).map((r) => r.sku)).toEqual(["Y", "Z"]);
  });
  it("ordena por cantidad", () => {
    expect(topItems(rows, "cantidad", 2).map((r) => r.sku)).toEqual(["Z", "X"]);
  });
});

describe("buildItemPareto", () => {
  it("ordena desc + cumPct (último 100%)", () => {
    const rows = [
      { item_id: "1", sku: "A", nombre: "uno", categoria: null, cantidad: 1, importe: 60 },
      { item_id: "2", sku: "B", nombre: "dos", categoria: null, cantidad: 1, importe: 30 },
      { item_id: "3", sku: "C", nombre: "tres", categoria: null, cantidad: 1, importe: 10 },
    ];
    const p = buildItemPareto(rows);
    expect(p.map((x) => x.sku)).toEqual(["A", "B", "C"]);
    expect(p[0].cumPct).toBeCloseTo(60);
    expect(p[2].cumPct).toBeCloseTo(100);
  });
});

describe("buildBrandMix", () => {
  it("agrega por marca, null→Sin marca, orden desc", () => {
    const rows: CustomerItemRow[] = [
      { customer: "X", sku: "a", marca: "Horiba", nombre: "n", categoria: null, cantidad: 1, importe: 100 },
      { customer: "Y", sku: "b", marca: "Horiba", nombre: "n", categoria: null, cantidad: 1, importe: 50 },
      { customer: "Z", sku: "c", marca: null, nombre: "n", categoria: null, cantidad: 1, importe: 200 },
    ];
    expect(buildBrandMix(rows)).toEqual([
      { marca: "Sin marca", importe: 200 },
      { marca: "Horiba", importe: 150 },
    ]);
  });
});

describe("buildBucketByClient", () => {
  it("buckets por cliente + orden por total desc", () => {
    const rows: CustomerItemRow[] = [
      { customer: "A", sku: "1", marca: null, nombre: "n", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
      { customer: "A", sku: "2", marca: null, nombre: "n", categoria: "CAL PM", cantidad: 1, importe: 50 },
      { customer: "B", sku: "3", marca: null, nombre: "n", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
    ];
    const b = buildBucketByClient(rows);
    expect(b.map((x) => x.customer)).toEqual(["B", "A"]);
    expect(b[1]).toEqual({ customer: "A", mano_obra: 50, cr: 100, equipos: 0, operacion: 0, total: 150 });
    expect(b[0].equipos).toBe(500);
  });
});
