import { describe, it, expect } from "vitest";
import {
  customerPredicate,
  netAmountExpr,
  netAmountSumExpr,
  SOURCES,
  sourceFor,
  yearRangeExpr,
  yearSpanExpr,
} from "@/db/hub-sql";

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

describe("yearRangeExpr (DATA-045)", () => {
  it("un año natural como rango semiabierto sobre la columna, sin envolverla", () => {
    expect(yearRangeExpr("h.date", "$1")).toBe("h.date >= make_date($1::int, 1, 1) AND h.date < make_date($1::int + 1, 1, 1)");
  });
});

describe("yearSpanExpr (DATA-045)", () => {
  it("de enero del primer año a fin de diciembre del último, ambos incluidos", () => {
    expect(yearSpanExpr("h.date", "$1", "$2")).toBe(
      "h.date >= make_date($1::int, 1, 1) AND h.date < make_date($2::int + 1, 1, 1)",
    );
  });
});

describe("customerPredicate (DATA-046)", () => {
  it("sin cliente no añade predicado ni parámetro", () => {
    const params: unknown[] = [2025];
    expect(customerPredicate(params, undefined)).toBe("");
    expect(params).toEqual([2025]);
  });

  it("con cliente lo añade como el siguiente parámetro, nunca interpolado", () => {
    const params: unknown[] = [2015, 2025];
    expect(customerPredicate(params, "Cliente 'A'; DROP")).toBe("AND h.customer_name = $3");
    expect(params).toEqual([2015, 2025, "Cliente 'A'; DROP"]);
  });

  it("una cadena vacía también filtra (no equivale a 'sin cliente')", () => {
    const params: unknown[] = [];
    expect(customerPredicate(params, "")).toBe("AND h.customer_name = $1");
    expect(params).toEqual([""]);
  });
});
