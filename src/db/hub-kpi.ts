import { getHubPool } from "@/db/hub";

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
  return rows.map((r) => String(r.nombre));
}
