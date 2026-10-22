import type { RecordType } from "@/types/database";

// Fragmentos de SQL compartidos por las consultas de src/db/hub-*.ts (AI-081).
// Módulo PURO: sin server-only ni pool, para poder probarlo y reutilizarlo sin BD.
//
// Todo lo que sale de aquí son IDENTIFICADORES y EXPRESIONES fijados en el código
// (tablas, columnas, alias). Nunca se interpola entrada de usuario: los valores
// siguen viajando como parámetros $1, $2…

/** Tablas de líneas y cabecera de cada tipo de registro de Zoho Books en el hub. */
export const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export type HubSource = (typeof SOURCES)[keyof typeof SOURCES];

/**
 * Tablas para un tipo elegido en servidor. BACKLOG no tiene tablas propias: cualquier
 * valor distinto de SALES_ORDER lee facturas (INVOICE).
 */
export function sourceFor(tipo: RecordType): HubSource {
  return tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
}

/**
 * Importe neto de UNA línea: bcy_rate * cantidad menos la parte proporcional del
 * descuento de cabecera (bcy_discount_total / bcy_sub_total). Sin descuento o con
 * subtotal 0, el factor es 1. Es la fórmula validada al céntimo contra Zoho.
 * `line` y `header` son alias de tabla escritos en el código, nunca entrada de usuario.
 */
export function netAmountExpr(line: string, header: string): string {
  return `${line}.bcy_rate * ${line}.quantity * COALESCE(1 - COALESCE((${header}.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(${header}.bcy_sub_total, 0), 1)`;
}

/** Suma del importe neto redondeada a 2 decimales, como float8 (número en JS). */
export function netAmountSumExpr(line: string, header: string): string {
  return `round(sum(${netAmountExpr(line, header)})::numeric, 2)::float8`;
}
