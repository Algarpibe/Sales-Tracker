import { describe, it, expect, vi, afterEach } from "vitest";
import { logError, logInfo, logWarn } from "@/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

type Level = "error" | "warn" | "log";

function capture(level: Level) {
  return vi.spyOn(console, level).mockImplementation(() => {});
}

function lastLine(spy: ReturnType<typeof capture>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(spy.mock.calls[0][0])) as Record<string, unknown>;
}

describe("logger: metadatos", () => {
  it("descarta las claves con datos personales en los tres niveles", () => {
    const meta = {
      email: "persona@example.test",
      full_name: "Persona",
      customer: "Cliente A",
      cliente: "Cliente A",
      telefono: "300",
      password: "x",
      token: "t",
      code: "INTERNAL",
    };
    const err = capture("error");
    const warn = capture("warn");
    const log = capture("log");

    logError("fallo", undefined, meta);
    logWarn("aviso", meta);
    logInfo("info", meta);

    for (const spy of [err, warn, log]) {
      const line = lastLine(spy);
      expect(line).toMatchObject({ code: "INTERNAL" });
      expect(Object.keys(line).sort()).toEqual(["code", "level", "message", "time"]);
      expect(JSON.stringify(line)).not.toMatch(/persona|Cliente A/i);
    }
  });

  it("descarta las claves con datos personales también anidadas", () => {
    const log = capture("log");
    logInfo("info", {
      filters: { year: 2026, customer_name: "Cliente A" },
      rows: [{ sheet: "Ventas", nombre: "Cliente A" }],
    });
    const line = lastLine(log);
    expect(line.filters).toEqual({ year: 2026 });
    expect(line.rows).toEqual([{ sheet: "Ventas" }]);
    expect(JSON.stringify(line)).not.toMatch(/Cliente A/);
  });

  it("conserva las claves técnicas que usan los llamadores", () => {
    const warn = capture("warn");
    const meta = {
      card: "Ventas por mes",
      check: "db",
      resource: "sales",
      code: "INTERNAL",
      digest: "123",
      viewKey: "clientes",
      method: "POST",
      routePath: "/(dashboard)/clientes/[customer]",
      routeType: "render",
      routerKind: "App Router",
      renderSource: "react-server-components",
      count: 6000,
      threshold: 5000,
    };
    logWarn("aviso", meta);
    expect(lastLine(warn)).toMatchObject(meta);
  });

  it("los metadatos no pueden pisar los campos reservados", () => {
    const err = capture("error");
    logError("mensaje real", new Error("boom"), {
      level: "info",
      message: "falso",
      time: "ayer",
      error: "falso",
    });
    const line = lastLine(err);
    expect(line.level).toBe("error");
    expect(line.message).toBe("mensaje real");
    expect(line.time).not.toBe("ayer");
    expect(line.error).toMatchObject({ name: "Error", message: "boom" });
  });

  it("sin error, una clave error en los metadatos no aparece en la línea", () => {
    const warn = capture("warn");
    logWarn("aviso", { error: "falso", code: "X" });
    const line = lastLine(warn);
    expect(line).not.toHaveProperty("error");
    expect(line.code).toBe("X");
  });
});

describe("logger: errores", () => {
  it("redacta los emails del mensaje y del stack de un Error", () => {
    const err = capture("error");
    logError("fallo", new Error('duplicate key: email "persona.uno+x@example.test" already exists'));
    const line = lastLine(err);
    const error = line.error as { name: string; message: string; stack: string };
    expect(error.message).toBe('duplicate key: email "[email]" already exists');
    expect(error.stack).toContain("[email]");
    expect(JSON.stringify(line)).not.toMatch(/persona\.uno|example\.test/);
  });

  it("redacta los emails de un valor que no es Error", () => {
    const err = capture("error");
    logError("fallo", "usuario otra.persona@empresa.co no encontrado");
    expect(lastLine(err).error).toBe("usuario [email] no encontrado");
  });

  it("deja intacto un error sin emails", () => {
    const err = capture("error");
    logError("fallo", new Error("timeout de la sonda"));
    expect(lastLine(err).error).toMatchObject({ name: "Error", message: "timeout de la sonda" });
  });
});
