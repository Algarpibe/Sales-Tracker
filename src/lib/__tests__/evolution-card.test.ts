import { describe, it, expect } from "vitest";
import { seleccionInicialIds } from "@/lib/evolution-card";

const filas = ["a", "b", "c", "d"].map((groupId) => ({ groupId }));

describe("seleccionInicialIds", () => {
  it("con «primeras3» elige las tres primeras filas, en su orden", () => {
    expect(seleccionInicialIds(filas, "primeras3")).toEqual(["a", "b", "c"]);
  });

  it("con «primeras3» y menos de tres filas las elige todas", () => {
    expect(seleccionInicialIds(filas.slice(0, 2), "primeras3")).toEqual(["a", "b"]);
  });

  it("con «todas» elige todas las filas", () => {
    expect(seleccionInicialIds(filas, "todas")).toEqual(["a", "b", "c", "d"]);
  });
});
