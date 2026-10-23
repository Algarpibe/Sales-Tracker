import { logInfo } from "@/lib/logger";
import { dropPiiKeys } from "@/lib/pii";

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

// Las claves con datos personales se descartan a cualquier profundidad con el filtro
// compartido (src/lib/pii.ts) y los textos se acotan.
const MAX_TEXT = 120;

export function buildAuditEntry(input: AuditInput): Record<string, unknown> {
  const meta = input.meta ? (dropPiiKeys(input.meta, { maxText: MAX_TEXT }) as Record<string, unknown>) : {};
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
