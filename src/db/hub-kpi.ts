import { getHubPool } from "@/db/hub";
import { isExcludedSalesperson, parseExcludedSalespeople } from "@/lib/commercial-kpis";
import type { DealMonthRow } from "@/lib/kpi-score";
import { FASE_NOTIFICACION_COMERCIAL, type CambioFase } from "@/lib/kpi-tickets";
import type { CustomerMonthRow, RecordType } from "@/types/database";

// Vendedores que aparecen en el hub. Zoho los guarda dentro del JSON de la
// cabecera, no en columna propia, y los mismos nombres salen en ordenes y en
// facturas: se unen las dos fuentes para no depender de una sola.
export async function getHubSalespeople(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT nombre FROM (
      SELECT s.raw->>'salesperson_name' AS nombre
      FROM books.sales_orders s
      WHERE s.status NOT IN ('void','draft')
      UNION
      SELECT i.raw->>'salesperson_name'
      FROM books.invoices i
      WHERE i.status NOT IN ('void','draft')
    ) t
    WHERE nombre IS NOT NULL AND nombre <> ''
    ORDER BY nombre`;
  const { rows } = await getHubPool().query(sql);
  // El filtro va en JavaScript y no en el SQL para poder ignorar mayúsculas y
  // tildes: el mismo nombre llega de Zoho escrito de las dos maneras. Solo se
  // quita del selector de propietario; sus ventas siguen contando en el total
  // de la compañía, que es lo que se quiere.
  const excluidos = parseExcludedSalespeople(process.env.KPI_EXCLUDED_SALESPEOPLE);
  return rows
    .map((r) => String(r.nombre))
    .filter((nombre) => !isExcludedSalesperson(nombre, excluidos));
}

// Misma agregación que getHubCustomerMonthSales, con el vendedor como filtro
// opcional. Zoho guarda el comercial en el JSON de la cabecera, no en columna
// propia, así que el filtro va sobre raw->>'salesperson_name'.
const SOURCES = {
  SALES_ORDER: { lines: "books.salesorder_line_items", header: "books.sales_orders", fk: "salesorder_id" },
  INVOICE: { lines: "books.invoice_line_items", header: "books.invoices", fk: "invoice_id" },
} as const;

export async function getHubCustomerMonthByOwner(f: {
  tipo: RecordType;
  anio: number;
  owner: string | null;
}): Promise<CustomerMonthRow[]> {
  // La tabla se elige en servidor a partir del tipo, nunca por entrada del usuario.
  const src = f.tipo === "SALES_ORDER" ? SOURCES.SALES_ORDER : SOURCES.INVOICE;
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           round(sum(l.bcy_rate * l.quantity *
             COALESCE(1 - COALESCE((h.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(h.bcy_sub_total, 0), 1)
           )::numeric, 2)::float8 AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE extract(year from h.date) = $1
      AND l.bcy_rate IS NOT NULL
      AND h.status NOT IN ('void','draft')
      AND h.customer_name IS NOT NULL
      AND ($2::text IS NULL OR h.raw->>'salesperson_name' = $2)
    GROUP BY h.customer_name, extract(month from h.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    customer: String(r.customer),
    mes: Number(r.mes),
    importe: Number(r.importe),
  }));
}

// Tratos por cuenta y mes. Zoho CRM se replica en el esquema crm del hub, y
// owner_name usa las mismas cadenas que el vendedor de Books, asi que el filtro
// por comercial vale para las dos fuentes sin traducir nada.
export async function getHubDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.created_time)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE extract(year from d.created_time) = $1
      AND d.account_name IS NOT NULL
      AND ($2::text IS NULL OR d.owner_name = $2)
    GROUP BY d.account_name, extract(month from d.created_time)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}

// Tratos ganados por cliente y mes. Se decidio que un trato ganado es el que llego a
// orden de venta, asi que el KPI sigue a Books y no a la fase ni a la fecha de cierre
// de CRM. La orden apunta a su trato con
// raw->>'zcrm_potential_id'; las que no lo llevan (internas, por ejemplo) no cuentan.
// Cada trato cuenta UNA vez, en el mes de su PRIMERA orden valida de todo el historico:
// por eso la CTE no filtra por anio. Si lo hiciera, un trato ganado en diciembre con
// otra orden en enero contaria en los dos anios. Las anuladas y los borradores no
// cuentan: un trato cuya unica orden se anulo no se gano.
// El desempate por salesorder_id deja fija la primera orden cuando dos caen el mismo
// dia, para que cliente y comercial no cambien de una consulta a otra.
// Cliente y comercial salen de esa primera orden; el comercial usa las mismas cadenas
// que owner_name de CRM, asi que el filtro por propietario no cambia de significado.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    WITH primeras AS (
      SELECT DISTINCT ON (s.raw->>'zcrm_potential_id')
             s.date,
             s.customer_name,
             s.raw->>'salesperson_name' AS vendedor
      FROM books.sales_orders s
      WHERE s.status NOT IN ('void','draft')
        AND s.date IS NOT NULL
        AND coalesce(s.raw->>'zcrm_potential_id', '') <> ''
      ORDER BY s.raw->>'zcrm_potential_id', s.date, s.salesorder_id
    )
    SELECT p.customer_name AS account_name,
           extract(month from p.date)::int AS mes,
           count(*)::int AS tratos
    FROM primeras p
    WHERE extract(year from p.date) = $1
      AND p.customer_name IS NOT NULL
      AND ($2::text IS NULL OR p.vendedor = $2)
    GROUP BY p.customer_name, extract(month from p.date)`;
  const { rows } = await getHubPool().query(sql, [f.anio, f.owner]);
  return rows.map((r) => ({
    account_name: String(r.account_name),
    mes: Number(r.mes),
    tratos: Number(r.tratos),
  }));
}

