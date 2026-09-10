# Histórico de ventas por cliente 2015-2020 — Diseño

**Contexto:** La tabla "Ventas por cliente" arranca en 2021 porque el zoho-hub solo tiene datos desde ese año. Existe un histórico 2015-2020 en una hoja de cálculo, fuera de todo sistema. Hoy nadie puede ver la trayectoria completa de un cliente sin abrir dos fuentes distintas.

**Goal:** Incorporar el histórico 2015-2020 **exclusivamente** a la vista "Ventas por cliente" (`/clientes`), sin alterar ninguna otra pantalla, gráfico ni cálculo del resto de la aplicación.

**Arquitectura:** Tabla propia en la BD del app, poblada por un `INSERT` generado a mano y ejecutado por el operador. La acción de servidor `getCustomerSales` gana un flag opcional `includeHistory` que **solo pasa esta página**; las filas históricas se concatenan a las del hub antes de construir la matriz.

**Tech:** Drizzle, Postgres, react-query, Next 16.

---

## Decisiones (aprobadas)

- **Solo esta vista.** El resto de consumidores de `getCustomerSales` (`customer-evolution-card`, `customer-kpi-row`, el command palette) siguen viendo únicamente 2021+.
- **Los datos van a la BD, nunca al repositorio.** El repositorio de GitHub es **público** y esto son nombres de clientes de Ambientalia con su facturación. Un `.json` o `.ts` con la matriz quedaría en el historial de git de forma permanente e irreversible.
- **Cruce por nombre con alias curados.** Nada se adivina: lo que no case se reporta y lo decide una persona.
- **El histórico se ata a Facturas (FAC).** El origen no distingue OV de factura y representa facturación consolidada. Con el selector en Órdenes de Venta el histórico no se muestra.

## 0. Evidencia: el cruce de nombres, medido

Cruce del histórico (45 filas con importe) contra los 85 clientes que el hub devuelve hoy para Facturas:

| Bloque | Filas | Importe | % |
|---|---|---|---|
| Cruce exacto por nombre | 26 | $2.311.491 | 84,2% |
| Alias confirmados | 2 | $116.425 | 4,2% |
| Sin actividad desde 2021 | 17 | $317.121 | 11,6% |
| **Total** | **45** | **$2.745.037** | **100%** |

Los tres bloques suman el total exacto: la importación no pierde ningún importe.

**El fichero de origen trae 95 filas, pero 50 están completamente vacías.** Se descartan en la generación y no llegan a la BD. Ese descarte elimina de paso todos los falsos conflictos de nombre (Zero Span Labs, Ada & Co, PSL Proanalisis, Tecsaam, Tormet, CIAN): tenían el nombre distinto al del hub, pero ni un importe.

### Los dos alias confirmados

```
"Palermo Sociedad Portuaria"  -> "Palermo Sociedad Portuaria S.A. - Grupo Coremar"
"SGS Colombia S.A.S. - SGS"   -> "SGS Colombia S.A.S."
```

### Los 17 sin actividad desde 2021 no son un error

Son clientes que dejaron de facturar antes de 2021, por eso el hub no los conoce. El mayor es **Ambytec ($177.016)**. Aparecerán como filas nuevas con datos solo hasta 2020, que es el comportamiento correcto. Si alguno resultara ser un cliente que hoy factura bajo otra razón social, se añade como un alias más y se re-importa; el diseño lo soporta sin cambios.

### Limitación declarada de esta medición

El cruce se hizo contra la lista de clientes de **Facturas**. No se comparó contra la de Órdenes de Venta. Si alguno de esos 17 existiera en el hub solo con OV, aquí figura como inactivo sin serlo. Con el histórico atado a Facturas no afecta al resultado, pero la afirmación "no tiene actividad desde 2021" está acotada a facturas.

## 1. Migración `0007_historical_customer_sales.sql`

```sql
CREATE TABLE historical_customer_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  record_year integer NOT NULL,
  amount_usd numeric(15,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_name, record_year)
);

CREATE INDEX idx_hist_customer_company_year
  ON historical_customer_sales (company_id, record_year);
```

`customer_name` guarda el nombre **ya canonizado** (post-alias), de modo que la consulta de lectura no necesita resolver nada.

La restricción `UNIQUE` permite que la importación sea idempotente y se pueda re-ejecutar.

Esta migración **sí va al repositorio**: es solo esquema, sin ningún dato de cliente.

## 2. Importación de los datos

Un script local (`scripts/generar-historico.mjs`, commiteado) lee tres entradas que el operador aporta y que **nunca se versionan**:

1. El CSV del histórico 2015-2020.
2. El export de clientes de la propia app (botón Exportar de `/clientes`), que da la lista canónica.
3. Un fichero de alias (hoy, dos líneas).

Produce un `.sql` con los `INSERT` resueltos:

```sql
INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd)
VALUES (...)
ON CONFLICT (company_id, customer_name, record_year)
DO UPDATE SET amount_usd = EXCLUDED.amount_usd;
```

El script **reporta por consola** las filas que no casan, para que nadie las importe a ciegas.

