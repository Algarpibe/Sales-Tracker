import { HUB_COMPANY_ID_ENV, hubCompanyConfig } from "@/lib/env";
import { AppError, HUB_COMPANY_FORBIDDEN_MESSAGE } from "@/lib/errors";
import { logWarn } from "@/lib/logger";

type Env = Record<string, string | undefined>;

// Un HUB_COMPANY_ID inválido se avisa una vez por proceso (también lo avisa el arranque,
// src/lib/env.ts), no en cada lectura.
const globalForHubCompany = globalThis as unknown as { __hubCompanyInvalidWarned?: boolean };

/**
 * SEC-035: el zoho-hub guarda los datos de UNA empresa y sus consultas no filtran por
 * empresa. Antes de consultar el hub en nombre de una sesión, la capa de lecturas
 * (src/lib/data-reads.ts) llama a esto con la empresa de ESA sesión:
 *  - sin HUB_COMPANY_ID → no se restringe nada (comportamiento anterior);
 *  - con HUB_COMPANY_ID y otra empresa → AppError FORBIDDEN (403 en /api/data);
 *  - con un HUB_COMPANY_ID que no es UUID → se ignora (no se restringe) y se avisa.
 * Solo protege las lecturas del hub: el login y los datos propios de la app no pasan
 * por aquí.
 */
export function assertHubCompany(
  companyId: string,
  env: Env = process.env,
  warn: (message: string) => void = logWarn
): void {
  const { id, invalid } = hubCompanyConfig(env);
  if (invalid) {
    if (!globalForHubCompany.__hubCompanyInvalidWarned) {
      globalForHubCompany.__hubCompanyInvalidWarned = true;
      warn(`${HUB_COMPANY_ID_ENV} no es un UUID válido: se ignora y el hub no se restringe a ninguna empresa.`);
    }
    return;
  }
  if (id === null) return;
  if (companyId.trim().toLowerCase() !== id) {
    throw new AppError(HUB_COMPANY_FORBIDDEN_MESSAGE, "FORBIDDEN");
  }
}
