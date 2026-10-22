import { describe, it, expect } from "vitest";
import { parseDashboardLayout, DEFAULT_LAYOUT, WIDGET_IDS } from "@/lib/dashboard-layout";

const valid = [{ id: "kpi-ov", x: 0, y: 0, w: 3, h: 3 }];

describe("parseDashboardLayout", () => {
  it("estado válido → items", () => {
    expect(parseDashboardLayout({ items: valid })).toEqual(valid);
  });
  it("acepta un array pelado", () => {
    expect(parseDashboardLayout(valid)).toEqual(valid);
  });
  it("descarta ids que no existen en el registro", () => {
    const r = parseDashboardLayout({ items: [...valid, { id: "no-existe", x: 0, y: 3, w: 3, h: 3 }] });
    expect(r).toEqual(valid);
  });
  it("campos no numéricos → null", () => {
    expect(parseDashboardLayout({ items: [{ id: "kpi-ov", x: "a", y: 0, w: 3, h: 3 }] })).toBeNull();
  });
  it("null / no-objeto → null", () => {
    expect(parseDashboardLayout(null)).toBeNull();
    expect(parseDashboardLayout("x")).toBeNull();
  });
  it("array vacío → []", () => {
    expect(parseDashboardLayout({ items: [] })).toEqual([]);
  });
  it("ids repetidos → se queda el primero", () => {
    const r = parseDashboardLayout({
      items: [...valid, { id: "kpi-ov", x: 6, y: 6, w: 2, h: 2 }, { id: "kpi-fac", x: 3, y: 0, w: 3, h: 3 }],
    });
    expect(r).toEqual([...valid, { id: "kpi-fac", x: 3, y: 0, w: 3, h: 3 }]);
  });
  it("nunca devuelve más items que widgets hay en el catálogo", () => {
    const flood = Array.from({ length: 5000 }, (_, i) => ({ id: WIDGET_IDS[i % WIDGET_IDS.length], x: 0, y: i, w: 1, h: 1 }));
    const r = parseDashboardLayout({ items: flood });
    expect(r).toHaveLength(WIDGET_IDS.length);
    expect(new Set(r!.map((i) => i.id)).size).toBe(WIDGET_IDS.length);
  });
  it("DEFAULT_LAYOUT sólo referencia ids del registro", () => {
    expect(parseDashboardLayout({ items: DEFAULT_LAYOUT })).toEqual(DEFAULT_LAYOUT);
  });
});
