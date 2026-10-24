/**
 * Reglas propias del escáner de secretos e infraestructura (SEC-022). Fuente ÚNICA:
 * de aquí salen tanto el hook de pre-commit (scan-staged.mjs) como .gitleaks.toml,
 * que se GENERA con `npm run secrets:config` (gitleaks-config.mjs). Un test compara
 * el .gitleaks.toml commiteado con el que generaría este fichero, así que el hook y
 * gitleaks en CI no pueden divergir sin que falle CI.
 *
 * REGLA DURA: aquí solo van patrones GENÉRICOS. Nunca una IP, host, dominio,
 * contraseña o nombre real, ni siquiera "para probar": este fichero se commitea y
 * filtraría justo lo que pretende impedir. Las IP de ejemplo en tests son las de
 * documentación (RFC 5737) o se construyen en tiempo de ejecución.
 *
 * Las expresiones tienen que funcionar igual en JavaScript y en RE2 (Go, gitleaks):
 * sin lookahead/lookbehind ni referencias hacia atrás. Las banderas van aparte
 * (`flags`, solo `i` y `m`); el generador las traduce a `(?i)`/`(?m)` para gitleaks.
 *
 * Semántica común (la de gitleaks): `secretGroup` es el grupo de captura que se
 * considera "el secreto"; `allow` son expresiones que, si casan con ese secreto,
 * descartan el hallazgo; `keywords` es un prefiltro (si la línea no contiene ninguna,
 * no se evalúa la regla). Una línea con el comentario `gitleaks:allow` se ignora.
 */

/** Octeto IPv4 0-255 sin ceros a la izquierda. */
const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])";

/**
 * Lo que puede rodear a una IP. Se excluyen letras, dígitos, `.`, `_` y `-` a ambos
 * lados para no confundir versiones y nombres de paquete (`v1.2.3.4`, `x-1.2.3.4`,
 * `1.2.3.4.5`) ni números dentro de identificadores. Un punto final de frase sí se
 * admite (`.` seguido de algo que no es letra ni dígito).
 */
const IP_BEFORE = "(?:^|[^0-9A-Za-z._-])";
const IP_AFTER = "(?:$|[^0-9A-Za-z._-]|\\.(?:$|[^0-9A-Za-z]))";

/** @typedef {{ id: string, description: string, source: string, flags?: string, secretGroup: number, keywords?: string[], allow?: { description: string, regexes: string[] } }} SecretRule */

/** @type {SecretRule[]} */
export const RULES = [
  {
    id: "ipv4-publica",
    description: "Dirección IPv4 pública (infraestructura real: usa <VPS_IP> o una IP RFC 5737)",
    source: `${IP_BEFORE}(${OCTET}(?:\\.${OCTET}){3})${IP_AFTER}`,
    // `m`: gitleaks evalúa el fichero entero, no línea a línea. Sin ella, el
    // delimitador final se comería el salto de línea y una IP al principio de la
    // línea siguiente pasaría sin detectar.
    flags: "m",
    secretGroup: 1,
    allow: {
      description: "Rangos que no son infraestructura pública: privados, reservados y de documentación",
      regexes: [
        "^0\\.", // 0.0.0.0/8 (incluye el bind a todas las interfaces)
        "^10\\.", // privada RFC 1918
        "^127\\.", // loopback
        "^169\\.254\\.", // link-local
        "^172\\.(?:1[6-9]|2[0-9]|3[01])\\.", // privada RFC 1918 (172.16/12)
        "^192\\.168\\.", // privada RFC 1918
        "^100\\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.", // CGNAT RFC 6598
        "^192\\.0\\.2\\.", // documentación RFC 5737 (TEST-NET-1)
        "^198\\.51\\.100\\.", // documentación RFC 5737 (TEST-NET-2)
        "^203\\.0\\.113\\.", // documentación RFC 5737 (TEST-NET-3)
        "^198\\.1[89]\\.", // benchmarking RFC 2544
        "^2(?:2[4-9]|[3-5][0-9])\\.", // multicast y reservadas (incluye máscaras 255.x)
      ],
    },
  },
  {
    id: "hostname-panel",
    description: "Hostname de panel de despliegue o DNS comodín (usa <dominio-app> o <host-interno>)",
    source: "([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:easypanel\\.host|sslip\\.io|nip\\.io|traefik\\.me))",
    flags: "i",
    secretGroup: 1,
    keywords: ["easypanel.host", "sslip.io", "nip.io", "traefik.me"],
  },
  {
    id: "postgres-url-con-password",
    description: "URL de Postgres con contraseña en línea (usa ${VAR}, <password> o un marcador)",
    source: "postgres(?:ql)?://[^:@/\\s'\"\\x60]+:([^@/\\s'\"\\x60]+)@",
    flags: "i",
    secretGroup: 1,
    keywords: ["postgres"],
    allow: {
      description: "Marcadores evidentes y credenciales de usar y tirar de CI/tests locales",
      regexes: [
        "^<[^>]*>$", // <password>, <pw>
        "^\\$\\{[^}]*\\}$", // ${PASSWORD}
        "^\\$[A-Za-z_][A-Za-z0-9_]*$", // $PGPASSWORD
        "^\\*+$", // ****
        "^(?:build|password|postgres|pass|pw|p|u|x|otra|changeme|secret)$",
        "^secreto(?:-[a-z0-9-]+)?$", // secreto, secreto-db
        "^ci-[a-z0-9-]+$", // ci-test-secret
      ],
    },
  },
];

/**
 * Rutas que nunca se escanean. Lista mínima: cada entrada tiene que justificar por
 * qué ahí aparecen falsos positivos inevitables.
 * @type {{ description: string, regex: string, flags?: string }[]}
 */
export const PATH_ALLOWLIST = [
  {
    // Versiones, hashes de integridad y URLs del registro npm: lo regenera npm, no
    // una persona, y está lleno de cadenas con forma de x.y.z.w.
    description: "Lockfile de npm",
    regex: "(?:^|/)package-lock\\.json$",
  },
  {
    // Los datos de trazado (`d="M1.31.5.5..."`) son números decimales seguidos que
    // parecen IPs. gitleaks ya excluye imágenes en sus reglas por defecto.
    description: "Imágenes SVG",
    regex: "\\.svg$",
    flags: "i",
  },
];
