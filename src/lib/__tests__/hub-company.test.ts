import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError, HUB_COMPANY_FORBIDDEN_MESSAGE } from "@/lib/errors";
import { assertHubCompany } from "@/lib/hub-company";

/**
 * SEC-035: el zoho-hub guarda los datos de UNA sola empresa y sus consultas no filtran
 * por empresa. Con HUB_COMPANY_ID definido, solo la empresa de la app que coincide puede
 * leerlo; sin la variable (o con un valor que no es UUID) no se restringe nada, como
 * antes. Valores ficticios.
 */

const HUB_COMPANY = "0e2e0000-0000-4000-8000-0000000000aa";
const OTRA = "88888888-8888-4888-8888-888888888888";

beforeEach(() => {
  delete (globalThis as { __hubCompanyInvalidWarned?: boolean }).__hubCompanyInvalidWarned;
});

describe("assertHubCompany", () => {
  it("sin HUB_COMPANY_ID deja pasar a cualquier empresa (comportamiento anterior)", () => {
    const warn = vi.fn();
    expect(() => assertHubCompany(OTRA, {}, warn)).not.toThrow();
    expect(() => assertHubCompany(OTRA, { HUB_COMPANY_ID: "" }, warn)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("deja pasar a la empresa dueña del hub, sin distinguir mayúsculas", () => {
    expect(() => assertHubCompany(HUB_COMPANY, { HUB_COMPANY_ID: HUB_COMPANY }, vi.fn())).not.toThrow();
    expect(() => assertHubCompany(HUB_COMPANY.toUpperCase(), { HUB_COMPANY_ID: HUB_COMPANY }, vi.fn())).not.toThrow();
    expect(() => assertHubCompany(HUB_COMPANY, { HUB_COMPANY_ID: ` ${HUB_COMPANY.toUpperCase()} ` }, vi.fn())).not.toThrow();
  });

  it("rechaza otra empresa con un AppError FORBIDDEN y un mensaje para el usuario", () => {
    let error: unknown;
    try {
      assertHubCompany(OTRA, { HUB_COMPANY_ID: HUB_COMPANY }, vi.fn());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "FORBIDDEN", message: HUB_COMPANY_FORBIDDEN_MESSAGE });
    expect(HUB_COMPANY_FORBIDDEN_MESSAGE).toBe("Tu empresa no tiene acceso a los datos del hub.");
    // El mensaje no revela qué empresa es la dueña del hub.
    expect((error as Error).message).not.toContain(HUB_COMPANY);
  });

  it("rechaza un companyId vacío si la variable está definida", () => {
    expect(() => assertHubCompany("", { HUB_COMPANY_ID: HUB_COMPANY }, vi.fn())).toThrow(HUB_COMPANY_FORBIDDEN_MESSAGE);
  });

  it("con un HUB_COMPANY_ID que no es UUID deja pasar y avisa una sola vez, sin el valor", () => {
    const warn = vi.fn();
    const env = { HUB_COMPANY_ID: "valor-raro-123" };
    expect(() => assertHubCompany(OTRA, env, warn)).not.toThrow();
    expect(() => assertHubCompany(HUB_COMPANY, env, warn)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("HUB_COMPANY_ID");
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain("valor-raro-123");
  });

  it("por defecto lee process.env en cada llamada", () => {
    vi.stubEnv("HUB_COMPANY_ID", HUB_COMPANY);
    try {
      expect(() => assertHubCompany(OTRA)).toThrow(HUB_COMPANY_FORBIDDEN_MESSAGE);
      expect(() => assertHubCompany(HUB_COMPANY)).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
    expect(() => assertHubCompany(OTRA)).not.toThrow();
  });
});
