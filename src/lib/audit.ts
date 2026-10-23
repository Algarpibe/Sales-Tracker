import { logInfo } from "@/lib/logger";

// Rastro de auditoría de acciones administrativas (ARQ-078). Una línea JSON por evento
// con `event: "audit"` para poder filtrarla en los logs de EasyPanel/Docker. Solo
// identificadores y metadatos mínimos: NUNCA emails, nombres ni datos de clientes.
export type AuditAction =
  | "user.approve"
  | "user.role_update"
  | "user.deactivate"
  | "user.delete"
  | "company.update"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "category.tech_service_save"
  | "category.macro_save"
  | "grouping.create"
  | "grouping.update"
  | "grouping.delete"
  | "grouping.reorder"
  | "kpi_targets.save"
  | "project_order.add"
  | "project_order.remove"
  | "export.xlsx"
  | "auth.sign_in_failed";

export interface AuditInput {
  action: AuditAction;
  /** user.id de quien actúa (ausente en un login fallido: no hay sesión). */
  actorId?: string;
  companyId?: string;
  /** Id de lo que se toca (usuario, categoría, agrupación, pedido...). */
  targetId?: string;
  meta?: Record<string, unknown>;
}

// Claves que pueden llevar datos personales o de clientes: se descartan a cualquier
// profundidad aunque un llamador las pase por error.
const PII_KEY = /e-?mail|name|nombre|customer|cliente|phone|tel[eé]fono|address|direcci[oó]n|password|token|secret/i;
const MAX_TEXT = 120;

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_TEXT);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!PII_KEY.test(k)) out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

export function buildAuditEntry(input: AuditInput): Record<string, unknown> {
  const meta = input.meta ? (sanitize(input.meta) as Record<string, unknown>) : {};
  return {
    ...meta,
    // Los campos fijos van después: los metadatos no pueden pisarlos.
    event: "audit",
    action: input.action,
    actorId: input.actorId,
    companyId: input.companyId,
    ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
  };
}

export function audit(input: AuditInput): void {
  logInfo("audit", buildAuditEntry(input));
}
