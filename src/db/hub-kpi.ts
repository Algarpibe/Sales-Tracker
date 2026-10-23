import { getHubPool } from "@/db/hub";
import { netAmountSumExpr, sourceFor, yearRangeExpr } from "@/db/hub-sql";
import { isExcludedSalesperson, parseExcludedSalespeople, WON_DEAL_STAGES } from "@/lib/commercial-kpis";
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
export async function getHubCustomerMonthByOwner(f: {
  tipo: RecordType;
  anio: number;
  owner: string | null;
}): Promise<CustomerMonthRow[]> {
  // La tabla se elige en servidor a partir del tipo, nunca por entrada del usuario.
  const src = sourceFor(f.tipo);
  const sql = `
    SELECT h.customer_name AS customer,
           extract(month from h.date)::int AS mes,
           ${netAmountSumExpr("l", "h")} AS importe
    FROM ${src.lines} l
    JOIN ${src.header} h ON h.${src.fk} = l.${src.fk}
    WHERE ${yearRangeExpr("h.date", "$1")}
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
// created_time es timestamptz y el año se toma en la zona horaria de la SESION, igual
// que el extract() del SELECT: make_timestamptz sin zona usa esa misma zona, asi que el
// rango [1 ene, 1 ene siguiente) equivale al extract(year ...) = $1 de antes (DATA-045).
export async function getHubDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.created_time)::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE d.created_time >= make_timestamptz($1::int, 1, 1, 0, 0, 0)
      AND d.created_time <  make_timestamptz($1::int + 1, 1, 1, 0, 0, 0)
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

// Tratos ganados por cuenta y mes. Se cuenta por stage_modified_time, el instante en que
// el trato entro en su fase actual segun Zoho CRM, y no por closing_date: esa la rellena
// el comercial a mano y puede caer en otro mes. Como solo se miran tratos que ESTAN en
// una fase ganada, es la hora en que se gano; si sale de la fase deja de contar, y si
// vuelve cuenta en el mes de la ultima entrada, porque Zoho reescribe esa hora.
// El mes se toma en hora de Bogota: un trato ganado a las 21:00 del 31 es de ese mes
// aunque en UTC ya sea el dia 1.
// Un ganado con stage_modified_time nula NO cuenta y no se recurre a closing_date: la
// columna la rellena el worker hub-sync de ambientalia-desk, y mezclar los dos criterios
// ocultaria que el worker no ha terminado. Por eso esta consulta solo se despliega con
// el barrido del worker a 0 pendientes.
// El año se filtra con un rango de instantes en hora de Bogota (DATA-045): es el mismo
// criterio que el extract(year ... AT TIME ZONE 'America/Bogota') del mes, sin envolver
// la columna.
export async function getHubWonDealsMonth(f: {
  anio: number;
  owner: string | null;
}): Promise<DealMonthRow[]> {
  const sql = `
    SELECT d.account_name,
           extract(month from d.stage_modified_time AT TIME ZONE 'America/Bogota')::int AS mes,
           count(*)::int AS tratos
    FROM crm.deals d
    WHERE d.stage_modified_time IS NOT NULL
      AND d.stage_modified_time >= make_timestamptz($1::int, 1, 1, 0, 0, 0, 'America/Bogota')
      AND d.stage_modified_time <  make_timestamptz($1::int + 1, 1, 1, 0, 0, 0, 'America/Bogota')
      AND d.stage = ANY($2::text[])
      AND d.account_name IS NOT NULL
      AND ($3::text IS NULL OR d.owner_name = $3)
    GROUP BY d.account_name, extract(month from d.stage_modified_time AT TIME ZONE 'America/Bogota')`;
  const { rows } = await getHubPool().query(sql, [f.anio, [...WON_DEAL_STAGES], f.owner]);
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
const IMPORTE_ORDEN = netAmountSumExpr("l", "s");

// Busca ordenes de venta por cliente o por id interno de Zoho. NO busca por
// salesorder_number: esa clave no existe en raw del hub (comprobado contra el
// hub falso de test).
// Solo ordenes del anio que se esta mirando en la tabla: marcar una orden de otro
// anio no cambiaria nada de lo que se ve, y mezclar anios en el buscador lleva a
// marcar la orden equivocada de un cliente que repite cada anio.
export async function searchHubSalesOrders(query: string, anio: number): Promise<HubOrderRow[]> {
  // Escapa los comodines de ILIKE (\ es su escape por defecto): "50%" busca "50%" literal.
  const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
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
      AND ${yearRangeExpr("s.date", "$2")}
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
