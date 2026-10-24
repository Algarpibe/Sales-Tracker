/**
 * Lógica pura del escáner de secretos (SEC-022): sin git ni sistema de ficheros, para
 * probarla con vitest. Los efectos viven en scan-staged.mjs y gitleaks-config.mjs.
 *
 * Es .mjs y sin dependencias porque corre en el hook de pre-commit con `node` a secas,
 * igual en Git Bash (Windows) que en Linux.
 */

/** Comentario que, puesto en una línea, la excluye del escaneo (mismo que gitleaks). */
export const INLINE_ALLOW = "gitleaks:allow";

/**
 * @typedef {import("./rules.mjs").SecretRule} SecretRule
 * @typedef {{ id: string, description: string, re: RegExp, secretGroup: number, keywords: string[], allow: RegExp[] }} CompiledRule
 * @typedef {{ file: string, line: number, text: string }} AddedLine
 * @typedef {{ file: string, line: number, ruleId: string, description: string, secret: string }} Finding
 */

/**
 * @param {SecretRule[]} rules
 * @returns {CompiledRule[]}
 */
export function compileRules(rules) {
  return rules.map((r) => ({
    id: r.id,
    description: r.description,
    re: new RegExp(r.source, `${r.flags ?? ""}g`),
    secretGroup: r.secretGroup,
    keywords: (r.keywords ?? []).map((k) => k.toLowerCase()),
    allow: (r.allow?.regexes ?? []).map((s) => new RegExp(s)),
  }));
}

/**
 * Hallazgos de una línea. Misma semántica que gitleaks: prefiltro por keywords, el
 * secreto es el grupo `secretGroup` y `allow` se evalúa contra ese secreto.
 * @param {string} text
 * @param {CompiledRule[]} compiled
 * @returns {{ ruleId: string, description: string, secret: string }[]}
 */
export function scanLine(text, compiled) {
  if (text.includes(INLINE_ALLOW)) return [];
  const lower = text.toLowerCase();
  const out = [];
  for (const rule of compiled) {
    if (rule.keywords.length > 0 && !rule.keywords.some((k) => lower.includes(k))) continue;
    for (const m of text.matchAll(rule.re)) {
      const secret = m[rule.secretGroup] ?? m[0];
      if (!secret || rule.allow.some((a) => a.test(secret))) continue;
      out.push({ ruleId: rule.id, description: rule.description, secret });
    }
  }
  return out;
}

/**
 * @param {string} path ruta relativa al repo, con `/`
 * @param {{ regex: string, flags?: string }[]} pathAllowlist
 */
export function isPathAllowed(path, pathAllowlist) {
  return pathAllowlist.some((p) => new RegExp(p.regex, p.flags ?? "").test(path));
}

/** Ruta de una cabecera `+++ b/ruta` (sin el tabulador final que git añade si hay espacios). */
function headerPath(raw) {
  let p = raw.replace(/\t$/, "");
  if (p === "/dev/null") return null;
  if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  return p.startsWith("b/") ? p.slice(2) : p;
}

/**
 * Líneas AÑADIDAS de un `git diff -U0`, con su fichero y número de línea en la versión
 * nueva. Una línea de contenido siempre lleva prefijo (`+`, `-`, ` `, `\`), así que
 * `diff --git` solo puede ser una cabecera y `+++` solo es cabecera antes del primer `@@`.
 * @param {string} diff
 * @returns {AddedLine[]}
 */
export function parseAddedLines(diff) {
  /** @type {AddedLine[]} */
  const out = [];
  /** @type {string | null} */
  let file = null;
  let inHeader = false;
  let next = 0;
  for (const rawLine of diff.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      file = null;
      continue;
    }
    if (inHeader) {
      if (line.startsWith("+++ ")) file = headerPath(line.slice(4));
      else if (line.startsWith("@@")) inHeader = false;
      if (inHeader) continue;
    }
    if (line.startsWith("@@")) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      next = m ? Number(m[1]) : 0;
      continue;
    }
    if (file === null) continue;
    if (line.startsWith("+")) {
      out.push({ file, line: next, text: line.slice(1) });
      next += 1;
    } else if (line.startsWith(" ")) {
      next += 1;
    }
  }
  return out;
}

/**
 * @param {AddedLine[]} lines
 * @param {{ rules: CompiledRule[], pathAllowlist: { regex: string, flags?: string }[] }} opts
 * @returns {Finding[]}
 */
