import { describe, it, expect } from "vitest";
import {
  BUCKETS,
  BUCKET_COLORS,
  BUCKET_LABELS,
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
  customerItemToExcel,
  mapaMacroCategorias,
  type Bucket,
} from "@/lib/customer-item";
import type { CustomerItemRow, MacroCategoria } from "@/types/database";

const cat = (name: string, macro_categoria: Bucket | null, is_active = true): MacroCategoria =>
  ({ id: name, name, is_active, macro_categoria });

const rows: CustomerItemRow[] = [
  { customer: "Beta", sku: "A", marca: "Horiba Ltd.", nombre: "Scrubber", categoria: "C&R AP Series", cantidad: 1, importe: 100 },
  { customer: "Beta", sku: "B", marca: "Ambientalia", nombre: "Calibración Enviro", categoria: "CAL PM", cantidad: 2, importe: 300 },
  { customer: "Alpha", sku: "C", marca: "Grimm", nombre: "EDM 180C", categoria: "EDM180 Series", cantidad: 1, importe: 500 },
  { customer: "Alpha", sku: "D", marca: "Ambientalia", nombre: "Mantenimiento", categoria: "Operación de Redes", cantidad: 1, importe: 50 },
];

// Clasificación de prueba: la que sembraría la migración 0013 para estos nombres.
const mapa = mapaMacroCategorias([
  cat("C&R AP Series", "cr"),
  cat("C&R EDM 180", "cr"),
  cat("CAL PM", "mano_obra"),
  cat("Operación de Redes", "operacion"),
]);

describe("BUCKET_LABELS", () => {
  it("usa los nombres de la spec en graficos y exportaciones", () => {
    expect(BUCKET_LABELS).toEqual({
      mano_obra: "Mano de obra",
      cr: "Consumibles y repuestos",
      equipos: "Equipos",
      operacion: "Operaciones",
    });
  });
});

describe("mapaMacroCategorias", () => {
  it("incluye las marcadas, tambien las inactivas, y deja fuera las no marcadas", () => {
    const m = mapaMacroCategorias([
      cat("CAL PM", "mano_obra"),
      cat("C&R Vieja", "cr", false),
      cat("Accesorios", null),
      cat("Equipos X", "equipos"),
    ]);
    expect(m.get("c&r vieja")).toBe("cr");
    expect(m.get("equipos x")).toBe("equipos");
    expect(m.has("accesorios")).toBe(false);
    expect(m.size).toBe(3);
  });

  it("indexa por nombre en minusculas, como casa getSalesData los nombres del hub", () => {
    const m = mapaMacroCategorias([cat("Operación de Redes", "operacion")]);
    expect([...m.keys()]).toEqual(["operación de redes"]);
  });

  it("ignora un valor inesperado de la columna", () => {
    expect(mapaMacroCategorias([cat("Rara", "xx" as never)]).size).toBe(0);
  });
});

describe("bucketForCategory", () => {
  it("devuelve la macro-categoria del mapa", () => {
    expect(bucketForCategory("C&R AP Series", mapa)).toBe("cr");
    expect(bucketForCategory("CAL PM", mapa)).toBe("mano_obra");
    expect(bucketForCategory("Operación de Redes", mapa)).toBe("operacion");
  });

  it("sin entrada en el mapa o sin categoria cuenta como Equipos", () => {
    expect(bucketForCategory("EDM180 Series", mapa)).toBe("equipos");
    // Ya no manda el prefijo: un «C&R …» que no está marcado es Equipos.
    expect(bucketForCategory("C&R Sin Marcar", mapa)).toBe("equipos");
    expect(bucketForCategory(null, mapa)).toBe("equipos");
    expect(bucketForCategory("CAL PM", new Map())).toBe("equipos");
  });

  it("casa el nombre sin distinguir mayusculas", () => {
    expect(bucketForCategory("c&r ap series", mapa)).toBe("cr");
  });
});

describe("coherencia con la migracion 0013", () => {
  // Copia literal de las reglas de nombre que tenía bucketForCategory antes de esta spec.
  function reglasAntiguas(categoria: string | null): Bucket {
    if (categoria) {
      if (categoria.startsWith("C&R ")) return "cr";
      if (categoria.startsWith("CAL ") || categoria === "ST" || categoria.startsWith("ST ") || categoria === "Alquileres") {
        return "mano_obra";
      }
      if (categoria === "Operación de Redes" || categoria === "Consultoría") return "operacion";
    }
    return "equipos";
  }

  // Lo que marca cada UPDATE de drizzle/0013_macro_categoria.sql, en su orden.
  // LIKE 'X %' equivale a startsWith("X ").
  function marcaDeLaMigracion(nombre: string): Bucket | null {
    if (nombre.startsWith("C&R ")) return "cr";
    if (nombre.startsWith("CAL ") || nombre === "ST" || nombre.startsWith("ST ") || nombre === "Alquileres") {
      return "mano_obra";
    }
    if (nombre === "Operación de Redes" || nombre === "Consultoría") return "operacion";
    return null;
  }

  it("el mapa sembrado por la migracion clasifica igual que las reglas de nombre", () => {
    const nombres = [
      "C&R AP Series", "C&R EDM 180", "C&R", "CAL PM", "CAL NOx", "CALIBRACION", "ST", "ST EDM 180",
      "STX", "Alquileres", "Operación de Redes", "Consultoría", "EDM180 Series", "Accesorios",
    ];
    const sembrado = mapaMacroCategorias(nombres.map((n) => cat(n, marcaDeLaMigracion(n))));
    for (const n of [...nombres, null]) {
      expect(bucketForCategory(n, sembrado)).toBe(reglasAntiguas(n));
    }
  });
});

