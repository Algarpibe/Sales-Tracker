import { describe, it, expect } from "vitest";
import { BUCKETS, type Bucket } from "@/lib/customer-item";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionPorGrupo,
  type Seleccion,
} from "@/lib/seleccion-grupos";

const vacia = (): Seleccion<Bucket> => ({ mano_obra: [], cr: [], equipos: [], operacion: [] });

describe("seleccionPorGrupo", () => {
  it("reparte las categorias entre los cuatro grupos y respeta el orden", () => {
    const sel = seleccionPorGrupo(BUCKETS, [
      { id: "a", grupo: "mano_obra" },
      { id: "b", grupo: "operacion" },
      { id: "c", grupo: null },
      { id: "d", grupo: "mano_obra" },
      { id: "e", grupo: "equipos" },
    ]);
    expect(sel).toEqual({ mano_obra: ["a", "d"], cr: [], equipos: ["e"], operacion: ["b"] });
  });

  it("ignora un grupo que no esta en la lista", () => {
    expect(seleccionPorGrupo(BUCKETS, [{ id: "a", grupo: "st" }])).toEqual(vacia());
  });
});

describe("grupoDe", () => {
  it("dice en que grupo esta una categoria, o null", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["a"], operacion: ["b"] };
    expect(grupoDe(sel, "a")).toBe("cr");
    expect(grupoDe(sel, "b")).toBe("operacion");
    expect(grupoDe(sel, "z")).toBeNull();
  });
});

describe("alternarCategoria", () => {
  it("marca una categoria libre en el grupo pedido sin tocar los demas", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["a"] };
    expect(alternarCategoria(sel, "equipos", "c")).toEqual({ ...vacia(), cr: ["a"], equipos: ["c"] });
  });

  it("desmarca una categoria que ya estaba en ese grupo", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), operacion: ["a", "c"] };
    expect(alternarCategoria(sel, "operacion", "c")).toEqual({ ...vacia(), operacion: ["a"] });
  });

  it("exclusion mutua: no mueve una categoria marcada en cualquier otro grupo", () => {
    const sel: Seleccion<Bucket> = { ...vacia(), mano_obra: ["a"] };
    for (const g of ["cr", "equipos", "operacion"] as const) {
      expect(alternarCategoria(sel, g, "a")).toBe(sel);
    }
  });

  it("quitar con la X desclasifica la categoria, tambien si esta inactiva", () => {
    // La X de cada etiqueta llama a alternarCategoria con el grupo actual de la
    // categoria: es el unico camino para liberar una inactiva, que no sale en los
    // desplegables.
    const sel: Seleccion<Bucket> = { ...vacia(), cr: ["b-inactiva"], equipos: ["a"] };
    const sinB = alternarCategoria(sel, grupoDe(sel, "b-inactiva")!, "b-inactiva");
    expect(sinB).toEqual({ ...vacia(), equipos: ["a"] });
    expect(grupoDe(sinB, "b-inactiva")).toBeNull();
  });
});

describe("haCambiado", () => {
  it("el mismo contenido en otro orden no es un cambio", () => {
    expect(
      haCambiado({ ...vacia(), cr: ["a", "b"], operacion: ["c"] }, { ...vacia(), cr: ["b", "a"], operacion: ["c"] })
    ).toBe(false);
  });

  it("marcar en cualquiera de los cuatro grupos es un cambio", () => {
    const inicial = vacia();
    for (const g of BUCKETS) {
      expect(haCambiado(inicial, alternarCategoria(inicial, g, "x"))).toBe(true);
    }
  });

  it("volver al estado de partida deja de ser un cambio", () => {
    const inicial: Seleccion<Bucket> = { ...vacia(), equipos: ["a"] };
    const ida = alternarCategoria(inicial, "equipos", "a");
    const vuelta = alternarCategoria(ida, "equipos", "a");
    expect(haCambiado(inicial, vuelta)).toBe(false);
  });
});
