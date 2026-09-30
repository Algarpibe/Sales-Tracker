import { describe, it, expect } from "vitest";
import { filterCategoryRows, groupByCustomerCategory } from "@/lib/customer-category";
import { computeGrandTotals, groupByCustomer, mapaMacroCategorias } from "@/lib/customer-item";
import type { Bucket, CustomerItemRow, MacroCategoria } from "@/types/database";

const cat = (name: string, macro_categoria: Bucket | null): MacroCategoria =>
  ({ id: name, name, is_active: true, macro_categoria });

// Clasificación de prueba: EDM180 Series no está marcada y cuenta como Equipos.
const mapa = mapaMacroCategorias([
  cat("CAL PM", "mano_obra"),
  cat("C&R AP Series", "cr"),
  cat("Operación de Redes", "operacion"),
]);

const rows: CustomerItemRow[] = [
  { customer: "Beta", sku: "A", marca: "Horiba Ltd.", nombre: "Scrubber", categoria: "C&R AP Series", cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "B", marca: "Ambientalia", nombre: "Calibración Enviro", categoria: "CAL PM", cantidad: 2, importe: 300 },
  { customer: "Beta", sku: "E", marca: "Ambientalia", nombre: "Calibración NOx", categoria: "CAL PM", cantidad: 3, importe: 150 },
  { customer: "Alpha", sku: "C", marca: "Grimm", nombre: "EDM 180C", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
  { customer: "Alpha", sku: "D", marca: "Ambientalia", nombre: "Mantenimiento", categoria: "Operación de Redes", cantidad: 1, importe: 50 },
  { customer: "Alpha", sku: "F", marca: null, nombre: "Flete", categoria: null, cantidad: 2, importe: 20 },
  { customer: "Alpha", sku: "G", marca: null, nombre: "Embalaje", categoria: null, cantidad: 1, importe: 5 },
];

describe("groupByCustomerCategory", () => {
  it("suma cantidad e importe de los articulos de la misma categoria en una fila", () => {
    const beta = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Beta")!;
    expect(beta.categorias.filter((c) => c.categoria === "CAL PM")).toEqual([
      { categoria: "CAL PM", bucket: "mano_obra", cantidad: 5, importe: 450 },
    ]);
  });

  it("las ventas sin categoria forman una sola fila", () => {
    const alpha = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Alpha")!;
    expect(alpha.categorias.filter((c) => c.categoria === null)).toEqual([
      { categoria: null, bucket: "equipos", cantidad: 3, importe: 25 },
    ]);
  });

  it("la macro-categoria sale del mapa y sin entrada cuenta como Equipos", () => {
    const alpha = groupByCustomerCategory(rows, mapa).find((g) => g.customer === "Alpha")!;
    const bucketDe = (nombre: string | null) => alpha.categorias.find((c) => c.categoria === nombre)!.bucket;
    expect(bucketDe("Operación de Redes")).toBe("operacion");
    expect(bucketDe("EDM180 Series")).toBe("equipos");

    // Con el mapa vacío todo cae en Equipos.
    for (const g of groupByCustomerCategory(rows, new Map())) {
      expect(g.categorias.every((c) => c.bucket === "equipos")).toBe(true);
    }
  });

  // Las dos secciones leen las mismas filas: si un cliente sumara distinto aquí que en
  // «Cliente × Artículo», una de las dos pantallas estaría mintiendo.
  it("los totales de cada cliente coinciden con los de groupByCustomer", () => {
    for (const m of [mapa, new Map<string, Bucket>()]) {
      const porCategoria = groupByCustomerCategory(rows, m);
      const porArticulo = groupByCustomer(rows, m);
      expect(porCategoria.map((g) => g.customer)).toEqual(porArticulo.map((g) => g.customer));
      expect(porCategoria.map((g) => g.totals)).toEqual(porArticulo.map((g) => g.totals));
      expect(computeGrandTotals(porCategoria)).toEqual(computeGrandTotals(porArticulo));
    }
  });

  it("ordena los clientes alfabeticamente y las categorias por importe desc, con sus totales", () => {
    const g = groupByCustomerCategory(rows, mapa);
    expect(g.map((x) => x.customer)).toEqual(["Alpha", "Beta"]);
    expect(g[0].categorias.map((c) => c.categoria)).toEqual(["EDM180 Series", "Operación de Redes", null]);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 525, operacion: 50 });
    expect(g[1].categorias.map((c) => c.categoria)).toEqual(["CAL PM", "C&R AP Series"]);
    expect(g[1].totals).toEqual({ mano_obra: 450, cr: 100, equipos: 0, operacion: 0 });
  });
});

describe("computeGrandTotals con grupos por categoria", () => {
  it("suma los 4 buckets", () => {
    expect(computeGrandTotals(groupByCustomerCategory(rows, mapa))).toEqual({
      mano_obra: 450, cr: 100, equipos: 525, operacion: 50,
    });
  });
});

describe("filterCategoryRows", () => {
  it("filtra por cliente o por categoria, sin distinguir mayusculas", () => {
    expect(filterCategoryRows(rows, "alpha").length).toBe(4);
    expect(filterCategoryRows(rows, "  cal pm ").map((r) => r.sku)).toEqual(["B", "E"]);
    expect(filterCategoryRows(rows, "").length).toBe(7);
  });

  it("no busca por nombre de articulo ni por SKU", () => {
    expect(filterCategoryRows(rows, "scrubber")).toEqual([]);
  });
});
