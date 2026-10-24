import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  compileRules,
  formatReport,
  isPathAllowed,
  mask,
  parseAddedLines,
  renderGitleaksToml,
  scanAddedLines,
  scanLine,
} from "../lib.mjs";
import { PATH_ALLOWLIST, RULES } from "../rules.mjs";

// Las IP públicas, hostnames de panel y contraseñas "reales" se construyen en tiempo
// de ejecución: así el literal nunca aparece en el repo y este test no se dispara a sí
// mismo en el hook ni en gitleaks. Las IP de documentación (RFC 5737) sí van literales.
const ip = (...parts: number[]) => parts.join(".");
const PUBLIC_IP = ip(8, 8, 4, 4);
const panelHost = (sub: string, domain = ["easypanel", "host"]) => [sub, ...domain].join(".");
const REAL_PW = ["Zr7q", "Lm2p", "X9vT"].join("");
const pgUrl = (pw: string, scheme = "postgres") => `${scheme}://app:${pw}@db-interno:5432/app`;

const compiled = compileRules(RULES);
const rulesHit = (text: string) => scanLine(text, compiled).map((f: { ruleId: string }) => f.ruleId);
const secrets = (text: string) => scanLine(text, compiled).map((f: { secret: string }) => f.secret);

describe("regla ipv4-publica", () => {
  it.each([
    `HOST=${PUBLIC_IP}`,
    `ssh root@${PUBLIC_IP}`,
    `curl http://${PUBLIC_IP}:3000/api/health`,
    `El VPS está en ${PUBLIC_IP}.`,
    `"${PUBLIC_IP}"`,
    PUBLIC_IP,
    // Justo fuera de 172.16/12: es pública.
    `host ${ip(172, 32, 0, 1)}`,
  ])("marca una IP pública: %s", (line) => {
    expect(rulesHit(line)).toEqual(["ipv4-publica"]);
  });

  it("devuelve la IP como secreto, sin el contexto", () => {
    expect(secrets(`a=${PUBLIC_IP};`)).toEqual([PUBLIC_IP]);
  });

  it("encuentra varias IP en la misma línea", () => {
    const other = ip(9, 9, 9, 9);
    expect(secrets(`${PUBLIC_IP} y ${other}`)).toEqual([PUBLIC_IP, other]);
  });

  it.each([
    "10.0.3.7",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.20",
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.10",
    "198.51.100.7",
    "203.0.113.9",
    "255.255.255.0",
    "224.0.0.1",
  ])("no marca una dirección privada, reservada o de documentación: %s", (addr) => {
    expect(rulesHit(`host=${addr}`)).toEqual([]);
  });

  it.each([
    ["semver de 4 partes con v", `version v${ip(1, 2, 3, 4)}`],
    ["versión pegada a un nombre", `chromium-${ip(1, 2, 3, 4)}`],
    ["más de 4 grupos", `build ${ip(1, 2, 3, 4, 5)}`],
    ["semver de 3 partes", "next 16.4.2"],
    ["fecha con puntos", "24.10.2026"],
    ["fecha ISO con puntos", "2026.10.24"],
    ["digest sha256", "sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36"],
    ["número decimal", "78.38 % sentencias"],
    ["identificador con guion bajo", `id_${ip(1, 2, 3, 4)}`],
  ])("no marca %s", (_label, line) => {
    expect(rulesHit(line)).toEqual([]);
  });

  it("respeta el comentario gitleaks:allow en la línea", () => {
    expect(rulesHit(`"${PUBLIC_IP}", // gitleaks:allow`)).toEqual([]);
  });
});

describe("regla hostname-panel", () => {
  it.each([
    panelHost("x"),
    `https://${panelHost("mi-app-1")}/login`,
    panelHost("APP").toUpperCase(),
    panelHost("8-8-4-4", ["sslip", "io"]),
    panelHost("app", ["nip", "io"]),
    panelHost("app", ["traefik", "me"]),
  ])("marca %s", (line) => {
    expect(rulesHit(line)).toEqual(["hostname-panel"]);
  });

  it("devuelve el hostname completo como secreto", () => {
    const host = panelHost("svc.proyecto");
    expect(secrets(`url: https://${host}/`)).toEqual([host]);
  });

  it.each([
    ["marcador", `<dominio-app>.${["easypanel", "host"].join(".")}`],
    ["el dominio sin subdominio", ["easypanel", "host"].join(".")],
    ["el nombre del panel en texto", "desplegado en EasyPanel por el usuario"],
  ])("no marca %s", (_label, line) => {
    expect(rulesHit(line)).toEqual([]);
  });
});

describe("regla postgres-url-con-password", () => {
  it.each([pgUrl(REAL_PW), pgUrl(REAL_PW, "postgresql"), pgUrl(REAL_PW, "POSTGRES")])(
    "marca una contraseña con pinta de real: %s",
    (line) => {
      expect(rulesHit(line)).toEqual(["postgres-url-con-password"]);
    },
  );

  it("el secreto es solo la contraseña", () => {
    expect(secrets(`DATABASE_URL=${pgUrl(REAL_PW)}`)).toEqual([REAL_PW]);
  });

  it.each([
    "postgres://build:build@127.0.0.1:1/unreachable",
    "postgres://user:password@host:5432/dbname",
    "postgres://<user>:<password>@<host-interno>:5432/<db>",
    "postgres://${USER}:${PASSWORD}@${HOST}:${PORT}",
    "postgres://u:$PGPASSWORD@db/app",
    "postgres://u:secreto@db.example.com:5432/app",
    "postgres://u:secreto-hub@db:5432/hub",
    "postgres://u:ci-test-secret@db:5432/app",
    "postgres://postgres:postgres@127.0.0.1:5432/salestracker_e2e",
    "postgres://x:x@127.0.0.1:9/x",
    "postgres://u:****@db/app",
    "postgres://solo-usuario@db:5432/app",
    "postgres://db:5432/app",
  ])("no marca un marcador o una URL sin contraseña: %s", (line) => {
    expect(rulesHit(line)).toEqual([]);
  });
});

