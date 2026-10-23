import { describe, it, expect, vi, afterEach } from "vitest";
import { reportRequestError, requestErrorMeta } from "@/lib/request-error";
import { AppError } from "@/lib/errors";

const request = {
  path: "/clientes/Cliente%20A?q=secreto",
  method: "POST",
  headers: { cookie: "session=abc", authorization: "Bearer x" },
};
const context = {
  routerKind: "App Router" as const,
  routePath: "/(dashboard)/clientes/[customer]",
  routeType: "render" as const,
  renderSource: "react-server-components" as const,
  revalidateReason: undefined,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestErrorMeta", () => {
  it("guarda la ruta (patrón) y el método, sin la ruta real ni las cabeceras", () => {
    const meta = requestErrorMeta(request, context, undefined);
    expect(meta).toEqual({
      method: "POST",
      routePath: "/(dashboard)/clientes/[customer]",
      routeType: "render",
      routerKind: "App Router",
      renderSource: "react-server-components",
    });
    const json = JSON.stringify(meta);
    expect(json).not.toMatch(/Cliente|secreto|session=|Bearer/);
  });

  it("incluye el digest cuando el error lo trae", () => {
    const err = Object.assign(new Error("x"), { digest: "123" });
    expect(requestErrorMeta(request, context, err)).toMatchObject({ digest: "123" });
  });
});

describe("reportRequestError", () => {
  it("registra un error inesperado como error con el contexto de la ruta", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportRequestError(new Error("boom"), request, context);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: "error",
      message: "unhandled server error",
      method: "POST",
      routePath: "/(dashboard)/clientes/[customer]",
      error: { name: "Error", message: "boom" },
    });
    expect(line).not.toHaveProperty("headers");
    expect(line).not.toHaveProperty("path");
  });

  it("un AppError (esperado: sesión caducada, permisos) se registra como aviso", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    reportRequestError(new AppError("Debes iniciar sesión.", "UNAUTHORIZED"), request, { ...context, routeType: "action" });
    expect(error).not.toHaveBeenCalled();
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "warn", code: "UNAUTHORIZED", routeType: "action" });
  });
});
