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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// bytea para avatares (Drizzle no tiene tipo nativo)
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ───────────────────────── Enums ─────────────────────────
export const userRole = pgEnum("user_role", ["admin", "editor", "viewer", "lector"]);
export const recordType = pgEnum("record_type", ["SALES_ORDER", "INVOICE"]);
export const billingCycle = pgEnum("billing_cycle", ["monthly", "annual", "quarterly", "one-time"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "paused", "cancelled", "trial"]);
export const subscriptionCategory = pgEnum("subscription_category", [
  "Marketing", "Development", "Design", "HR", "Finance", "Operations",
  "Communication", "Analytics", "Security", "Infrastructure", "General",
]);

// ──────────────────── better-auth (ids uuid) ────────────────────
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
});

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
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── Dominio ─────────────────────────
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  taxId: text("tax_id"),
  country: text("country"),
  industry: text("industry"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// profiles 1:1 con user (email/nombre viven en user)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  role: userRole("role").notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  isApproved: boolean("is_approved").notNull().default(false),
  isRejected: boolean("is_rejected").default(false),
  rejectionReason: text("rejection_reason"),
  avatar: bytea("avatar"),
  avatarMime: text("avatar_mime"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3b82f6"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categoryGroups = pgTable("category_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [check("category_groups_name_check", sql`char_length(${t.name}) > 0`)]);

export const categoryGroupMappings = pgTable("category_group_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => categoryGroups.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
});

export const salesRecords = pgTable("sales_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
  recordType: recordType("record_type").notNull().default("SALES_ORDER"),
  amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull().default("0"),
  recordMonth: integer("record_month").notNull(),
  recordYear: integer("record_year").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => user.id),
  updatedBy: uuid("updated_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("sales_records_record_month_check", sql`${t.recordMonth} >= 1 AND ${t.recordMonth} <= 12`)]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  provider: text("provider"),
  category: subscriptionCategory("category").notNull().default("General"),
  description: text("description"),
  monthlyCostUsd: numeric("monthly_cost_usd", { precision: 15, scale: 2 }).notNull().default("0"),
  billingCycle: billingCycle("billing_cycle").notNull().default("monthly"),
  annualCostUsd: numeric("annual_cost_usd", { precision: 15, scale: 2 }),
  status: subscriptionStatus("status").notNull().default("active"),
  renewalDate: date("renewal_date"),
  startDate: date("start_date").notNull().default(sql`CURRENT_DATE`),
  cancelDate: date("cancel_date"),
  url: text("url"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
