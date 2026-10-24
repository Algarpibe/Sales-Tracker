/**
 * Regenera .gitleaks.toml desde rules.mjs (SEC-022): `npm run secrets:config`.
 * Con `--check` no escribe: sale con 1 si el fichero no está al día.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderGitleaksToml } from "./lib.mjs";
import { PATH_ALLOWLIST, RULES } from "./rules.mjs";

const target = fileURLToPath(new URL("../../.gitleaks.toml", import.meta.url));
const expected = renderGitleaksToml({ rules: RULES, pathAllowlist: PATH_ALLOWLIST });

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  } catch {
    // No existe: cuenta como desactualizado.
  }
  if (current !== expected) {
    console.error(".gitleaks.toml no coincide con scripts/secret-scan/rules.mjs: ejecuta `npm run secrets:config`.");
    process.exit(1);
  }
  console.log(".gitleaks.toml al día.");
} else {
  writeFileSync(target, expected);
  console.log("Escrito .gitleaks.toml.");
}
