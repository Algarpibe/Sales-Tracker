# Detalle de tickets en plazo — Diseño

**Goal:** Al pulsar una cifra mensual de la fila «Tickets de Servicio Técnico en plazo», se abre un diálogo con los episodios que componen ese porcentaje. De cada uno enseña el ticket, el cliente, cuándo entró y salió de «Notificación Comercial», las horas laborables y si estuvo en plazo. En un apartado aparte enseña también los episodios que no cuentan.

**Arquitectura:** La consulta del hub que ya existe se amplía con el número del ticket y el nombre del cliente. Una sola función pura clasifica cada episodio, y de ella salen tanto la celda como el detalle, así que no pueden discrepar. El diálogo es un componente nuevo en su propio fichero. No hay consulta nueva ni migración.

**Tech:** Next 16, @tanstack/react-query, base-ui (`Dialog` de `src/components/ui/dialog.tsx`), vitest, Playwright.

**Base:** `docs/superpowers/specs/2026-09-23-kpi-tickets-en-plazo-design.md` (reglas del KPI, §2) y PR #22/#23.

---

## 1. Contexto verificado

- `getHubCommercialNotificationChanges(anio)` (`src/db/hub-kpi.ts`) devuelve `CambioFase { ticketId, instante, desde, hacia }` y filtra por la fase normalizada (PR #23).
- En el hub, `desk.tickets` tiene `id`, `number` (integer) y `account_id`. `desk.accounts` tiene `id` y `name`.
- La tabla ya tiene un diálogo de detalle por celda para ventas y tratos (`monthBreakdown`, `breakdownSourceFor`). Ese diálogo agrupa por cliente y suma importes, y no sirve aquí: el de tickets lleva una fila por episodio y otras columnas.
- `commercial-kpi-table.tsx` ronda las 750 líneas. El diálogo nuevo va en su propio fichero.

## 2. Decisiones acordadas con el usuario

1. **Columnas:** Ticket (número), Cliente, Entrada en Notificación Comercial, Salida y fase de destino, Horas laborables y Estado.
2. **Orden:** primero los fuera de plazo y después los en plazo; dentro de cada grupo, de más horas a menos.
3. **Pie:** «N en plazo de M → X %», el mismo porcentaje que la celda.
4. **Los que no cuentan** (excluidos por Rechazo y abiertos todavía sin vencer) aparecen en un apartado aparte, al final y atenuado, con el título «No cuentan para el porcentaje».
5. **Datos:** se amplía la consulta que ya existe (enfoque A), no se hace una consulta al pulsar.

## 3. Datos — `src/db/hub-kpi.ts`

La consulta añade dos `LEFT JOIN`:

```sql
LEFT JOIN desk.tickets t  ON t.id = h.ticket_id
LEFT JOIN desk.accounts a ON a.id = t.account_id
```

y dos columnas: `t.number AS numero` y `a.name AS cliente`. Los dos son `LEFT JOIN`: un ticket o una cuenta que falte en el hub no quita el episodio del KPI. Sale con número o cliente nulo y el diálogo lo pinta como «—».

`CambioFase` gana `numero: number | null` y `cliente: string | null`.

## 4. Lógica pura — `src/lib/kpi-tickets.ts`

- **`Episodio`** gana `numero`, `cliente` (tomados del primer cambio del ticket) y `faseSalida: string | null`, la fase de destino de la salida, normalizada. Es nula si el episodio sigue abierto.
- **`clasificarEpisodio(e, ahora)`** devuelve `{ estado, horas }`, donde:
  - `estado` es `"en_plazo"`, `"fuera_de_plazo"`, `"excluido"` o `"abierto_sin_vencer"`;
  - `horas` son las horas laborables hasta `fin` o, si el episodio sigue abierto, hasta `ahora`. Es 0 en los excluidos.

  Las reglas son las de la spec base, §2: medible con menos de `PLAZO_HORAS`, en plazo; medible con esas horas o más, fuera de plazo; abierto con esas horas o más, fuera de plazo; abierto con menos, sin vencer; excluido, excluido.
- **`contarTicketsEnPlazo`** pasa a apoyarse en `clasificarEpisodio`. Su resultado no cambia, y sus tests actuales lo fijan.
- **`detalleTicketsMes(episodios, anio, mes, ahora)`** devuelve `{ cuentan: FilaDetalleTicket[], noCuentan: FilaDetalleTicket[], enPlazo: number, total: number }`:
  - toma los episodios cuyo mes de entrada, en hora de Bogotá, es `mes` (de 1 a 12) de `anio`;
  - `cuentan` son los en plazo y fuera de plazo, ordenados como dice §2.2;
  - `noCuentan` son los excluidos y los abiertos sin vencer, ordenados por entrada;
  - `total` es `cuentan.length`.
- **`FilaDetalleTicket`**: `{ ticketId, numero, cliente, inicio, fin, faseSalida, horas, estado }`.
- **`formatoInstanteBogota(ms)`**: `"dd/MM HH:mm"` en hora de Bogotá con `Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", ... })`. Es pura y tiene test.
- **Tests:**
  - los cuatro estados de `clasificarEpisodio`, incluidos los límites de 12 horas exactas;
  - el orden de `cuentan` y de `noCuentan`;
  - el filtro por mes con la frontera de Bogotá;
  - `formatoInstanteBogota` con un instante cuyo día UTC es distinto del de Bogotá;
  - **coherencia**: para cada mes, `enPlazo` y `total` del detalle son iguales a los contadores de `contarTicketsEnPlazo`.

## 5. Interfaz

- En `commercial-kpi-table.tsx`, las celdas mensuales de `tickets_st` con valor se pueden pulsar, con el mismo estilo de botón que las de ventas y tratos. Una celda «—» no abre nada.
- Un estado nuevo, `celdaTickets: { mes } | null`, abre `TicketsDetalleDialog`, que no es el diálogo que ya existe.
- **`src/components/charts/comercial/tickets-detalle-dialog.tsx`** (nuevo) recibe `{ abierto, onCerrar, anio, mes, detalle }`, con el detalle ya calculado. Es presentacional: no llama al servidor.
  - **Título:** «Tickets en plazo · {Mes} {año}».
  - **Tabla:** con las columnas de §2.1. Horas con un decimal. El estado va en texto con color, verde si está en plazo y rojo si está fuera. La salida se pinta como «dd/MM HH:mm → {fase}», y como «abierto» si no hay salida.
  - **Apartado «No cuentan para el porcentaje»**, atenuado, con las mismas columnas. Su estado es «Excluido (rechazo)» o «Abierto, sin vencer». No aparece si está vacío.
  - **Pie:** «{enPlazo} en plazo de {total} → {pct}», con el porcentaje formateado con `formatPct`, igual que la celda.
  - Ancho `sm:max-w-3xl` y scroll vertical, como los demás diálogos.
- Hay que comprobar la API real de `Dialog` en `src/components/ui/dialog.tsx`, porque es base-ui y no Radix.

## 6. E2E

- `e2e/db/hub-schema.sql` añade `desk.tickets (id, number, account_id)` y `desk.accounts (id, name)` mínimas.
- `e2e/db/seed-hub.mjs` inserta los tickets `T-FICT-001..006` con números y cuentas **inventados** («Cliente Ficticio A», «Cliente Ficticio B»…).
- Un test nuevo en `e2e/specs/kpis-comerciales.spec.ts` pulsa la celda de febrero y comprueba:
  - el pie «3 en plazo de 5 → 60.0%», con `formatPct`, el mismo formato que la tabla;
  - que el apartado «No cuentan para el porcentaje» contiene el ticket rechazado;
  - que aparece un cliente ficticio.

  En febrero hay 3 episodios en plazo y 2 fuera, y el ticket rechazado queda excluido.
- Los tests actuales de la fila, febrero en «60.0%» y enero en «—», siguen valiendo.

## 7. Fuera de alcance

- Un enlace al ticket en Zoho Desk.
- Exportar el detalle.
- Mostrar quién hizo la transición.

El repositorio es público: la semilla y los tests usan solo números y clientes inventados.