export interface HubOrderRow {
  hub_order_id: string;
  customer_name: string;
  date: string;
  importe: number;
}

// Importe neto de una orden de venta: misma formula que getHubCustomerMonthSales,
// agrupada por orden en vez de por cliente y mes, para poder mostrarla en el
// buscador y en la lista de ordenes ya marcadas como ingresos de proyecto.
const IMPORTE_ORDEN = `
  round(sum(l.bcy_rate * l.quantity *
    COALESCE(1 - COALESCE((s.raw->>'bcy_discount_total')::numeric, 0) / NULLIF(s.bcy_sub_total, 0), 1)
  )::numeric, 2)::float8`;

// Busca ordenes de venta por cliente o por id interno de Zoho. NO busca por
// salesorder_number: esa clave no existe en raw del hub (comprobado contra el
// hub falso de test).
// Solo ordenes del anio que se esta mirando en la tabla: marcar una orden de otro
// anio no cambiaria nada de lo que se ve, y mezclar anios en el buscador lleva a
// marcar la orden equivocada de un cliente que repite cada anio.
export async function searchHubSalesOrders(query: string, anio: number): Promise<HubOrderRow[]> {
  const like = `%${query}%`;
  // s.date::text: sin el cast, pg devuelve un objeto Date (parser por defecto de
  // node-postgres para el tipo date) y String(...) lo serializa en la zona horaria
  // local del proceso, NO en 'YYYY-MM-DD'. El cast a texto evita esa conversion:
  // devuelve el mismo literal ISO que hay en la columna, sin ambiguedad horaria.
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date::text AS date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.status NOT IN ('void','draft')
      AND (s.customer_name ILIKE $1 OR s.salesorder_id ILIKE $1)
      AND extract(year from s.date) = $2
    GROUP BY s.salesorder_id, s.customer_name, s.date
    ORDER BY s.date DESC
    LIMIT 25`;
  const { rows } = await getHubPool().query(sql, [like, anio]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}

// Resuelve ordenes ya marcadas por su id, para calcular su importe siempre en
// vivo contra el hub. Con ids vacio no consulta el hub.
export async function getHubOrdersByIds(ids: string[]): Promise<HubOrderRow[]> {
  if (ids.length === 0) return [];
  const sql = `
    SELECT s.salesorder_id AS hub_order_id, s.customer_name, s.date::text AS date, ${IMPORTE_ORDEN} AS importe
    FROM books.salesorder_line_items l
    JOIN books.sales_orders s ON s.salesorder_id = l.salesorder_id
    WHERE s.salesorder_id = ANY($1::text[])
    GROUP BY s.salesorder_id, s.customer_name, s.date`;
  const { rows } = await getHubPool().query(sql, [ids]);
  return rows.map((r) => ({
    hub_order_id: String(r.hub_order_id),
    customer_name: String(r.customer_name),
    date: String(r.date),
    importe: Number(r.importe),
  }));
}

// Cambios de fase que entran en "Notificación Comercial" o salen de ella, leídos del
// historial crudo de Zoho Desk que replica el worker hub-sync. Un cambio de fase es un
// TicketUpdated con un elemento Status en eventInfo. La fase es una constante del
// servidor, nunca entrada del usuario.
// La ventana llega hasta el 31 de enero del año siguiente para que un episodio que
// empieza a final de diciembre pueda cerrarse; el filtro por mes de entrada lo hace la
// lógica pura de src/lib/kpi-tickets.ts.
// El instante sale en milisegundos (float8) y no como timestamptz: node-postgres lo
// convertiría en Date y la hora dependería de la zona del proceso.
// El CASE protege el LATERAL: un eventInfo que no sea array haría fallar la consulta
// entera por un solo evento raro, en vez de ignorarlo.
// La fase se compara normalizada, con la misma regla que normalizarFase: en Zoho se
// llama "Notificación  Comercial", con dos espacios, y una comparación exacta no
// encontraba ni un solo cambio. Los nombres salen crudos y los normaliza la lógica pura.
// Número y cliente van con LEFT JOIN: un ticket o una cuenta que aún no esté replicado
// en el hub no puede quitar un episodio del KPI; sale con número o cliente nulo.
const faseNormalizada = (expr: string) =>
  `btrim(regexp_replace(normalize(${expr}, NFC), '[\\s\\u00a0]+', ' ', 'g'))`;

export async function getHubCommercialNotificationChanges(anio: number): Promise<CambioFase[]> {
  const sql = `
    SELECT h.ticket_id AS "ticketId",
           (extract(epoch from h.event_time) * 1000)::float8 AS instante,
           s->'propertyValue'->>'previousValue' AS desde,
           s->'propertyValue'->>'updatedValue' AS hacia,
           t.number AS numero,
           a.name AS cliente
    FROM desk.ticket_history h
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.raw->'eventInfo') = 'array' THEN h.raw->'eventInfo' ELSE '[]'::jsonb END
    ) s
    LEFT JOIN desk.tickets t  ON t.id = h.ticket_id
    LEFT JOIN desk.accounts a ON a.id = t.account_id
    WHERE h.event_name = 'TicketUpdated'
      AND s->>'propertyName' = 'Status'
      AND $2::text IN (${faseNormalizada("s->'propertyValue'->>'previousValue'")},
                       ${faseNormalizada("s->'propertyValue'->>'updatedValue'")})
      AND h.event_time >= make_timestamptz($1::int, 1, 1, 0, 0, 0, 'America/Bogota')
      AND h.event_time <  make_timestamptz($1::int + 1, 2, 1, 0, 0, 0, 'America/Bogota')
    ORDER BY h.ticket_id, h.event_time`;
  const { rows } = await getHubPool().query(sql, [anio, FASE_NOTIFICACION_COMERCIAL]);
  return rows.map((r) => ({
    ticketId: String(r.ticketId),
    instante: Number(r.instante),
    desde: r.desde === null ? null : String(r.desde),
    hacia: r.hacia === null ? null : String(r.hacia),
    numero: r.numero === null ? null : Number(r.numero),
    cliente: r.cliente === null ? null : String(r.cliente),
  }));
}