describe("mask", () => {
  it("no devuelve el valor completo y conserva la longitud", () => {
    const m = mask(PUBLIC_IP);
    expect(m).not.toContain(PUBLIC_IP);
    expect(m).toHaveLength(PUBLIC_IP.length);
    expect(m.startsWith(PUBLIC_IP.slice(0, 2))).toBe(true);
    expect(mask(REAL_PW)).not.toContain(REAL_PW.slice(2));
  });

  it("tapa por completo un secreto corto", () => {
    expect(mask("abcd")).toBe("****");
  });
});

describe("parseAddedLines", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 1111111..2222222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3,0 +4,2 @@ export function x() {",
    "+linea4",
    "+linea5",
    "@@ -10 +12 @@",
    "-vieja",
    "+nueva12",
    "\\ No newline at end of file",
    "diff --git a/docs/con espacio.md b/docs/con espacio.md",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/docs/con espacio.md\t",
    "@@ -0,0 +1 @@",
    "+++contenido que empieza por ++\r",
  ].join("\n");

  it("devuelve solo las líneas añadidas con su fichero y número de línea", () => {
    expect(parseAddedLines(diff)).toEqual([
      { file: "src/a.ts", line: 4, text: "linea4" },
      { file: "src/a.ts", line: 5, text: "linea5" },
      { file: "src/a.ts", line: 12, text: "nueva12" },
      { file: "docs/con espacio.md", line: 1, text: "++contenido que empieza por ++" },
    ]);
  });

  it("con un diff vacío no devuelve nada", () => {
    expect(parseAddedLines("")).toEqual([]);
  });
});

describe("scanAddedLines", () => {
  it("informa fichero, línea y regla, y salta las rutas permitidas", () => {
    const findings = scanAddedLines(
      [
        { file: "src/x.ts", line: 7, text: `const h = "${PUBLIC_IP}";` },
        { file: "package-lock.json", line: 1, text: `"version": "${PUBLIC_IP}"` },
        { file: "public/logo.SVG", line: 1, text: `d="M${PUBLIC_IP}"` },
        { file: "docs/x.md", line: 3, text: "sin nada raro" },
      ],
      { rules: compiled, pathAllowlist: PATH_ALLOWLIST },
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: "src/x.ts", line: 7, ruleId: "ipv4-publica", secret: PUBLIC_IP }),
    ]);
  });

  it("isPathAllowed usa las rutas de PATH_ALLOWLIST", () => {
    expect(isPathAllowed("package-lock.json", PATH_ALLOWLIST)).toBe(true);
    expect(isPathAllowed("e2e/package-lock.json", PATH_ALLOWLIST)).toBe(true);
    expect(isPathAllowed("package.json", PATH_ALLOWLIST)).toBe(false);
  });
});

describe("formatReport", () => {
  it("nombra fichero:línea y regla sin imprimir el valor completo", () => {
    const report = formatReport([
      { file: "src/x.ts", line: 7, ruleId: "ipv4-publica", description: "IPv4 pública", secret: PUBLIC_IP },
    ]);
    expect(report).toContain("src/x.ts:7");
    expect(report).toContain("ipv4-publica");
    expect(report).toContain(mask(PUBLIC_IP));
    expect(report).not.toContain(PUBLIC_IP);
    expect(report).toContain("--no-verify");
  });
});

describe("reglas compartidas con gitleaks", () => {
  it("todas las expresiones compilan y son compatibles con RE2 (sin lookaround ni backrefs)", () => {
    const sources = [
      ...RULES.flatMap((r: { source: string; allow?: { regexes: string[] } }) => [r.source, ...(r.allow?.regexes ?? [])]),
      ...PATH_ALLOWLIST.map((p: { regex: string }) => p.regex),
    ];
    for (const s of sources) {
      expect(() => new RegExp(s)).not.toThrow();
      expect(s).not.toMatch(/\(\?<?[=!]|\\[1-9]|\(\?[a-z]/);
      expect(s).not.toContain("'''");
    }
  });

  it("traduce las banderas a la sintaxis de Go (la IP va con (?m): gitleaks lee el fichero entero)", () => {
    const toml = renderGitleaksToml({ rules: RULES, pathAllowlist: PATH_ALLOWLIST });
    expect(toml).toMatch(/^regex = '''\(\?m\)\(\?:\^\|/m);
    expect(toml).toContain("regex = '''(?i)postgres");
    expect(toml).toContain("paths = ['''(?i)\\.svg$''']");
  });

  it("el .gitleaks.toml commiteado es exactamente el que generan las reglas (npm run secrets:config)", () => {
    const committed = readFileSync(fileURLToPath(new URL("../../../.gitleaks.toml", import.meta.url)), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(renderGitleaksToml({ rules: RULES, pathAllowlist: PATH_ALLOWLIST }));
  });
});
