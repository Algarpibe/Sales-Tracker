import pg from "pg";

// Los category_name mapean por NOMBRE a las categorias del app (asi lo hace
// src/actions/sales-actions.ts). purchase_rate > 0 = bien con costo; 0 = servicio.
const ITEMS = [
  { item_id: "IT-001", name: "Analisis de agua residual", sku: "AGU-01", category_name: "Aguas", purchase_rate: 120 },
  { item_id: "IT-002", name: "Muestreo de agua potable", sku: "AGU-02", category_name: "Aguas", purchase_rate: 80 },
  { item_id: "IT-003", name: "Monitoreo de emisiones", sku: "AIR-01", category_name: "Aire", purchase_rate: 200 },
  { item_id: "IT-004", name: "Caracterizacion de suelo", sku: "SUE-01", category_name: "Suelos", purchase_rate: 0 },
  { item_id: "IT-005", name: "Asesoria ambiental", sku: "SUE-02", category_name: "Suelos", purchase_rate: 0 },
];

const CUSTOMERS = [
  "Alfa Industrial",
  "Beta Minera",
  "Gamma Agro",
  "Delta Textil",
  "Epsilon Energia",
];

// Vendedores ficticios: el hub real guarda el nombre en raw.salesperson_name.
// Rotan cada dos meses, no cada mes: las facturas solo existen en meses pares,
// asi que alternar por mes dejaria un unico vendedor en books.invoices.
const VENDEDORES = ["Vendedora Ficticia", "Vendedor Ficticio"];

const FIRST_SEEDED_YEAR = 2020;
const YEARS = [2020, 2021, 2022, 2023, 2024];

/**
 * 2020 es PARCIAL a proposito, con ventas solo en los meses 10, 11 y 12. Asi
 * es la produccion real: el proyecto tiene datos desde 2020, pero ese anio
 * esta incompleto y por eso los componentes arrancan en FIRST_YEAR = 2021
 * (ver src/components/charts/premium/historical-sales-category.tsx). Un
 * registro con anio anterior a FIRST_YEAR es justo la condicion que reproduce
 * el bug del bucket inexistente (commit 9dc66ee): sin la guarda, el bucket
 * annualGrouped[2020] no existe y el TypeError al escribir en el vacia el
 * grafico completo en vez de ignorar solo ese registro.
 *
 * 2021 solo tiene ventas de 'Aguas'. Ese hueco es DELIBERADO pero cubre algo
 * distinto: dentro de un anio VALIDO (posterior o igual a FIRST_YEAR), ejercita
 * los estados vacios por categoria. No reproduce 9dc66ee, cuyo mecanismo es el
 * anio anterior a FIRST_YEAR, no un hueco de categoria.
 */
function itemsForYear(year) {
  return year === 2021 ? ITEMS.filter((i) => i.category_name === "Aguas") : ITEMS;
}

// 2020 solo siembra el ultimo trimestre: refleja que ese anio esta incompleto
// en produccion, sin dejarlo totalmente vacio (un anio sin ningun registro no
// aparece en absoluto y no reproduce nada).
function monthsForYear(year) {
  return year === FIRST_SEEDED_YEAR ? [10, 11, 12] : Array.from({ length: 12 }, (_, i) => i + 1);
}

// Importes deterministas: sin RNG, para que dos corridas den exactamente lo
// mismo. La base es FIRST_SEEDED_YEAR (2020) para que el multiplicador de anio
// nunca sea negativo, ni siquiera para el anio parcial.
function amountFor(year, month, itemIndex) {
  return 100 + (year - FIRST_SEEDED_YEAR) * 50 + month * 10 + itemIndex * 7;
}

export async function seedHub(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");

    for (const item of ITEMS) {
      await client.query(
        `INSERT INTO books.items (item_id, name, sku, category_name, raw)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [item.item_id, item.name, item.sku, item.category_name,
         JSON.stringify({ purchase_rate: String(item.purchase_rate) })],
      );
    }

    let orders = 0;
    let invoices = 0;

    for (const year of YEARS) {
      const items = itemsForYear(year);
      for (const month of monthsForYear(year)) {
        const customer = CUSTOMERS[(month - 1) % CUSTOMERS.length];
        const date = `${year}-${String(month).padStart(2, "0")}-15`;
        const soId = `SO-${year}-${String(month).padStart(2, "0")}`;
        // Meses pares llevan factura; los impares quedan sin facturar (alimenta BACKLOG).
        const hasInvoice = month % 2 === 0;
        const vendedor = VENDEDORES[Math.floor((month - 1) / 2) % VENDEDORES.length];

        const lines = items.map((item, idx) => ({
          line_item_id: `${soId}-L${idx}`,
          item_id: item.item_id,
          bcy_rate: amountFor(year, month, idx),
          quantity: 2,
        }));
        const subTotal = lines.reduce((acc, l) => acc + l.bcy_rate * l.quantity, 0);

        await client.query(
          `INSERT INTO books.sales_orders (salesorder_id, date, status, customer_name, bcy_sub_total, raw)
           VALUES ($1, $2, 'confirmed', $3, $4, $5::jsonb)`,
          [soId, date, customer, subTotal,
           JSON.stringify({
             invoiced_status: hasInvoice ? "invoiced" : "not_invoiced",
             bcy_discount_total: "0",
             salesperson_name: vendedor,
           })],
        );
        orders++;

        for (const line of lines) {
          await client.query(
            `INSERT INTO books.salesorder_line_items (line_item_id, salesorder_id, item_id, bcy_rate, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [line.line_item_id, soId, line.item_id, line.bcy_rate, line.quantity],
          );
        }

        if (!hasInvoice) continue;

        const invId = `INV-${year}-${String(month).padStart(2, "0")}`;
        await client.query(
          `INSERT INTO books.invoices (invoice_id, salesorder_id, date, status, customer_name, bcy_sub_total, raw)
           VALUES ($1, $2, $3, 'paid', $4, $5, $6::jsonb)`,
          [invId, soId, date, customer, subTotal, JSON.stringify({ bcy_discount_total: "0", salesperson_name: vendedor })],
        );
        invoices++;

        for (const [idx, line] of lines.entries()) {
          await client.query(
            `INSERT INTO books.invoice_line_items (line_item_id, invoice_id, item_id, bcy_rate, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [`${invId}-L${idx}`, invId, line.item_id, line.bcy_rate, line.quantity],
          );
        }
      }
    }

    await client.query("COMMIT");
    console.log(`  hub sembrado: ${ITEMS.length} items, ${orders} pedidos, ${invoices} facturas`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
