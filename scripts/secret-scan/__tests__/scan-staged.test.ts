import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Extremo a extremo: el hook de pre-commit contra un repo git temporal de verdad. La
// IP pública se construye en tiempo de ejecución para no dejar el literal en el repo.
const SCRIPT = fileURLToPath(new URL("../scan-staged.mjs", import.meta.url));
const PUBLIC_IP = [8, 8, 4, 4].join(".");

let repo: string;

function git(...args: string[]) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

function stageFile(name: string, content: string) {
  writeFileSync(join(repo, name), content);
  git("add", name);
}

function runHook() {
  return spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: "utf8" });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "secret-scan-"));
  git("init", "-q");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("scan-staged.mjs (hook de pre-commit)", () => {
  it("bloquea (sale con 1) si lo preparado lleva una IP pública, sin imprimirla entera", () => {
    stageFile("ok.txt", "nada que ver aquí\n");
    stageFile("config.txt", `# servidor\nHOST=${PUBLIC_IP}\n`);
    const r = runHook();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("config.txt:2");
    expect(r.stderr).toContain("ipv4-publica");
    expect(r.stderr).not.toContain(PUBLIC_IP);
  });

  it("deja pasar (sale con 0) lo que solo lleva IPs privadas o de documentación", () => {
    stageFile("config.txt", "HOST=127.0.0.1\nDOC=192.0.2.10\n");
    const r = runHook();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("solo mira lo preparado: un cambio sin `git add` no bloquea", () => {
    stageFile("config.txt", "HOST=127.0.0.1\n");
    writeFileSync(join(repo, "config.txt"), `HOST=${PUBLIC_IP}\n`);
    expect(runHook().status).toBe(0);
  });
});
