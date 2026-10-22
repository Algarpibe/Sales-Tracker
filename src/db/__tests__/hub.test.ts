import { describe, it, expect } from "vitest";
import { hubPoolConfig, HUB_STATEMENT_TIMEOUT_DEFAULT_MS } from "@/db/hub-config";

const URL = "postgres://hub_reader:x@127.0.0.1:5432/zoho_hub";

describe("hubPoolConfig", () => {
  it("usa la URL del hub y conserva los límites del pool", () => {
    const c = hubPoolConfig({ HUB_DB_URL: URL });
    expect(c.connectionString).toBe(URL);
    expect(c.max).toBe(5);
    expect(c.idleTimeoutMillis).toBe(30_000);
    expect(c.connectionTimeoutMillis).toBe(10_000);
  });

  it("respeta HUB_POOL_MAX", () => {
    expect(hubPoolConfig({ HUB_DB_URL: URL, HUB_POOL_MAX: "8" }).max).toBe(8);
  });

  it("abre cada sesión en solo lectura y con el statement_timeout por defecto", () => {
    expect(HUB_STATEMENT_TIMEOUT_DEFAULT_MS).toBe(30_000);
    expect(hubPoolConfig({ HUB_DB_URL: URL }).options).toBe(
      "-c statement_timeout=30000 -c default_transaction_read_only=on"
    );
  });

  it("toma el timeout de HUB_STATEMENT_TIMEOUT_MS", () => {
    expect(hubPoolConfig({ HUB_DB_URL: URL, HUB_STATEMENT_TIMEOUT_MS: "120000" }).options).toBe(
      "-c statement_timeout=120000 -c default_transaction_read_only=on"
    );
  });

  it.each(["", "0", "-5", "abc", "1.5", "30s", " 100", "1e4"])(
    "ignora un HUB_STATEMENT_TIMEOUT_MS inválido (%j) y usa el valor por defecto",
    (raw) => {
      expect(hubPoolConfig({ HUB_DB_URL: URL, HUB_STATEMENT_TIMEOUT_MS: raw }).options).toBe(
        "-c statement_timeout=30000 -c default_transaction_read_only=on"
      );
    }
  );
});
