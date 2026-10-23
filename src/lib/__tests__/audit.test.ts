import { describe, it, expect, vi, afterEach } from "vitest";
import { audit, buildAuditEntry } from "@/lib/audit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildAuditEntry", () => {
  it("da la forma {event:'audit', action, actorId, targetId, companyId, ...meta}", () => {
    expect(
      buildAuditEntry({
        action: "user.role_update",
        actorId: "u-admin",
        companyId: "c1",
        targetId: "u-2",
        meta: { role: "editor" },
      })
    ).toEqual({
      event: "audit",
      action: "user.role_update",
      actorId: "u-admin",
      companyId: "c1",
      targetId: "u-2",
      role: "editor",
    });
  });

  it("omite targetId cuando la acción no tiene destino", () => {
    const entry = buildAuditEntry({ action: "kpi_targets.save", actorId: "u1", companyId: "c1" });
    expect(entry).not.toHaveProperty("targetId");
  });

  it("descarta las claves con datos personales, también anidadas", () => {
    const entry = buildAuditEntry({
      action: "export.xlsx",
      actorId: "u1",
      companyId: "c1",
      meta: {
        email: "persona@example.test",
        full_name: "Persona",
        customer_name: "Cliente A",
        nombre: "X",
        sheets: [{ sheet: "Clientes", rows: 3, cliente: "Cliente A" }],
      },
    });
    expect(entry).toEqual({
      event: "audit",
      action: "export.xlsx",
      actorId: "u1",
      companyId: "c1",
      sheets: [{ sheet: "Clientes", rows: 3 }],
    });
    expect(JSON.stringify(entry)).not.toMatch(/persona|Cliente A/i);
  });

  it("los metadatos no pueden pisar los campos fijos de la entrada", () => {
    const entry = buildAuditEntry({
      action: "category.delete",
      actorId: "u1",
      companyId: "c1",
      meta: { event: "otro", action: "falso", actorId: "x", companyId: "y" },
    });
    expect(entry).toMatchObject({ event: "audit", action: "category.delete", actorId: "u1", companyId: "c1" });
  });

  it("acota los textos largos", () => {
    const entry = buildAuditEntry({ action: "export.xlsx", actorId: "u1", companyId: "c1", meta: { sheet: "x".repeat(500) } });
    expect(String(entry.sheet).length).toBeLessThanOrEqual(120);
  });
});

describe("audit", () => {
  it("emite una sola línea JSON de nivel info con la entrada", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    audit({ action: "user.approve", actorId: "u-admin", companyId: "c1", targetId: "u-2" });
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: "info",
      message: "audit",
      event: "audit",
      action: "user.approve",
      actorId: "u-admin",
      companyId: "c1",
      targetId: "u-2",
    });
  });
});
