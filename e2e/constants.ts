import users from "./fixtures/users.json";
import historical from "./fixtures/historical.json";

export const APPROVED_USER = users.approved;
export const PENDING_USER = users.pending;
export const LECTOR_USER = users.lector;

/** storageState del usuario aprobado. Contiene cookies de sesión reales: va en .gitignore. */
export const APPROVED_STATE = "e2e/.auth/approved.json";
/** storageState del usuario pendiente de aprobación. */
export const PENDING_STATE = "e2e/.auth/pending.json";
/** storageState del usuario aprobado sin rol de administrador. */
export const LECTOR_STATE = "e2e/.auth/lector.json";

/** Empresa por defecto. Debe coincidir con DEFAULT_COMPANY de src/lib/auth/auth.ts. */
export const COMPANY_NAME = "Ambientalia S.A.S.";

/** Categorías sembradas. El nombre mapea 1:1 con books.items.category_name del hub falso. */
export const CATEGORIES = ["Aguas", "Aire", "Suelos"] as const;

/**
 * 2020 es un año PARCIAL sembrado a propósito, anterior al FIRST_YEAR = 2021
 * que usan los componentes. Un registro de este año es lo que reproduce el bug
 * del bucket inexistente (commit 9dc66ee): sin su guarda, annualGrouped[2020]
 * es undefined y la excepción vacía el gráfico entero.
 */
export const YEAR_BEFORE_FIRST_YEAR = 2020;

/**
 * 2021 solo tiene datos de 'Aguas'. Este hueco es deliberado, pero cubre algo
 * distinto de 9dc66ee: dentro de un año VÁLIDO (>= FIRST_YEAR), ejercita los
 * estados vacíos por categoría — no reproduce el bucket de año inexistente,
 * cuya condición es un año anterior a FIRST_YEAR, no un hueco de categoría.
 */
export const YEAR_WITH_GAPS = 2021;
export const CATEGORY_MISSING_IN_GAP_YEAR = "Aire";

/**
 * Cliente con histórico ficticio previo al hub (tabla historical_customer_sales).
 * Solo lo ven /clientes y la ficha de cliente.
 */
export const HISTORICAL_CUSTOMER = historical.customer;
export const HISTORICAL_FIRST_YEAR = Math.min(...historical.rows.map((r) => r.year));

/**
 * Cliente cuyo documento más antiguo en el hub es una Orden de Venta de 2020,
 * sin factura ese año (mes impar en e2e/db/seed-hub.mjs). Sirve para comprobar
 * que "Cliente desde" no depende del conmutador OV/FAC.
 */
export const ORDER_FIRST_CUSTOMER = "Alfa Industrial";
export const ORDER_FIRST_YEAR = 2020;

/** Vendedores ficticios que siembra e2e/db/seed-hub.mjs en raw.salesperson_name, en el orden alfabético que devuelve la consulta. */
export const SALESPEOPLE = ["Vendedor Ficticio", "Vendedora Ficticia"] as const;
