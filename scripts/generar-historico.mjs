/**
 * Genera el SQL de importacion del historico de ventas por cliente 2015-2020.
 *
 * Entradas (todas en scripts/historico/, ignorado por git):
 *   historico.csv   - matriz cliente x anio del origen (separador ";")
 *   clientes.csv    - export de /clientes (boton Exportar > CSV), lista canonica
 *   alias.csv       - "nombre en el historico";"nombre canonico del hub"
 *
 * Salida:
 *   scripts/historico/importar-historico.sql
 *
 * El SQL sale en UNA SOLA LINEA: el terminal de EasyPanel junta las lineas al
 * pegar y un bloque multilinea se corrompe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mismo patron que e2e/db/reset.mjs: fileURLToPath en vez de import.meta.dirname,
// que solo existe desde Node 20.11.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(AQUI, "historico");
const EMPRESA = "Ambientalia S.A.S.";

function leerCsv(nombre) {
  const ruta = path.join(DIR, nombre);
  if (!fs.existsSync(ruta)) throw new Error(`Falta ${ruta}`);
  return fs.readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(";"));
}

// "69,809" -> 69809 ; "" -> 0
const num = (v) => (v === undefined || v.trim() === "" ? 0 : Number(v.replace(/,/g, "")));
const sqlStr = (s) => "'" + s.replace(/'/g, "''") + "'";

const histFilas = leerCsv("historico.csv");
const anios = histFilas[0].slice(1).map(Number);

const canonicos = new Set(
  leerCsv("clientes.csv").slice(1).map((p) => p[0]).filter((n) => n && n !== "TOTAL")
);

const alias = new Map(
  leerCsv("alias.csv").map((p) => [p[0].trim(), p[1].trim()])
);

const valores = [];
const sinCasar = [];
let descartadas = 0;

for (const fila of histFilas.slice(1)) {
  const original = fila[0].trim();
  if (!original) continue;
  const importes = fila.slice(1).map(num);
  if (importes.every((v) => v === 0)) { descartadas++; continue; }

  const destino = alias.get(original) ?? original;
  if (!canonicos.has(destino)) sinCasar.push({ nombre: original, total: importes.reduce((a, b) => a + b, 0) });

  importes.forEach((importe, i) => {
    if (importe === 0) return;
    valores.push({ destino, anio: anios[i], importe });
  });
}

const tuplas = valores.map((v) => `(${sqlStr(v.destino)},${v.anio},${v.importe.toFixed(2)})`);

const sql =
  "INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd) " +
  "SELECT c.id, v.customer_name, v.record_year, v.amount_usd FROM companies c " +
  `CROSS JOIN (VALUES ${tuplas.join(",")}) AS v(customer_name, record_year, amount_usd) ` +
  `WHERE c.name = ${sqlStr(EMPRESA)} ` +
  "ON CONFLICT (company_id, customer_name, record_year) DO UPDATE SET amount_usd = EXCLUDED.amount_usd;";

fs.writeFileSync(path.join(DIR, "importar-historico.sql"), sql + "\n", "utf8");

const total = valores.reduce((a, v) => a + v.importe, 0);
console.log(`Filas de origen descartadas por estar vacias: ${descartadas}`);
console.log(`Pares (cliente, anio) a insertar: ${valores.length}`);
console.log(`Importe total: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`\nSQL escrito en scripts/historico/importar-historico.sql`);

if (sinCasar.length) {
  console.log(`\nSIN correspondencia en el hub (${sinCasar.length}). Entraran como clientes solo-historicos.`);
  console.log(`Si alguno deberia mapearse a un cliente existente, anadelo a alias.csv y vuelve a ejecutar:`);
  sinCasar.sort((a, b) => b.total - a.total).forEach((r) => console.log(`  $${Math.round(r.total).toLocaleString("en-US").padStart(9)}  ${r.nombre}`));
}
