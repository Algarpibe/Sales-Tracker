# Tratos cerrados ganados por la hora de entrada en la fase — Diseño

**Goal:** La fila «Tratos cerrados ganados» cuenta cada trato en el mes en que **entró en la fase «Cerrado ganado»** de Zoho CRM, con su fecha y hora reales. Deja de usar `closing_date`, un campo que el comercial rellena a mano.

**Arquitectura:** Dos partes en dos repositorios, como en «Tickets en plazo».
1. El worker `hub-sync` de `ambientalia-desk` rellena `crm.deals.stage_modified_time` en `zoho-hub`, que hoy está vacío en todos los tratos.
2. SalesTracker cuenta los tratos ganados por esa columna, en hora de Bogotá.

**Sustituye** al PR #25, que contaba por la primera orden de venta de Books. Se cerró sin fusionar porque el usuario descartó ese criterio.

---

## 1. Contexto verificado (2026-09-24)

- **El dato que se quiere** es el «Historial de fases» del trato en CRM: el momento en que pasó a «Cerrado ganado». Coincide al segundo con el campo `Stage_Modified_Time` del trato. Se comprobó con un trato real:
  - `Stage_History` → «Cerrado ganado» a las 2026-08-31 14:33:09 −05:00;
  - `Stage_Modified_Time` = 2026-08-31 14:33:09 −05:00.

  Para un trato que **está** en «Cerrado ganado», su `Stage_Modified_Time` es la hora en que entró en esa fase.
- **El hub tiene la columna pero vacía.** `crm.deals.stage_modified_time` existe y el worker pide `Stage_Modified_Time` en el listado (`packages/zoho-sync/src/crmHub/modules.ts`). Sin embargo, los 1029 tratos ganados la tienen nula, y `raw->>'Stage_Modified_Time'` también es nulo en todos, incluso en los sincronizados hoy.
- **Causa: limitación de la API de Zoho CRM.**

  | Vía | `Stage_Modified_Time` |
  |---|---|
  | Listado `GET /Deals?fields=…` (lo que usa el worker) | siempre `null` |
  | COQL | rechaza la columna (`INVALID_QUERY`) |
  | Ficha individual `GET /Deals/{id}` | con valor |
  | `GET /Deals/{id}/Stage_History` | con valor |

- **El listado sobrescribe la columna.** `upsertRow` (`packages/zoho-sync/src/crmHub/repo.ts`) actualiza todas las columnas del `toRow` con `EXCLUDED`. Aunque se rellenara `stage_modified_time`, la siguiente pasada del listado la dejaría otra vez en nula.
- **Hoy** SalesTracker cuenta los tratos con `stage = ANY(WON_DEAL_STAGES)` por `closing_date` (`getHubWonDealsMonth`, `src/db/hub-kpi.ts`).

## 2. Reglas (acordadas con el usuario)

1. Un trato cuenta como ganado si **está** en «Cerrado ganado» (`WON_DEAL_STAGES`).
2. Cuenta en el **mes de `stage_modified_time`, en hora de Bogotá**.
3. Si un trato ganado pasa luego a otra fase, deja de contar. Si vuelve a «Cerrado ganado», cuenta en el mes de la última entrada.
4. Un trato ganado con `stage_modified_time` nulo **no cuenta**. No se recurre a `closing_date`: mezclar los dos criterios ocultaría que el worker no ha terminado. Esto obliga a respetar el orden de despliegue de §5.
5. El filtro por comercial (`owner_name`), el diálogo de detalle y las filas de Generación de tratos no cambian.

## 3. Parte 1 — `ambientalia-desk`, worker `hub-sync`

### 3.1 El listado deja de tocar la columna

En `modules.ts`, el módulo Deals quita `Stage_Modified_Time` de `fields` y `stage_modified_time` de `toRow`. Así `upsertRow` ni la inserta ni la actualiza, y la columna queda en manos de §3.3. Un test fija que sincronizar un trato por el listado conserva su `stage_modified_time`.

### 3.2 Esquema

En `schema-crm.sql`, idempotente:

```sql
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS stage_detail_synced_at timestamptz;
```

Guarda el `modified_time` del trato en el momento en que se leyó su ficha. Es la misma idea que `tickets.history_synced_at`.

### 3.3 `syncPendingWonStages({ limite, pausaMs })`

Método nuevo de `createCrmSync`:

- Elige los tratos con `stage` en las fases ganadas y con `stage_detail_synced_at IS NULL OR stage_detail_synced_at < modified_time`, ordenados por `modified_time DESC`, hasta `limite`.
- Por cada uno, pide `GET /Deals/{id}` y hace `UPDATE crm.deals SET stage_modified_time = <Stage_Modified_Time de la ficha>, stage_detail_synced_at = <modified_time leído al elegirlo>`.
- Es tolerante: un fallo se cuenta, guarda el motivo del primero y el trato vuelve a salir en la pasada siguiente. Hace una pausa entre llamadas.
- Devuelve `{ intentados, poblados, fallidos, motivoPrimerFallo }`.
- Las fases ganadas son una constante del worker (`['Cerrado ganado']`), con un comentario que dice que tiene que coincidir con `WON_DEAL_STAGES` de SalesTracker.
- Solo se piden los **ganados**, por economía de llamadas: son 1029 hoy, frente a varios miles de tratos en total. El KPI no necesita la hora de las demás fases.

### 3.4 Enganche

En `scheduleHubSync`, el temporizador de CRM pasa a ser `crmSync.syncRecent()` → `syncPendingWonStages({ limite: 50 })`, con su propio `catch`.
- **Barrido inicial:** unas 21 pasadas.
- **Después:** solo los ganados modificados.

### 3.5 Tests (vitest + pg-mem)

- elige los ganados con la marca nula o anterior a `modified_time`, e ignora los que no están ganados o ya están al día;
- guarda la hora de la ficha y la marca;
- un fallo no corta la pasada;
- respeta `limite`;
- el listado no pisa `stage_modified_time`;
- el enganche respeta el orden y aísla los fallos.

## 4. Parte 2 — SalesTracker

- `getHubWonDealsMonth` cambia `closing_date` por `stage_modified_time AT TIME ZONE 'America/Bogota'`, tanto para el año como para el mes. Mantiene `stage = ANY(WON_DEAL_STAGES)`, el filtro por `owner_name` y la forma de salida. El comentario explica el porqué y la regla 4.
- En E2E, `crm.deals` del hub falso gana `stage_modified_time timestamptz`, y la semilla la rellena en los tratos ganados, con alguno cuyo mes en Bogotá difiere del mes UTC. Se actualizan las aserciones de la fila de ganados y de su detalle.

## 5. Orden de entrega y despliegue

1. **PR del worker** → fusionar → redesplegar `hub-sync`. `migrate` aplica el `ALTER` al arrancar.
2. **Esperar a que termine el barrido.** Comprobarlo en `zoho-hub`:
   ```sql
   SELECT count(*) FILTER (WHERE stage_modified_time IS NULL) AS pendientes, count(*) AS ganados
   FROM crm.deals WHERE stage = 'Cerrado ganado';
   ```
   `pendientes` tiene que llegar a 0.
3. **PR de SalesTracker** → fusionar → desplegar. Si se despliega antes de que termine el barrido, la fila mostrará menos tratos de los reales (regla 4).

Ninguno de los dos lleva migración manual. Los dos repositorios son públicos: los tests y la semilla usan solo datos inventados.

## 6. Fuera de alcance

- Replicar el historial de fases completo (`Stage_History`) para otros KPIs de tiempos entre fases de CRM.
- La hora de entrada en fases que no sean ganadas.
