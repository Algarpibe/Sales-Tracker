import { BUCKETS, bucketForCategory, BUCKET_LABELS, type Bucket } from "@/lib/customer-item";

export type InsightRecord = {
  category_id: string;
  record_type: string;
  record_month: number;
  amount_usd: number | string;
};

// Serie acumulada length-12 (índice 0 = Ene) del record_type dado.
export function cumulativeSeries(records: InsightRecord[], recordType: string): number[] {
  const monthly = new Array<number>(12).fill(0);
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const m = r.record_month;
    if (m >= 1 && m <= 12) monthly[m - 1] += Number(r.amount_usd);
  }
  const cum: number[] = [];
  let run = 0;
  for (let i = 0; i < 12; i++) { run += monthly[i]; cum.push(run); }
  return cum;
}

export function executionByMonth(
  monthly: { month: string; sales_orders: number; invoices: number }[]
): { month: string; pct: number }[] {
  return monthly.map((m) => ({
    month: m.month,
    pct: m.sales_orders > 0 ? (m.invoices / m.sales_orders) * 100 : 0,
  }));
}

/**
 * `catMap` traduce el id de categoría de cada venta a su nombre; `mapa` (de
 * mapaMacroCategorias) traduce ese nombre a su macro-categoría.
 */
export function bucketMix(
  records: InsightRecord[],
  catMap: Map<string, string>,
  mapa: Map<string, Bucket>,
  recordType: string
): { bucket: Bucket; label: string; amount: number; pct: number }[] {
  const sums = new Map<Bucket, number>(BUCKETS.map((b) => [b, 0]));
  let total = 0;
  for (const r of records) {
    if (r.record_type !== recordType) continue;
    const b = bucketForCategory(catMap.get(r.category_id) ?? null, mapa);
    const amt = Number(r.amount_usd);
    sums.set(b, (sums.get(b) ?? 0) + amt);
    total += amt;
  }
  return BUCKETS.map((b) => {
    const amount = sums.get(b) ?? 0;
    return { bucket: b, label: BUCKET_LABELS[b], amount, pct: total > 0 ? (amount / total) * 100 : 0 };
  });
}

// Top N clientes por ventas + % acumulado sobre el total GENERAL (Pareto).
export function topCustomers(
  rows: { customer: string; ventas: number }[],
  n: number
): { customer: string; amount: number; cumPct: number }[] {
  const byCustomer = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const v = Number(r.ventas);
    byCustomer.set(r.customer, (byCustomer.get(r.customer) ?? 0) + v);
    total += v;
  }
  const sorted = Array.from(byCustomer.entries())
    .map(([customer, amount]) => ({ customer, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
  let run = 0;
  return sorted.map((r) => {
    run += r.amount;
    return { customer: r.customer, amount: r.amount, cumPct: total > 0 ? (run / total) * 100 : 0 };
  });
}

export function yoyChange(a: number, b: number): number | null {
  if (b <= 0) return null;
  return ((a - b) / b) * 100;
}
