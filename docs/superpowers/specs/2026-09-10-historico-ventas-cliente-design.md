# Histórico de ventas por cliente 2015-2020 — Diseño

**Contexto:** La tabla "Ventas por cliente" arranca en 2021. Existe un histórico 2015-2020 en una hoja de cálculo, fuera de todo sistema. Hoy nadie puede ver la trayectoria completa de un cliente sin abrir dos fuentes distintas.

**Corrección de una premisa inicial.** La primera versión de este spec decía que el hub "solo tiene datos desde 2021". Es falso, y se descubrió al desplegar: al bajar `FIRST_YEAR` a 2015 aparecieron importes de **2020** en el hub, tanto en Órdenes de Venta como en Facturas. La razón real es que en Ambientalia **se empezó a trabajar con Zoho a mediados de 2020**, así que ese año está en el hub pero incompleto — por eso los componentes arrancaban en 2021 y nadie lo veía.

Medido en producción: el 2020 del hub suma bastante menos que el 2020 del histórico, y cubre solo a una parte de los clientes. Sumar ambas fuentes habría inflado 2020: `buildCustomerMatrix` acumula por `(cliente, año)` y no detecta solapes.

**Goal:** Incorporar el histórico 2015-2020 **exclusivamente** a la vista "Ventas por cliente" (`/clientes`), sin alterar ninguna otra pantalla, gráfico ni cálculo del resto de la aplicación.

**Arquitectura:** Tabla propia en la BD del app, poblada por un `INSERT` generado a mano y ejecutado por el operador. La acción de servidor `getCustomerSales` gana un flag opcional `includeHistory` que **solo pasa esta página**; las filas históricas se concatenan a las del hub antes de construir la matriz.

**Tech:** Drizzle, Postgres, react-query, Next 16.

---

## Decisiones (aprobadas)

- **Solo esta vista.** El resto de consumidores de `getCustomerSales` (`customer-evolution-card`, `customer-kpi-row`, el command palette) siguen viendo únicamente 2021+.
- **Los datos van a la BD, nunca al repositorio.** El repositorio de GitHub es **privado**, pero se trata como si pudiera publicarse, y esto son nombres de clientes de Ambientalia con su facturación. Un `.json` o `.ts` con la matriz quedaría en el historial de git de forma permanente e irreversible.
- **Cruce por nombre con alias curados.** Nada se adivina: lo que no case se reporta y lo decide una persona.
- **El histórico se ata a Facturas (FAC).** El origen no distingue OV de factura y representa facturación consolidada. Con el selector en Órdenes de Venta el histórico no se muestra.
- **El histórico manda hasta 2020 incluido.** Con `includeHistory` activo se descartan las filas del hub anteriores a 2021: ≤2020 sale del histórico, ≥2021 del hub. Decisión del usuario, y por el motivo correcto: el 2020 del hub está incompleto porque Zoho se adoptó a mitad de ese año. Lo hace `mergeWithHistory` en `src/lib/customer-sales.ts`, de modo que el solape es **imposible por construcción**, no por vigilancia. Fuera de esta vista el hub se lee tal cual, sin filtrar.

## 0. Evidencia: el cruce de nombres, medido

Cruce del histórico (45 filas con importe) contra los 85 clientes que el hub devuelve hoy para Facturas:

| Bloque | Filas | Importe | % |
|---|---|---|---|
| Cruce exacto por nombre | 26 | $2.311.491 | 84,2% |
| Alias confirmados | 2 | $116.425 | 4,2% |
| Sin actividad desde 2021 | 17 | $317.121 | 11,6% |
| **Total** | **45** | **$2.745.037** | **100%** |

Los tres bloques suman el total exacto: la importación no pierde ningún importe.

**El fichero de origen trae 95 filas, pero 50 están completamente vacías.** Se descartan en la generación y no llegan a la BD. Ese descarte elimina de paso todos los falsos conflictos de nombre (seis clientes del fichero de origen): tenían el nombre distinto al del hub, pero ni un importe.

### Los dos alias confirmados

```
"Cliente B"                   -> "Cliente B S.A. - Grupo B"
"Cliente C S.A.S. - C"        -> "Cliente C S.A.S."
```

### Los 17 sin actividad desde 2021 no son un error

Son clientes que dejaron de facturar antes de 2021, por eso el hub no los conoce. El mayor es **Cliente D ($X)**. Aparecerán como filas nuevas con datos solo hasta 2020, que es el comportamiento correcto. Si alguno resultara ser un cliente que hoy factura bajo otra razón social, se añade como un alias más y se re-importa; el diseño lo soporta sin cambios.

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
  ('Cliente A S.A.S.', 2016, 0.00),
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

