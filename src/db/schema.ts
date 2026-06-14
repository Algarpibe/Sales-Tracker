import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  customType,
  check,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// bytea para avatares (Drizzle no tiene tipo nativo)
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// timestamps de dominio: mode:"string" → Drizzle devuelve ISO strings (como esperaban los tipos de la app)
const tsString = { withTimezone: true, mode: "string" as const };

// ───────────────────────── Enums ─────────────────────────
export const userRole = pgEnum("user_role", ["admin", "editor", "viewer", "lector"]);
export const recordType = pgEnum("record_type", ["SALES_ORDER", "INVOICE"]);
export const billingCycle = pgEnum("billing_cycle", ["monthly", "annual", "quarterly", "one-time"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "paused", "cancelled", "trial"]);
export const subscriptionCategory = pgEnum("subscription_category", [
  "Marketing", "Development", "Design", "HR", "Finance", "Operations",
  "Communication", "Analytics", "Security", "Infrastructure", "General",
]);

// ──────────── better-auth (property keys = campos better-auth, camelCase; timestamps Date) ────────────
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("idx_session_user").on(t.userId)]);

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_account_user").on(t.userId)]);

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────── Dominio (property keys snake_case = nombres de columna; timestamps string) ───────────
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tax_id: text("tax_id"),
  country: text("country"),
  industry: text("industry"),
  logo_url: text("logo_url"),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
});

// profiles 1:1 con user (email/nombre viven en user)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: userRole("role").notNull().default("viewer"),
  is_active: boolean("is_active").notNull().default(true),
  is_approved: boolean("is_approved").notNull().default(false),
  is_rejected: boolean("is_rejected").notNull().default(false),
  rejection_reason: text("rejection_reason"),
  avatar: bytea("avatar"),
  avatar_mime: text("avatar_mime"),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [index("idx_profiles_company").on(t.company_id)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3b82f6"),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [unique("categories_company_name_unique").on(t.company_id, t.name)]);

export const categoryGroups = pgTable("category_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  color: text("color"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  check("category_groups_name_check", sql`char_length(${t.name}) > 0`),
  unique("category_groups_company_id_name_key").on(t.company_id, t.name),
]);

export const categoryGroupMappings = pgTable("category_group_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  group_id: uuid("group_id").notNull().references(() => categoryGroups.id, { onDelete: "cascade" }),
  category_id: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (t) => [
  index("idx_cgm_company_group").on(t.company_id, t.group_id),
  index("idx_cgm_category").on(t.category_id),
]);

export const salesRecords = pgTable("sales_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  category_id: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
  record_type: recordType("record_type").notNull().default("SALES_ORDER"),
  amount_usd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull().default("0"),
  record_month: integer("record_month").notNull(),
  record_year: integer("record_year").notNull(),
  notes: text("notes"),
  created_by: uuid("created_by").references(() => user.id),
  updated_by: uuid("updated_by").references(() => user.id),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [
  check("sales_records_record_month_check", sql`${t.record_month} >= 1 AND ${t.record_month} <= 12`),
  unique("sales_records_unique_period").on(t.company_id, t.category_id, t.record_type, t.record_month, t.record_year),
  index("idx_sales_company_year_month").on(t.company_id, t.record_year, t.record_month),
  index("idx_sales_company_type").on(t.company_id, t.record_type),
  index("idx_sales_category").on(t.category_id),
  index("idx_sales_created_by").on(t.created_by),
  index("idx_sales_updated_by").on(t.updated_by),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  tool_name: text("tool_name").notNull(),
  provider: text("provider"),
  category: subscriptionCategory("category").notNull().default("General"),
  description: text("description"),
  monthly_cost_usd: numeric("monthly_cost_usd", { precision: 15, scale: 2 }).notNull().default("0"),
  billing_cycle: billingCycle("billing_cycle").notNull().default("monthly"),
  annual_cost_usd: numeric("annual_cost_usd", { precision: 15, scale: 2 }),
  status: subscriptionStatus("status").notNull().default("active"),
  renewal_date: date("renewal_date"),
  start_date: date("start_date").notNull().default(sql`CURRENT_DATE`),
  cancel_date: date("cancel_date"),
  url: text("url"),
  logo_url: text("logo_url"),
  created_at: timestamp("created_at", tsString).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tsString).notNull().defaultNow(),
}, (t) => [index("idx_subscriptions_company_created").on(t.company_id, t.created_at)]);
