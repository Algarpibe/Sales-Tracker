import { describe, it, expect } from "vitest";
import {
  bucketsPorCategoriaId,
  buildMacroEvolution,
  type MacroEvolutionRecord,
} from "@/lib/macro-evolution";
import { BUCKETS, BUCKET_COLORS, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";

const mapa = new Map<string, Bucket>([
  ["c-mo", "mano_obra"],
  ["c-cr", "cr"],
  ["c-eq", "equipos"],
  ["c-op", "operacion"],
]);

const v = (
  category_id: string | null,
  record_year: number,
  record_month: number,
  amount_usd: number
): MacroEvolutionRecord => ({ category_id, record_year, record_month, amount_usd });

// 2024: Mano de obra 150, C&R 50, Equipos 200, Operaciones 0. Total 400.
// 2025: Mano de obra 0, C&R 0, Equipos 200, Operaciones 300. Total 500.
const ventas: MacroEvolutionRecord[] = [
  v("c-mo", 2024, 1, 100),
  v("c-mo", 2024, 2, 50),
  v("c-cr", 2024, 1, 50),
  v("c-sin-marcar", 2024, 3, 200),
  v("c-op", 2025, 12, 300),
  v("c-eq", 2025, 12, 100),
  v(null, 2025, 6, 100),
];

const fila = (r: ReturnType<typeof buildMacroEvolution>, b: Bucket) => r.rows.find((x) => x.groupId === b)!;

describe("bucketsPorCategoriaId", () => {
  it("indexa por id las categorías marcadas, activas o no, y deja fuera las no marcadas", () => {
    const m = bucketsPorCategoriaId([
      { id: "a", macro_categoria: "mano_obra" },
      { id: "b", macro_categoria: null },
      { id: "c", macro_categoria: "operacion" },
    ]);
    expect([...m.entries()]).toEqual([["a", "mano_obra"], ["c", "operacion"]]);
  });

  it("descarta un valor que no es una macro-categoría", () => {
    const m = bucketsPorCategoriaId([{ id: "a", macro_categoria: "otra" as unknown as Bucket }]);
    expect(m.size).toBe(0);
  });
});

describe("buildMacroEvolution", () => {
  it("devuelve siempre cuatro filas, en el orden de BUCKETS, con sus nombres y colores", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(r.rows.map((x) => x.groupId)).toEqual([...BUCKETS]);
    expect(r.rows.map((x) => x.groupName)).toEqual(BUCKETS.map((b) => BUCKET_LABELS[b]));
    expect(r.rows.map((x) => x.color)).toEqual(BUCKETS.map((b) => BUCKET_COLORS[b]));
  });

  it("una categoría sin entrada en el mapa, o una venta sin categoría, cuenta como Equipos", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "equipos").years[2024].amount).toBe(200);
    expect(fila(r, "equipos").years[2025].amount).toBe(200);
  });

  it("suma los importes por año y por mes", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "mano_obra").years[2024].amount).toBe(150);
    expect(fila(r, "mano_obra").years[2025].amount).toBe(0);
    expect(fila(r, "mano_obra").months).toEqual({ 2024: { 1: 100, 2: 50 } });
    expect(fila(r, "equipos").months).toEqual({ 2024: { 3: 200 }, 2025: { 6: 100, 12: 100 } });
    expect(fila(r, "operacion").months).toEqual({ 2025: { 12: 300 } });
  });

  it("los porcentajes de las cuatro filas suman 100 en cada año con ventas", () => {
    const r = buildMacroEvolution(ventas, mapa);
    for (const y of r.years) {
      const suma = r.rows.reduce((acc, x) => acc + x.years[y].percentage, 0);
      expect(suma).toBeCloseTo(100, 10);
    }
    expect(fila(r, "mano_obra").years[2024].percentage).toBeCloseTo(37.5, 10);
    expect(fila(r, "cr").years[2024].percentage).toBeCloseTo(12.5, 10);
    expect(fila(r, "operacion").years[2025].percentage).toBeCloseTo(60, 10);
  });

  it("yearTotals es la suma de las filas y years va en orden ascendente", () => {
    const r = buildMacroEvolution([...ventas].reverse(), mapa);
    expect(r.years).toEqual([2024, 2025]);
    expect(r.yearTotals).toEqual({ 2024: 400, 2025: 500 });
    for (const y of r.years) {
      expect(r.rows.reduce((acc, x) => acc + x.years[y].amount, 0)).toBe(r.yearTotals[y]);
    }
  });

  it("el promedio reparte el total entre los años, como en el gráfico de grupos", () => {
    const r = buildMacroEvolution(ventas, mapa);
    expect(fila(r, "mano_obra").average.amount).toBe(75);
    expect(fila(r, "mano_obra").average.percentage).toBeCloseTo((150 / 900) * 100, 10);
    expect(fila(r, "equipos").average.amount).toBe(200);
    expect(fila(r, "equipos").average.percentage).toBeCloseTo((400 / 900) * 100, 10);
  });

  it("acepta importes NUMERIC que llegan como texto", () => {
    const r = buildMacroEvolution(
      [
        { category_id: "c-cr", record_year: 2024, record_month: 1, amount_usd: "12.50" as unknown as number },
        { category_id: "c-cr", record_year: 2024, record_month: 1, amount_usd: "12.50" as unknown as number },
      ],
      mapa
    );
    expect(fila(r, "cr").years[2024].amount).toBe(25);
    expect(fila(r, "cr").months).toEqual({ 2024: { 1: 25 } });
  });

  it("sin ventas, las filas valen cero y no hay años", () => {
    const r = buildMacroEvolution([], mapa);
    expect(r.years).toEqual([]);
    expect(r.yearTotals).toEqual({});
    expect(r.rows).toHaveLength(4);
    for (const x of r.rows) {
      expect(x.years).toEqual({});
      expect(x.months).toEqual({});
      expect(x.average).toEqual({ amount: 0, percentage: 0 });
    }
  });
});
