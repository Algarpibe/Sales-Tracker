import { describe, it, expect } from "vitest";
import { netAmountExpr, netAmountSumExpr, SOURCES, sourceFor } from "@/db/hub-sql";

describe("sourceFor", () => {
  it("SALES_ORDER lee órdenes de venta", () => {
    expect(sourceFor("SALES_ORDER")).toBe(SOURCES.SALES_ORDER);
  });
  it("INVOICE y BACKLOG leen facturas", () => {
    expect(sourceFor("INVOICE")).toBe(SOURCES.INVOICE);
    expect(sourceFor("BACKLOG")).toBe(SOURCES.INVOICE);
  });
});

describe("netAmountExpr", () => {
  it("usa los alias recibidos para la línea y la cabecera", () => {
    expect(netAmountExpr("l", "s")).toBe(
      "l.bcy_rate * l.quantity * COALESCE(1 - COALESCE((s.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(s.bcy_sub_total, 0), 1)",
    );
  });
  it("la suma redondea a 2 decimales y devuelve float8", () => {
    expect(netAmountSumExpr("l", "h")).toBe(`round(sum(${netAmountExpr("l", "h")})::numeric, 2)::float8`);
  });
});