describe("filterRows", () => {
  it("filtra por customer/sku/nombre (case-insensitive)", () => {
    expect(filterRows(rows, "alpha").length).toBe(2);
    expect(filterRows(rows, "scrubber").map((r) => r.sku)).toEqual(["A"]);
    expect(filterRows(rows, "").length).toBe(4);
  });
});

describe("groupByCustomer", () => {
  it("agrupa, subtotales por bucket, orden alfabético + items por importe desc", () => {
    const g = groupByCustomer(rows, mapa);
    expect(g.map((x) => x.customer)).toEqual(["Alpha", "Beta"]);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 500, operacion: 50 });
    expect(g[0].items.map((i) => i.sku)).toEqual(["C", "D"]);
    expect(g[1].totals).toEqual({ mano_obra: 300, cr: 100, equipos: 0, operacion: 0 });
    expect(g[1].items.map((i) => i.sku)).toEqual(["B", "A"]);
  });

  it("reparte segun el mapa: cambiar la clasificacion cambia los totales", () => {
    const otro = mapaMacroCategorias([cat("EDM180 Series", "operacion")]);
    const g = groupByCustomer(rows, otro);
    expect(g[0].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 50, operacion: 500 });
    expect(g[1].totals).toEqual({ mano_obra: 0, cr: 0, equipos: 400, operacion: 0 });
  });
});

describe("computeGrandTotals", () => {
  it("suma los 4 buckets", () => {
    expect(computeGrandTotals(groupByCustomer(rows, mapa))).toEqual({ mano_obra: 300, cr: 100, equipos: 500, operacion: 50 });
  });
});

describe("customerItemToCsv", () => {
  it("cabecera + fila por cliente + artículos + TOTAL", () => {
    const groups = groupByCustomer(rows, mapa);
    const csv = customerItemToCsv(groups, computeGrandTotals(groups), mapa);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("SKU;Marca;Nombre;Categoría;Cantidad;Mano de obra;Consumibles y repuestos;Equipos;Operaciones");
    expect(lines[1]).toBe("Alpha;;;;;0.00;0.00;500.00;50.00");
    expect(lines[2]).toBe("C;Grimm;EDM 180C;EDM180 Series;1;;;500.00;");
    expect(lines[lines.length - 1]).toBe("TOTAL;;;;;300.00;100.00;500.00;50.00");
  });
});

describe("customerItemToExcel", () => {
  it("cabecera de grupo bold, buckets por columna y total bold", () => {
    const groups = [
      {
        customer: "Acme",
        items: [
          { customer: "Acme", sku: "1", marca: "M", nombre: "uno", categoria: "C&R EDM 180", cantidad: 1, importe: 100 },
          { customer: "Acme", sku: "2", marca: null, nombre: "dos", categoria: "CAL PM", cantidad: 3, importe: 40 },
        ],
        totals: { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 },
      },
    ];
    const grand = { mano_obra: 40, cr: 100, equipos: 0, operacion: 0 };
    const sheet = customerItemToExcel(groups, grand, mapa);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "SKU", "Marca", "Nombre", "Categoría", "Cantidad", "Mano de obra", "Consumibles y repuestos", "Equipos", "Operaciones",
    ]);
    expect(sheet.rows[0].bold).toBe(true);
    expect(sheet.rows[0].cells).toEqual(["Acme", "", "", "", "", 40, 100, 0, 0]);
    expect(sheet.rows[1].cells).toEqual(["1", "M", "uno", "C&R EDM 180", 1, null, 100, null, null]);
    expect(sheet.rows[2].cells).toEqual(["2", "", "dos", "CAL PM", 3, 40, null, null, null]);
    const total = sheet.rows[sheet.rows.length - 1];
    expect(total.bold).toBe(true);
    expect(total.cells).toEqual(["TOTAL", "", "", "", "", 40, 100, 0, 0]);
  });
});

describe("BUCKET_COLORS", () => {
  it("da un color hexadecimal a cada macro-categoría y a ninguna más", () => {
    for (const b of BUCKETS) expect(BUCKET_COLORS[b]).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(BUCKET_COLORS).sort()).toEqual([...BUCKETS].sort());
  });

  it("conserva los colores que ya usaban las tarjetas de mezcla", () => {
    expect(BUCKET_COLORS).toEqual({
      mano_obra: "#6366f1",
      cr: "#10b981",
      equipos: "#f59e0b",
      operacion: "#ef4444",
    });
  });
});