export function scanAddedLines(lines, { rules, pathAllowlist }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Map<string, boolean>} */
  const allowedCache = new Map();
  for (const { file, line, text } of lines) {
    if (!allowedCache.has(file)) allowedCache.set(file, isPathAllowed(file, pathAllowlist));
    if (allowedCache.get(file)) continue;
    for (const f of scanLine(text, rules)) findings.push({ file, line, ...f });
  }
  return findings;
}

/**
 * Enmascara un valor para poder imprimirlo: deja ver los 2 primeros caracteres (para
 * reconocerlo) y tapa el resto. Si es corto, lo tapa entero.
 * @param {string} secret
 */
export function mask(secret) {
  if (secret.length <= 4) return "*".repeat(secret.length);
  return secret.slice(0, 2) + "*".repeat(secret.length - 2);
}

/**
 * Informe para el pre-commit, en español y sin el valor completo.
 * @param {Finding[]} findings
 */
export function formatReport(findings) {
  const lines = [
    `ERROR (SEC-022): lo que vas a commitear contiene ${findings.length} dato(s) que no pueden ir al repositorio:`,
    "",
  ];
  for (const f of findings) {
    lines.push(`  ${f.file}:${f.line}  [${f.ruleId}] ${f.description}`);
    lines.push(`      valor: ${mask(f.secret)}`);
  }
  lines.push(
    "",
    "Qué hacer:",
    "  - Sustituye el valor por un marcador (<VPS_IP>, <host-interno>, <dominio-app>, ${VAR}) o,",
    "    en tests, por una IP de documentación RFC 5737; después vuelve a hacer `git add`.",
    "  - Si es un falso positivo: añade `gitleaks:allow` en esa línea, o una entrada justificada",
    "    en scripts/secret-scan/rules.mjs y regenera .gitleaks.toml con `npm run secrets:config`.",
    "  - `git commit --no-verify` salta TODOS los hooks: solo para un falso positivo con prisa,",
    "    y gitleaks lo volverá a revisar en CI. La solución buena es la entrada en la allowlist.",
  );
  return lines.join("\n");
}

/** Cadena TOML básica ("..."), escapando `\` y `"`. */
function tomlString(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Cadena TOML literal ('''...'''): la expresión va tal cual, sin escapar nada. */
function tomlRegex(source, flags) {
  if (source.includes("'''")) throw new Error(`Expresión no representable en TOML: ${source}`);
  const supported = [...(flags ?? "")].filter((f) => f === "i" || f === "m").join("");
  const prefix = supported ? `(?${supported})` : "";
  return `'''${prefix}${source}'''`;
}

/**
 * Genera .gitleaks.toml a partir de las reglas compartidas. Determinista: un test lo
 * compara con el fichero commiteado.
 * @param {{ rules: SecretRule[], pathAllowlist: { description: string, regex: string, flags?: string }[] }} config
 */
export function renderGitleaksToml({ rules, pathAllowlist }) {
  const out = [
    "# GENERADO por `npm run secrets:config` desde scripts/secret-scan/rules.mjs (SEC-022).",
    "# No editar a mano: cambia rules.mjs y regenera. Un test de vitest falla si este fichero",
    "# no coincide con las reglas, así el hook de pre-commit y gitleaks en CI aplican lo mismo.",
    "",
    'title = "SalesTracker Pro: secretos e infraestructura"',
    "",
    "# Reglas por defecto de gitleaks (tokens de nube, claves privadas, etc.) más las propias.",
    "[extend]",
    "useDefault = true",
  ];
  for (const p of pathAllowlist) {
    out.push(
      "",
      "[[allowlists]]",
      `description = ${tomlString(p.description)}`,
      `paths = [${tomlRegex(p.regex, p.flags)}]`,
    );
  }
  for (const r of rules) {
    out.push(
      "",
      "[[rules]]",
      `id = ${tomlString(r.id)}`,
      `description = ${tomlString(r.description)}`,
      `regex = ${tomlRegex(r.source, r.flags)}`,
      `secretGroup = ${r.secretGroup}`,
    );
    if (r.keywords?.length) out.push(`keywords = [${r.keywords.map(tomlString).join(", ")}]`);
    if (r.allow) {
      // Sin regexTarget: por defecto gitleaks evalúa estas expresiones contra el secreto.
      out.push(
        "",
        "[[rules.allowlists]]",
        `description = ${tomlString(r.allow.description)}`,
        "regexes = [",
        ...r.allow.regexes.map((s) => `  ${tomlRegex(s)},`),
        "]",
      );
    }
  }
  return `${out.join("\n")}\n`;
}
