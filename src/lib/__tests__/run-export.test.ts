import { describe, it, expect, vi } from "vitest";
import { runExport } from "@/lib/run-export";

const notifier = () => ({ success: vi.fn(), error: vi.fn() });

describe("runExport", () => {
  it("avisa del éxito solo cuando la exportación ha terminado", async () => {
    const n = notifier();
    let terminar!: () => void;
    const tarea = new Promise<void>((r) => (terminar = r));
    const p = runExport(() => tarea, n, { ok: "Excel descargado", error: "No se pudo generar el Excel" });
    await Promise.resolve();
    expect(n.success).not.toHaveBeenCalled();
    terminar();
    await expect(p).resolves.toBe(true);
    expect(n.success).toHaveBeenCalledWith("Excel descargado");
    expect(n.error).not.toHaveBeenCalled();
  });

  it("si la exportación falla avisa del error y no del éxito", async () => {
    const n = notifier();
    await expect(
      runExport(() => Promise.reject(new Error("boom")), n, { ok: "Excel descargado", error: "No se pudo generar el Excel" })
    ).resolves.toBe(false);
    expect(n.error).toHaveBeenCalledWith("No se pudo generar el Excel");
    expect(n.success).not.toHaveBeenCalled();
  });
});
