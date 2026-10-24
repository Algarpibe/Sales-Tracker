/**
 * Hook de pre-commit (SEC-022): escanea SOLO las líneas añadidas del área de
 * preparación (`git diff --cached`) con las reglas de rules.mjs, las mismas que usa
 * gitleaks en CI. Si encuentra algo, imprime fichero:línea, regla y el valor
 * enmascarado, y sale con 1 para bloquear el commit. Sin dependencias.
 */
import { spawnSync } from "node:child_process";
import { compileRules, formatReport, parseAddedLines, scanAddedLines } from "./lib.mjs";
import { PATH_ALLOWLIST, RULES } from "./rules.mjs";

const git = spawnSync(
  "git",
  [
    "-c",
    "core.quotepath=off",
    "diff",
    "--cached",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--diff-filter=ACMR",
  ],
  { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
);

if (git.error || git.status !== 0) {
  console.error("ERROR (SEC-022): no se pudo leer el diff preparado con git.");
  console.error(git.error?.message ?? git.stderr);
  process.exit(2);
}

const findings = scanAddedLines(parseAddedLines(git.stdout), {
  rules: compileRules(RULES),
  pathAllowlist: PATH_ALLOWLIST,
});

if (findings.length > 0) {
  console.error(formatReport(findings));
  process.exit(1);
}
