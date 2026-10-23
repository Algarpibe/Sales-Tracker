import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadBlob, downloadText } from "@/lib/download";

/** Doble mínimo del DOM: un <a> que registra href/download y los clics. */
function stubDom() {
  const anchor = { href: "", download: "", click: vi.fn() };
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:fake");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
  return { anchor, createObjectURL, revokeObjectURL };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadBlob", () => {
  it("descarga el blob con el nombre dado y libera la URL", () => {
    const { anchor, createObjectURL, revokeObjectURL } = stubDom();
    const blob = new Blob(["x"]);
    downloadBlob(blob, "fichero.xlsx");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:fake");
    expect(anchor.download).toBe("fichero.xlsx");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});

describe("downloadText", () => {
  it("por defecto descarga un CSV UTF-8", async () => {
    const { createObjectURL, anchor } = stubDom();
    downloadText("a,b\n1,2", "datos.csv");
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe("a,b\n1,2");
    expect(anchor.download).toBe("datos.csv");
  });

  it("respeta el tipo MIME indicado", () => {
    const { createObjectURL } = stubDom();
    downloadText("a", "t.csv", "text/csv");
    expect((createObjectURL.mock.calls[0][0]).type).toBe("text/csv");
  });
});
