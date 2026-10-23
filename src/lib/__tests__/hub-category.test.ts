import { describe, it, expect } from "vitest";
import { findByHubCategoryName, indexCategoriesByName } from "@/lib/hub-category";

const cats = [
  { id: "1", name: "Equipos", color: "#111" },
  { id: "2", name: "Servicio Técnico", color: "#222" },
];

describe("indexCategoriesByName / findByHubCategoryName", () => {
  it("casa la categoría del hub con la de la app sin distinguir mayúsculas", () => {
    const idx = indexCategoriesByName(cats);
    expect(findByHubCategoryName(idx, "EQUIPOS")?.id).toBe("1");
    expect(findByHubCategoryName(idx, "servicio técnico")?.id).toBe("2");
  });

  it("devuelve undefined si la categoría del hub no existe en la app", () => {
    expect(findByHubCategoryName(indexCategoriesByName(cats), "Otra")).toBeUndefined();
  });
});
