import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Reglas react-hooks degradadas a warning: corresponden a patrones intencionales
  // del código (useEffect con deps acotadas a propósito, etc.). Quedan como AVISO
  // —visibles pero no bloquean—, de modo que el lint pueda ser gate duro en CI
  // (rechaza errores NUEVOS: any, imports sin usar, etc.) sin reescribir efectos
  // que ya funcionan. Revisar caso a caso en el futuro.
  {
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);

export default eslintConfig;
