// ===== Tipos de Base de Datos =====

export type UserRole = "admin" | "editor" | "viewer";
export type RecordType = "SALES_ORDER" | "INVOICE";
export type BillingCycle = "monthly" | "annual" | "quarterly" | "one-time";
export type SubscriptionStatus = "active" | "paused" | "cancelled" | "trial";
export type SubscriptionCategory =
  | "Marketing"
  | "Development"
  | "Design"
  | "HR"
  | "Finance"
  | "Operations"
  | "Communication"
  | "Analytics"
  | "Security"
  | "Infrastructure"
  | "General";

export interface Company {
  id: string;
  name: string;
  tax_id: string | null;
  country: string | null;
  industry: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesRecord {
  id: string;
  company_id: string;
  category_id: string;
  record_type: RecordType;
  amount_usd: number;
  record_month: number;
  record_year: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  categories?: { name: string; color: string };
}

export interface Subscription {
  id: string;
  company_id: string;
  user_id: string;
  tool_name: string;
  provider: string | null;
  category: SubscriptionCategory;
  description: string | null;
  monthly_cost_usd: number;
  billing_cycle: BillingCycle;
  annual_cost_usd: number | null;
  status: SubscriptionStatus;
  renewal_date: string | null;
  start_date: string;
  cancel_date: string | null;
  url: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ===== Filtros =====

export interface SalesFilters {
  year?: number;
  month?: number;
  category_id?: string;
  record_type?: RecordType;
  search?: string;
}

export interface SubscriptionFilters {
  status?: SubscriptionStatus;
  category?: SubscriptionCategory;
  search?: string;
}

// ===== Vistas / Aggregates =====

export interface MonthlyTotal {
  company_id: string;
  record_type: RecordType;
  record_year: number;
  record_month: number;
  total_usd: number;
}

export interface AnnualByCategory {
  company_id: string;
  record_type: RecordType;
  record_year: number;
  category_id: string;
  category_name: string;
  total_usd: number;
}

export interface HistoricalByMonth {
  company_id: string;
  record_type: RecordType;
  record_month: number;
  category_id: string;
  category_name: string;
  total_usd: number;
  years_count: number;
  avg_usd: number;
}

// ===== Tabla de Ventas (pivotada por mes) =====

export interface SalesRowPivoted {
  category_id: string;
  category_name: string;
  category_color: string;
  record_type: RecordType;
  record_year: number;
  months: { [month: number]: number }; // 1-12 → amount
  total: number;
}

// ===== Category Groupings =====

export interface CategoryGroup {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  company_id: string;
  created_at: string;
  updated_at: string;
  // Joined
  mappings?: CategoryGroupMapping[];
}

export interface CategoryGroupMapping {
  id: string;
  group_id: string;
  category_id: string;
  company_id: string;
}

export interface GroupYearData {
  amount: number;
  percentage: number;
}

export interface GroupingAnalysisRow {
  groupId: string;
  groupName: string;
  color: string;
  years: Record<number, GroupYearData>; // year → {amount, percentage}
  average: GroupYearData;               // Promedio
}

export interface GroupingAnalysisResult {
  rows: GroupingAnalysisRow[];
  years: number[];
  yearTotals: Record<number, number>;   // year → grand total
}

