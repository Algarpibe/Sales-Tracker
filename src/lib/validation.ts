import { z } from "zod";
import {
  userRole,
  recordType,
  subscriptionCategory,
  billingCycle,
  subscriptionStatus,
} from "@/db/schema";

// Esquemas reutilizables para validar input de Server Actions en runtime
// (TypeScript no valida en runtime). Los enums se derivan del schema Drizzle
// para que coincidan siempre con la BD.

export const uuidSchema = z.string().uuid("ID inválido");
export const roleSchema = z.enum(userRole.enumValues);
export const recordTypeSchema = z.enum(recordType.enumValues);
export const subCategorySchema = z.enum(subscriptionCategory.enumValues);
export const billingCycleSchema = z.enum(billingCycle.enumValues);
export const subStatusSchema = z.enum(subscriptionStatus.enumValues);

const currentYear = new Date().getFullYear();

export const salesRecordSchema = z.object({
  category_id: uuidSchema,
  record_type: recordTypeSchema,
  amount_usd: z.number().finite().min(0).max(1_000_000_000),
  record_month: z.number().int().min(1).max(12),
  record_year: z.number().int().min(2000).max(currentYear + 1),
  notes: z.string().max(2000).optional(),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido").optional(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido").optional(),
  is_active: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email("Email inválido").max(200).optional(),
});

export const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  tax_id: z.string().max(50).nullish(),
  country: z.string().max(100).nullish(),
  industry: z.string().max(100).nullish(),
  logo_url: z.string().max(2000).nullish(),
});

const money = z.number().finite().min(0).max(1_000_000_000);

export const subscriptionCreateSchema = z.object({
  tool_name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  provider: z.string().max(200).optional(),
  category: subCategorySchema,
  description: z.string().max(1000).optional(),
  monthly_cost_usd: money,
  billing_cycle: billingCycleSchema,
  status: subStatusSchema,
  start_date: z.string().min(1),
  url: z.string().max(2000).optional(),
});

export const subscriptionUpdateSchema = z.object({
  tool_name: z.string().trim().min(1).max(200).optional(),
  provider: z.string().max(200).optional(),
  category: subCategorySchema.optional(),
  description: z.string().max(1000).optional(),
  monthly_cost_usd: money.optional(),
  billing_cycle: billingCycleSchema.optional(),
  status: subStatusSchema.optional(),
  cancel_date: z.string().optional(),
  url: z.string().max(2000).optional(),
});
