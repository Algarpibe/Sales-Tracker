import { describe, it, expect } from "vitest";
import { techServiceBucketsSchema } from "@/lib/validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("techServiceBucketsSchema", () => {
  it("acepta dos grupos disjuntos", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [A, B], cr: [C] }).success).toBe(true);
  });

  it("acepta grupos vacios: un grupo sin categorias vale 0", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: [] }).success).toBe(true);
  });

  it("rechaza una categoria en los dos grupos", () => {
    const r = techServiceBucketsSchema.safeParse({ st: [A], cr: [A, C] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Una categoría no puede estar en ST y en C&R a la vez");
  });

  it("rechaza duplicados dentro de ST", () => {
    const r = techServiceBucketsSchema.safeParse({ st: [A, A], cr: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Hay categorías repetidas en un grupo");
  });

  it("rechaza duplicados dentro de C&R", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: [B, B] }).success).toBe(false);
  });

  it("rechaza lo que no es UUID", () => {
    expect(techServiceBucketsSchema.safeParse({ st: ["no-es-uuid"], cr: [] }).success).toBe(false);
    expect(techServiceBucketsSchema.safeParse({ st: [], cr: ["Aguas"] }).success).toBe(false);
  });

  it("rechaza que falte un grupo", () => {
    expect(techServiceBucketsSchema.safeParse({ st: [A] }).success).toBe(false);
  });
});