**El `company_id` no se copia a mano.** El SQL generado lo resuelve por nombre, para que el operador no tenga que buscar un UUID ni pueda equivocarse al pegarlo:

```sql
INSERT INTO historical_customer_sales (company_id, customer_name, record_year, amount_usd)
SELECT c.id, v.customer_name, v.record_year, v.amount_usd
FROM companies c
CROSS JOIN (VALUES
  ('Corola Ambiental S.A.S.', 2016, 69809.00),
  ...
) AS v(customer_name, record_year, amount_usd)
WHERE c.name = 'Ambientalia S.A.S.'
ON CONFLICT (company_id, customer_name, record_year)
DO UPDATE SET amount_usd = EXCLUDED.amount_usd;
```

Recordatorio operativo: el terminal de EasyPanel junta las líneas al pegar. El generador debe emitir el `INSERT` en **una sola línea**, o entregarlo en un fichero que se cargue, nunca como bloque multilínea para pegar.

**El `.sql` generado no se commitea.** Lleva nombres de clientes e importes; se entrega al operador aparte y vive solo en local. Lo ejecuta en la pestaña Postgres Client, igual que las migraciones.

Las filas vacías y las de importe cero se descartan en la generación.

## 3. Cambios en el código de la aplicación

### 3.1 `getCustomerSales` — flag opcional

`CustomerSalesFilters` gana `includeHistory?: boolean`. Cuando es `true`:

- Se consulta `historical_customer_sales` para el rango pedido y se concatenan las filas al resultado del hub, como `CustomerYearRow[]`.
- **Solo si `tipo === "INVOICE"`.** Con Órdenes de Venta no se consulta.
- **Solo si `desdeAnio <= 2020`.** Fuera de ese rango no hay histórico y la consulta se omite; no se paga una consulta inútil.

Sin el flag, el comportamiento es idéntico al actual. Es lo que mantiene intactos al resto de consumidores.

### 3.2 `clientes/page.tsx`

- `FIRST_YEAR` pasa de `2021` a `2015` (constante local de este fichero, línea 42).
- La llamada a `getCustomerSales` pasa `includeHistory: true`, y `includeHistory` entra en la `queryKey` de react-query para que la caché no mezcle resultados.

`buildCustomerMatrix` **no se toca**: recibe una lista plana de `{customer, year, ventas}` y agrupa por cliente. Dos filas del mismo cliente procedentes de fuentes distintas colapsan en una sola fila de la matriz por construcción.

## 4. Tests

El fallo que de verdad importa es que un cliente presente en ambas fuentes salga **duplicado** en la tabla. Es puro y se prueba sin infraestructura nueva, en `src/lib/__tests__/customer-sales.test.ts`:

- Filas de hub e histórico para el mismo cliente producen **una sola** fila de matriz, con el valor correcto en cada año y el total sumado.
- Un cliente presente solo en el histórico produce su fila, con ceros en 2021+.
- Un cliente presente solo en el hub no se ve afectado.

Se escriben **antes** de la implementación y deben fallar primero.

## 5. Consecuencias que hay que anticipar

**La tabla se reordena.** Los $2.745.037 entran en la columna Total y en el porcentaje, así que el ranking cambia. Ambytec aparece de la nada con $177.016. Es correcto, pero no es un cambio cosmético y conviene avisar a quien use el informe.

**El export hereda el histórico.** Los botones CSV y Excel de esa página exportan lo visible, así que los ficheros descargados pasarán a incluir 2015-2020. Es coherente con la vista.

**Las vistas guardadas existentes siguen siendo válidas.** Guardan `desdeAnio`/`hastaAnio`; las que tengan 2021 como inicio seguirán mostrando desde 2021, sin histórico. No se corrompe ninguna.

## 6. Fuera de alcance

- Cualquier otra pantalla: drill-down de cliente, comparador, forecast, dashboard, KPIs. Ninguno ve el histórico.
- Órdenes de Venta.
- Interfaz de administración para editar el histórico o los alias. Se gestiona por SQL, como el resto de datos de referencia.
- Desglose por categoría, artículo o mes del histórico: el origen solo tiene totales anuales por cliente.

## 7. Criterios de aceptación

1. Con el rango 2015-2026 y tipo Facturas, la tabla muestra las columnas 2015 a 2020 con datos.
2. Un cliente con histórico **y** actividad 2021+ (por ejemplo Corola Ambiental) aparece en **una sola fila**, con ambos tramos.
3. Palermo Sociedad Portuaria aparece en una sola fila, con sus $114.831 históricos y sus $111.914 de 2025.
4. Con el tipo en Órdenes de Venta, no se muestra ninguna columna anterior a 2021 con datos.
5. `/clientes/[customer]`, el comparador, el dashboard y el command palette **siguen mostrando solo 2021+**. Verificado explícitamente, no supuesto.
6. La suma de la fila TOTAL para 2015-2020 es **$2.745.037**.
7. Re-ejecutar el `.sql` de importación no duplica filas ni altera los totales.
8. Gates intactos: typecheck limpio, lint en 10 warnings exactos, vitest sin regresiones más los tests nuevos, suite E2E en verde.
