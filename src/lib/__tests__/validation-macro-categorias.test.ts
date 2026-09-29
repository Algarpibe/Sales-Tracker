import { describe, it, expect } from "vitest";
import { macroCategoriasSchema } from "@/lib/validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

const vacio = { mano_obra: [], cr: [], equipos: [], operacion: [] };

describe("macroCategoriasSchema", () => {
  it("acepta cuatro grupos disjuntos", () => {
    const r = macroCategoriasSchema.safeParse({ mano_obra: [A], cr: [B], equipos: [C], operacion: [D] });
    expect(r.success).toBe(true);
  });

  it("acepta grupos vacios: lo que no esta marcado cuenta como Equipos", () => {
    expect(macroCategoriasSchema.safeParse(vacio).success).toBe(true);
  });

  it("rechaza una categoria en dos grupos", () => {
    const r = macroCategoriasSchema.safeParse({ ...vacio, cr: [A], operacion: [A, B] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Una categoría no puede estar en dos macro-categorías a la vez");
  });

  it("rechaza duplicados dentro de un grupo", () => {
    const r = macroCategoriasSchema.safeParse({ ...vacio, equipos: [C, C] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Hay categorías repetidas en un grupo");
  });

  it("rechaza lo que no es UUID", () => {
    expect(macroCategoriasSchema.safeParse({ ...vacio, mano_obra: ["Aguas"] }).success).toBe(false);
  });

  it("rechaza que falte un grupo", () => {
    expect(macroCategoriasSchema.safeParse({ mano_obra: [A], cr: [], equipos: [] }).success).toBe(false);
  });
});