### 3.3 Los clientes solo-históricos no deben enlazar al drill-down

En `clientes/page.tsx:272` cada nombre es un `<Link>` a `/clientes/[customer]`. El drill-down tiene su propio `FIRST_YEAR = 2021`, consulta solo el hub y **no comprueba que el cliente exista**: coge el nombre de la URL y lo pinta como título.

Sin hacer nada, los 17 clientes sin actividad desde 2021 pasarían a ser filas clicables que llevan a una página con su nombre y todas las tarjetas vacías. Es un callejón sin salida que hoy no existe.

**Solución:** esas filas se renderizan como texto plano, no como enlace, con un distintivo discreto (`solo histórico`) junto al nombre.

**Cómo se distingue el origen, sin tocar `buildCustomerMatrix`:**

- `CustomerYearRow` gana un campo **opcional** `source?: "hub" | "historical"`. Al ser opcional, los seis consumidores restantes no cambian ni de tipo ni de comportamiento.
- `getCustomerSales` lo rellena solo cuando fusiona: las filas del hub llevan `"hub"`, las históricas `"historical"`.
- La página deriva el conjunto de clientes con presencia en el hub a partir de las filas que ya tiene:

  ```ts
  const conHub = useMemo(
    () => new Set(rows.filter((r) => r.source !== "historical").map((r) => r.customer)),
    [rows]
  );
  ```

- En el render, se emite `<Link>` solo si `conHub.has(r.customer)`.

Se distingue por **procedencia, no por importes a cero**. Un cliente del hub cuyos años estén todos a cero (hoy existen, como "Ambientalia S.A.S.") conserva su enlace exactamente como ahora: este cambio no altera ninguna fila preexistente.

## 4. Tests

El fallo que de verdad importa es que un cliente presente en ambas fuentes salga **duplicado** en la tabla. Es puro y se prueba sin infraestructura nueva, en `src/lib/__tests__/customer-sales.test.ts`:

- Filas de hub e histórico para el mismo cliente producen **una sola** fila de matriz, con el valor correcto en cada año y el total sumado.
- Un cliente presente solo en el histórico produce su fila, con ceros en 2021+.
- Un cliente presente solo en el hub no se ve afectado.

Se escriben **antes** de la implementación y deben fallar primero.

## 5. Consecuencias que hay que anticipar

**La tabla se reordena.** Los $2.745.037 entran en la columna Total y en el porcentaje, así que el ranking cambia. Cliente D aparece de la nada con $X. Es correcto, pero no es un cambio cosmético y conviene avisar a quien use el informe.

**El export hereda el histórico.** Los botones CSV y Excel de esa página exportan lo visible, así que los ficheros descargados pasarán a incluir 2015-2020. Es coherente con la vista.

**Las vistas guardadas existentes siguen siendo válidas.** Guardan `desdeAnio`/`hastaAnio`; las que tengan 2021 como inicio seguirán mostrando desde 2021, sin histórico. No se corrompe ninguna.

## 6. Fuera de alcance

- Cualquier otra pantalla: drill-down de cliente, comparador, forecast, dashboard, KPIs. Ninguno ve el histórico.
- Órdenes de Venta.
- Interfaz de administración para editar el histórico o los alias. Se gestiona por SQL, como el resto de datos de referencia.
- Desglose por categoría, artículo o mes del histórico: el origen solo tiene totales anuales por cliente.

## 7. Criterios de aceptación

1. Con el rango 2015-2026 y tipo Facturas, la tabla muestra las columnas 2015 a 2020 con datos.
2. Un cliente con histórico **y** actividad 2021+ (por ejemplo Cliente A) aparece en **una sola fila**, con ambos tramos.
3. Cliente B aparece en una sola fila, con su importe histórico y su importe de 2025.
4. Con el tipo en Órdenes de Venta, no se muestra ninguna columna anterior a 2021 con datos.
5. `/clientes/[customer]`, el comparador, el dashboard y el command palette **siguen mostrando solo 2021+**. Verificado explícitamente en los seis consumidores de `getCustomerSales`, no supuesto.
6. Los 17 clientes solo-históricos aparecen como texto plano con el distintivo `solo histórico`, **sin enlace**. Los clientes con presencia en el hub conservan su enlace, incluidos los que tienen todos los años a cero.
7. La suma de la fila TOTAL para 2015-2020 es **$2.745.037**.
8. Re-ejecutar el `.sql` de importación no duplica filas ni altera los totales.
9. Gates intactos: typecheck limpio, lint en 10 warnings exactos, vitest sin regresiones más los tests nuevos, suite E2E en verde.
