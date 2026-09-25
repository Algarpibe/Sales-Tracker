import { describe, it, expect } from "vitest";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionInicial,
  type SeleccionServicioTecnico,
} from "@/lib/tech-service-selection";

describe("seleccionInicial", () => {
  it("reparte las categorias por su grupo guardado y respeta el orden", () => {
    const sel = seleccionInicial([
      { id: "a", tech_service_bucket: "st" },
      { id: "b", tech_service_bucket: "cr" },
      { id: "c", tech_service_bucket: null },
      { id: "d", tech_service_bucket: "st" },
    ]);
    expect(sel).toEqual({ st: ["a", "d"], cr: ["b"] });
  });

  it("sin categorias clasificadas los dos grupos quedan vacios", () => {
    expect(seleccionInicial([{ id: "a", tech_service_bucket: null }])).toEqual({ st: [], cr: [] });
  });
});

describe("grupoDe", () => {
  const sel: SeleccionServicioTecnico = { st: ["a"], cr: ["b"] };
  it("dice en que grupo esta una categoria, o null", () => {
    expect(grupoDe(sel, "a")).toBe("st");
    expect(grupoDe(sel, "b")).toBe("cr");
    expect(grupoDe(sel, "z")).toBeNull();
  });
});

describe("alternarCategoria", () => {
  it("marca una categoria libre en el grupo pedido", () => {
    expect(alternarCategoria({ st: ["a"], cr: [] }, "st", "c")).toEqual({ st: ["a", "c"], cr: [] });
    expect(alternarCategoria({ st: [], cr: [] }, "cr", "c")).toEqual({ st: [], cr: ["c"] });
  });

  it("desmarca una categoria que ya estaba en ese grupo", () => {
    expect(alternarCategoria({ st: ["a", "c"], cr: ["b"] }, "st", "c")).toEqual({ st: ["a"], cr: ["b"] });
  });

  it("no mueve una categoria que ya esta en el otro grupo: exclusion mutua", () => {
    const sel: SeleccionServicioTecnico = { st: ["a"], cr: ["b"] };
    expect(alternarCategoria(sel, "st", "b")).toBe(sel);
    expect(alternarCategoria(sel, "cr", "a")).toBe(sel);
  });

  it("no muta la seleccion recibida", () => {
    const sel: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    alternarCategoria(sel, "st", "c");
    alternarCategoria(sel, "st", "a");
    expect(sel).toEqual({ st: ["a"], cr: [] });
  });

  it("para mover de grupo hay que desmarcar primero y marcar despues", () => {
    let sel: SeleccionServicioTecnico = { st: [], cr: ["b"] };
    sel = alternarCategoria(sel, "cr", "b");
    sel = alternarCategoria(sel, "st", "b");
    expect(sel).toEqual({ st: ["b"], cr: [] });
  });

  it("quitar una etiqueta con la X desclasifica la categoria, tambien si esta inactiva", () => {
    // La tarjeta de Configuracion pone una X en cada etiqueta (spec 2026-09-25). Al pulsarla
    // llama a alternarCategoria con el grupo actual de la categoria: mismo camino que desmarcarla
    // desde el desplegable, asi una categoria inactiva ya clasificada tambien se puede liberar.
    const sel: SeleccionServicioTecnico = { st: ["a"], cr: ["b-inactiva"] };
    const sinB = alternarCategoria(sel, grupoDe(sel, "b-inactiva")!, "b-inactiva");
    expect(sinB).toEqual({ st: ["a"], cr: [] });
    expect(grupoDe(sinB, "b-inactiva")).toBeNull();
  });
});

describe("haCambiado", () => {
  it("el mismo contenido en otro orden no es un cambio", () => {
    expect(haCambiado({ st: ["a", "b"], cr: ["c"] }, { st: ["b", "a"], cr: ["c"] })).toBe(false);
  });

  it("marcar o desmarcar es un cambio", () => {
    const inicial: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    expect(haCambiado(inicial, alternarCategoria(inicial, "cr", "b"))).toBe(true);
    expect(haCambiado(inicial, alternarCategoria(inicial, "st", "a"))).toBe(true);
  });

  it("volver al estado de partida deja de ser un cambio", () => {
    const inicial: SeleccionServicioTecnico = { st: ["a"], cr: [] };
    const ida = alternarCategoria(inicial, "st", "a");
    const vuelta = alternarCategoria(ida, "st", "a");
    expect(haCambiado(inicial, vuelta)).toBe(false);
  });
});
