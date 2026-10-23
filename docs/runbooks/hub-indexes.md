# Runbook: índices recomendados en el zoho-hub

Hallazgo DATA-045. Las consultas del app al hub (`src/db/hub-*.ts`) filtran el año con un rango sobre la fecha (`h.date >= make_date($1, 1, 1) AND h.date < make_date($1 + 1, 1, 1)`) en lugar de `extract(year from h.date) = $1`. El rango es sargable: Postgres puede usar un índice B-tree sobre `date`. Sin el índice, el cambio no acelera nada, pero tampoco hace daño. Los resultados son los mismos.

**Este repositorio no aplica nada en el hub.** El hub es de solo lectura para el app (`hub_reader`, sesiones con `default_transaction_read_only`), y su esquema lo mantiene el worker `hub-sync` del repositorio `ambientalia-desk`. Los índices se crean allí, por quien administre el hub.

- **Corte de servicio:** ninguno. `CREATE INDEX CONCURRENTLY` no bloquea las escrituras del worker.
- **Reversible:** sí, con `DROP INDEX CONCURRENTLY <nombre>`.
- **Dónde:** como dueño de las tablas del hub, nunca como `hub_reader`.

Marcadores de este documento (no hay datos reales a propósito):

| Marcador | Qué es |
|---|---|
| `<VPS>` | Acceso SSH al servidor |
| `<contenedor-hub>` | Contenedor Postgres del zoho-hub (`docker ps`) |
| `<owner-hub>` | Rol dueño de los esquemas `books`, `crm` y `desk` |
| `<bd-hub>` | Base de datos del hub |

---

## 1. Comprobar qué índices existen ya

Puede que el worker ya cree alguno. Antes de crear nada:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'books'
  AND tablename IN ('invoices', 'sales_orders', 'invoice_line_items', 'salesorder_line_items')
ORDER BY tablename, indexname;
```

No crear un índice que ya exista con otro nombre sobre la misma columna.

## 2. Crear los índices

`CREATE INDEX CONCURRENTLY` no puede ir dentro de una transacción: se ejecuta cada sentencia por separado, en `psql` sin `BEGIN`.

```bash
ssh <VPS>
docker exec -it <contenedor-hub> psql -U <owner-hub> -d <bd-hub>
```

```sql
-- Filtro por año de facturas y órdenes (todas las lecturas por año del app).
CREATE INDEX CONCURRENTLY IF NOT EXISTS invoices_date_idx ON books.invoices (date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS sales_orders_date_idx ON books.sales_orders (date);

-- Unión línea → cabecera. Las claves primarias de las cabeceras ya están indexadas;
-- las claves foráneas de las líneas, no (Postgres no las indexa solo).
CREATE INDEX CONCURRENTLY IF NOT EXISTS invoice_line_items_invoice_id_idx ON books.invoice_line_items (invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS salesorder_line_items_salesorder_id_idx ON books.salesorder_line_items (salesorder_id);
```

Opcionales, solo si el `EXPLAIN` del paso 4 muestra que hacen falta:

```sql
-- KPIs comerciales: tratos por año de creación y ganados por fecha de cambio de fase.
CREATE INDEX CONCURRENTLY IF NOT EXISTS deals_created_time_idx ON crm.deals (created_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS deals_stage_modified_time_idx ON crm.deals (stage_modified_time);
```

## 3. Comprobar que quedaron válidos

Un `CREATE INDEX CONCURRENTLY` que falla a medias deja un índice inválido que no se usa:

```sql
SELECT c.relname AS indice, i.indisvalid AS valido
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN (
  'invoices_date_idx', 'sales_orders_date_idx',
  'invoice_line_items_invoice_id_idx', 'salesorder_line_items_salesorder_id_idx'
);
```

Si alguno sale con `valido = false`: `DROP INDEX CONCURRENTLY <nombre>;` y volver a crearlo.

## 4. Ver que el planificador los usa

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM books.invoice_line_items l
JOIN books.invoices h ON h.invoice_id = l.invoice_id
WHERE h.date >= make_date(2025, 1, 1) AND h.date < make_date(2026, 1, 1);
```

Debe aparecer `Index Scan` o `Bitmap Index Scan` sobre `invoices_date_idx`. Con pocas filas por año, Postgres puede preferir igualmente un `Seq Scan`: es una decisión de coste, no un fallo.

## 5. Marcha atrás

```sql
DROP INDEX CONCURRENTLY IF EXISTS books.invoices_date_idx;
DROP INDEX CONCURRENTLY IF EXISTS books.sales_orders_date_idx;
DROP INDEX CONCURRENTLY IF EXISTS books.invoice_line_items_invoice_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS books.salesorder_line_items_salesorder_id_idx;
```

El app sigue funcionando igual sin ellos.
