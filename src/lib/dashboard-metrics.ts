import { MONTHS } from "@/lib/constants";

// Entrada mínima (estructuralmente compatible con SalesRecord / Category).
type MetricRecord = {
  category_id: string;
  record_type: string;
  record_month: number;
  record_year: number;
  amount_usd: number | string;
};
type MetricCategory = { id: string; name: string };

export interface DashboardMetrics {
  sales_orders: number;
  invoices: number;
  avg_ticket: number;
  conversion: number;
  backlog: number;
  execution_rate: number;
  aging: { lowRisk: number; mediumRisk: number; highRisk: number; total: number };
  concentration: { categoryName: string; amount: number; percentage: number }[];
  monthly: { month: string; sales_orders: number; invoices: number }[];
}

// Lógica única de los dashboards (antes duplicada en home y kpis — F4-03).
// Backlog REAL = filas record_type='BACKLOG' (pendiente de facturar por orden,
// vía invoiced_status de Zoho). Aging por antigüedad de la orden; concentración
// por categoría.
export function computeDashboardMetrics(
  records: MetricRecord[],
  categories: MetricCategory[]
): DashboardMetrics {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const monthlyMap = new Map<string, { month: string; sales_orders: number; invoices: number }>();
  MONTHS.forEach((m) => monthlyMap.set(m.label, { month: m.label, sales_orders: 0, invoices: 0 }));

  let totalSales = 0;
  let totalInvoices = 0;
  let salesCount = 0;

  records.forEach((r) => {
    const amount = Number(r.amount_usd);
    const mLabel = MONTHS.find((m) => m.value === r.record_month)?.label;
    if (mLabel && monthlyMap.has(mLabel)) {
      const entry = monthlyMap.get(mLabel)!;
      if (r.record_type === "SALES_ORDER") {
        entry.sales_orders += amount;
        totalSales += amount;
        salesCount++;
      } else if (r.record_type === "INVOICE") {
        entry.invoices += amount;
        totalInvoices += amount;
      }
    }
  });

  const execution_rate = totalSales > 0 ? (totalInvoices / totalSales) * 100 : 0;

  const backlogRecords = records.filter((r) => r.record_type === "BACKLOG");
  const backlog = backlogRecords.reduce((s, r) => s + Number(r.amount_usd), 0);

  const currentYearDB = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  let lowRisk = 0;
  let mediumRisk = 0;
  let highRisk = 0;
  for (const r of backlogRecords) {
    const amount = Number(r.amount_usd);
    const ageMonths = (currentYearDB - r.record_year) * 12 + (currentMonth - r.record_month);
    const ageDays = Math.max(0, ageMonths * 30);
    if (ageDays <= 30) lowRisk += amount;
    else if (ageDays <= 90) mediumRisk += amount;
    else highRisk += amount;
  }

  const concentrationMap = new Map<string, number>();
  for (const r of backlogRecords) {
    const catId = r.category_id || "unassigned";
    concentrationMap.set(catId, (concentrationMap.get(catId) || 0) + Number(r.amount_usd));
  }
  const concentration = Array.from(concentrationMap.entries()).map(([catId, amount]) => ({
    categoryName: String(catId === "unassigned" ? "Sin Asignar" : catMap.get(catId) || "Desconocida"),
    amount,
    percentage: backlog > 0 ? (amount / backlog) * 100 : 0,
  }));

  return {
    sales_orders: totalSales,
    invoices: totalInvoices,
    avg_ticket: totalSales / (salesCount || 1),
    conversion: (totalInvoices / (totalSales || 1)) * 100,
    backlog,
    execution_rate,
    aging: { lowRisk, mediumRisk, highRisk, total: backlog },
    concentration,
    monthly: Array.from(monthlyMap.values()),
  };
}
