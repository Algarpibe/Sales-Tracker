import users from "./fixtures/users.json";

export const APPROVED_USER = users.approved;
export const PENDING_USER = users.pending;

/** storageState del usuario aprobado. Contiene cookies de sesión reales: va en .gitignore. */
export const APPROVED_STATE = "e2e/.auth/approved.json";
/** storageState del usuario pendiente de aprobación. */
export const PENDING_STATE = "e2e/.auth/pending.json";

/** Empresa por defecto. Debe coincidir con DEFAULT_COMPANY de src/lib/auth/auth.ts. */
export const COMPANY_NAME = "Ambientalia S.A.S.";

/** Categorías sembradas. El nombre mapea 1:1 con books.items.category_name del hub falso. */
export const CATEGORIES = ["Aguas", "Aire", "Suelos"] as const;

/**
 * 2021 solo tiene datos de 'Aguas'. Ese hueco deliberado es lo que reproduce
 * el bug del bucket de año inexistente (commit 9dc66ee).
 */
export const YEAR_WITH_GAPS = 2021;
export const CATEGORY_MISSING_IN_GAP_YEAR = "Aire";
