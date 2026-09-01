# Tests E2E con Playwright (v1) — Diseño

**Contexto:** La suite actual son 22 ficheros de tests unitarios sobre funciones puras en `src/lib/__tests__/`. No existe ni un solo test que renderice un componente ni que ejerza una ruta. Entre `tsc --noEmit` y producción no hay nada. Consecuencia medida: tres bugs de runtime llegaron a producción sin que ningún gate los viera — crash del command palette (cmd-k), ancho incorrecto de la rejilla del dashboard, y gráfico roto al seleccionar un año sin datos.

**Goal:** Suite E2E de humo que ejerza las rutas reales en un navegador real, corra idéntica en local y en CI, y bloquee el merge cuando algo se rompe.

**Arquitectura:** Postgres efímero en Docker con las dos bases (app + hub falso) + semilla determinista + Playwright con `storageState` reutilizado + job bloqueante en CI.

**Tech:** Playwright (Chromium), Docker Compose, Postgres 16, Next 16 en modo producción.

---

## Decisiones (aprobadas)

- **Alcance v1: smoke de renderizado.** Se asserta que las rutas cargan, navegan y no revientan. NO se assertan cifras de negocio. Esto desacopla el trabajo del ítem F5-04 y cubre los tres bugs conocidos.
- **Entorno: Postgres local en Docker, ambas bases.** Determinista, idéntico en local y CI, sin exponer el VPS.
- **CI: gate bloqueante desde el día 1.** A cambio, las reglas anti-flake de la sección 5 son obligatorias, no recomendaciones.

## 0. Evidencia que condiciona el diseño

Tres hechos verificados en el código, no supuestos:

1. **El middleware consulta la BD en cada request** (`src/middleware.ts:17-24`): lee `is_approved`, `is_rejected` e `is_active` de `profiles`. No hay cookie falsificable; el test necesita un usuario real, aprobado, en una BD real.
2. **La app tiene dos modos de lectura según `HUB_DB_URL`** (`src/db/hub.ts:9`):
   - Sin hub, `/home`, `/analytics`, `/tablas` y `/categories` funcionan por el fallback a `sales_records` (`src/actions/sales-actions.ts:76`).
   - Sin hub, `/clientes`, `/articulos`, `/cliente-articulo` y el drill-down **lanzan excepción** (`src/actions/customer-sales-actions.ts:10`). No degradan.

   Por tanto, sin un hub disponible la mitad del catálogo de rutas no es testeable.
3. **El hub solo se consulta contra 5 tablas**: `books.invoices`, `books.invoice_line_items`, `books.items`, `books.sales_orders`, `books.salesorder_line_items`. Replicarlo es un fichero SQL, no un subproyecto.

## 1. Infraestructura de datos

### 1.1 `e2e/docker-compose.e2e.yml`

Un único servicio Postgres 16 en el puerto **55432** (no estándar, para no chocar con instalaciones locales), con dos bases:

- `salestracker_e2e` → `DATABASE_URL` de los tests
- `zoho_hub_e2e` → `HUB_DB_URL` de los tests

Credenciales triviales y locales (`postgres:postgres`). Los tests **nunca** leen `.env.local` ni abren conexión al VPS.

**Quién crea las dos bases:** el script de semilla, no el Compose. En local, Compose solo levanta el motor; en CI lo levanta el servicio `postgres:16` del runner. El script emite `CREATE DATABASE` para ambas y luego siembra. Así el mismo script sirve en los dos entornos y no hay lógica duplicada entre Compose y el workflow.

### 1.2 Esquema del app: se aplica, no se duplica

Un script aplica los ficheros de `/drizzle/000*.sql` en orden numérico sobre la base vacía. El esquema no se copia a `e2e/`: la carpeta `/drizzle` sigue siendo la única fuente de verdad.

Beneficio lateral que no teníamos: cada corrida verifica que **las migraciones son aplicables desde cero**. Hoy nadie lo comprueba, y el operador las ejecuta a mano en producción.

### 1.3 Hub falso: `e2e/seed/hub-schema.sql`

Esquema `books` con las 5 tablas de la sección 0.3. Las columnas se derivan de las consultas reales en `src/db/hub-*.ts`; solo se replican las columnas que la app lee.

### 1.4 Forma de la semilla

La semilla no es "unos datos cualesquiera". Su forma es lo que decide si el smoke atrapa algo:

| Dato sembrado | Qué cubre |
|---|---|
| Años 2021–2024 con ventas; **2021 solo tiene datos de una categoría** | Bug #3: bucket de año inexistente |
| ≥3 categorías repartidas en ≥2 grupos | Agrupaciones y evolución histórica |
| ≥5 clientes y ≥5 artículos; alguno sin ventas en un año | Drill-down y estados vacíos |
| Bienes con `purchase_rate > 0` y servicios a costo 0 | Pestaña Margen |
| Usuario **aprobado** y usuario **sin aprobar** | Las dos ramas del middleware |

El año mínimo sembrado es 2021, coherente con la convención del proyecto (2020 es parcial).

**Por qué un año parcial y no un año vacío.** La primera versión de este spec proponía sembrar 2025 sin ningún dato. No sirve: un año sin **ningún** registro no llega a aparecer en el selector, así que no hay nada que filtrar y el bug no se reproduce. El commit `9dc66ee` describe la condición real — un año presente en el selector cuyo *bucket falta para una agrupación concreta*. Por eso 2021 lleva ventas de `Aguas` y de ninguna otra categoría.

### 1.6 Presupuesto de logins: 5 por minuto

`src/lib/auth/auth.ts` aplica rate limiting con `"/sign-in/email": { window: 60, max: 5 }`, por IP y activo también fuera de producción. La suite gasta **3**: dos en el setup y uno en el test de credenciales inválidas.

Consecuencia de diseño: los proyectos de Playwright que autentican van con `retries: 0`. Con reintentos, un fallo real dispararía logins extra, chocaría con el 429 y el reintento fallaría por una causa distinta a la original, enmascarando el bug.

**No se modifica `auth.ts` para relajar el límite.** Añadir un env var que debilite un control de seguridad para que pasen los tests es el tipo de atajo que acaba activado en producción.

### 1.5 El usuario semilla

`account.password` debe contener un **hash bcrypt real de cost 12** (60 caracteres, prefijo `$2`). No texto plano.

Esto no es celo: es exactamente el fallo que tumbó el login en producción — el campo guardaba 13 caracteres de texto plano y `bcrypt.compare` fallaba siempre. Una semilla con texto plano reproduciría el bug dentro de los propios tests.

## 2. Autenticación en los tests

Proyecto `setup` de Playwright que se ejecuta antes que el resto:

1. Hace login **a través de la UI** (rellena el formulario y lo envía), no por API.
2. Guarda el `storageState` resultante.
3. Los proyectos de test lo reutilizan; no vuelven a loguearse.

El login es real porque el middleware consulta `profiles` en cada request (sección 0.1). Se genera un segundo `storageState` para el usuario **no aprobado**, que alimenta el test del redirect a `/waiting-approval`.

## 3. Configuración de Playwright

- **Un solo navegador: Chromium.** Firefox y WebKit se valoran cuando la suite sea estable.
- **`webServer` levanta `next build && next start`**, NO `next dev`. Turbopack en dev recompila bajo demanda y produce tiempos de primera carga erráticos, que es la receta del flake.
- **Viewport fijo 1440×900.** Recharts y react-grid-layout dependen del ancho disponible; un viewport variable hace irreproducible el bug #2.
- `retries: 2` y `workers: 1` **solo en CI**. En local, cero retries: un test que falla, falla.
- Trazas y vídeo `on-first-retry`.

## 4. La suite (~28 tests en `e2e/specs/`)

| Fichero | Cubre |
|---|---|
| `auth.spec.ts` | Login correcto; credenciales inválidas; anónimo redirigido a `/login`; no aprobado redirigido a `/waiting-approval` |
| `navigation.spec.ts` | Las 9 rutas del dashboard. Por ruta: carga, cabecera visible, **cero errores de consola**, cero error boundary |
| `command-palette.spec.ts` | Abrir con Cmd/Ctrl+K desde cada ruta, escribir, navegar al resultado → **bug #1** |
| `dashboard.spec.ts` | Modo Personalizar: añadir widget, arrastrar, redimensionar, recargar y verificar persistencia. Ancho de la rejilla asertado explícitamente → **bug #2** |
| `charts.spec.ts` | Seleccionar el año vacío (2025) en `/analytics`: debe mostrar estado vacío, no un gráfico roto → **bug #3** |
| `export.spec.ts` | Descarga de Excel y CSV: el fichero llega y no está vacío |

Las 9 rutas de `navigation.spec.ts`: `/home`, `/analytics`, `/clientes`, `/clientes/[customer]`, `/articulos`, `/cliente-articulo`, `/categories`, `/tablas`, `/settings`.

### 4.1 Los tres bugs, con su commit de arreglo

Cada uno tiene arreglo ya en `main`, así que el test se valida revirtiendo el commit y comprobando que **falla**. Sin ese paso, un test puede estar pasando por casualidad:

| Bug | Commit del arreglo | Causa raíz declarada en el mensaje |
|---|---|---|
| #1 cmd-k | `e63dbb3` | El diálogo no iba envuelto en `<Command>`; cmdk necesita el root → `reading 'subscribe'` |
| #2 ancho rejilla | `1af997a` | El contenedor medido no estaba montado durante la carga |
| #3 gráfico vacío | `9dc66ee` | Bucket de año inexistente al filtrar un año sin datos |

Leer estos tres mensajes antes de escribir los tests: describen el mecanismo exacto que hay que reproducir. En particular, #2 depende del **momento de la carga**, no del estado final — un test que solo mire la rejilla ya asentada no lo atrapa.

## 5. Anti-flake (reglas duras)

Son la condición para que el gate bloqueante no se vuelva un impuesto:

- **Selectores por rol y texto accesible** (`getByRole`, `getByLabel`, `getByText`). Prohibido seleccionar por clases de Tailwind: cambian con cada retoque visual.
- **Cero `waitForTimeout`.** Se usa el auto-waiting de Playwright y `expect().toPass()` para esperar a que Recharts termine de montar.
- **Cero dependencia de orden entre tests.** Cada uno parte del `storageState` y no muta datos que otro lea.
- **Assertion de consola con lista de exclusión explícita y corta.** Si hay que excluir un warning, se documenta por qué en el propio fichero.

## 6. CI

Job `e2e` nuevo en `.github/workflows/ci.yml`, posterior a `build`:

- Servicio `postgres:16` del runner (no Docker Compose dentro de Actions).
- `npx playwright install --with-deps chromium`.
- Aplica migraciones + semilla, arranca la app, corre la suite.
- Reporte HTML y trazas subidos como artifact **solo al fallar**.
- **Bloqueante**: si el job falla, el PR no entra.

`permissions: contents: read` se mantiene. El job no necesita secretos: todas las credenciales son del contenedor efímero.

## 7. Scripts de npm

- `test:e2e` — levanta la BD, siembra, corre la suite
- `test:e2e:ui` — modo interactivo de Playwright para depurar
- `test:e2e:seed` — solo recrear la BD y sembrar (útil al desarrollar tests)

`npm test` sigue siendo solo vitest. No se mezclan.

## 8. Guardarraíles del proyecto

- `e2e/` entra en `npm run typecheck`. Los tests son código y se tipan.
- **El baseline de lint no sube de 10 warnings.** Los ficheros nuevos entran con 0.
- Nada en `e2e/` contiene credenciales reales, `HUB_DB_URL` real ni cadenas de conexión al VPS.
- **Finales de línea:** el repo tiene `core.autocrlf = true` y **almacena todo en LF**; el CRLF que ves en el working copy lo introduce git al hacer checkout. No hay convención por carpeta que respetar. Lo que sí importa: los scripts que reescriben ficheros deben preservar el final de línea que encuentran y verificarse **uno a uno** — una comprobación global puede enmascarar que un reemplazo falló.

## 9. Fuera de alcance (v1)

Explícitamente NO entra, para que la primera entrega llegue:

- Assertions sobre cifras de negocio (totales, márgenes, contenido del Excel).
- Testcontainers (ítem F5-04, separado).
- Firefox y WebKit.
- Tests de regresión visual (capturas comparadas).
- Flujo de recuperación de contraseña: **no existe en la app todavía**, no se puede testear.

## 10. Riesgos declarados

**El hub falso puede desincronizarse del real.** Si el esquema `books.*` del zoho-hub cambia, la réplica se queda atrás y la suite pasa en verde mientras producción rompe. Mitigación posible: un test de contrato que compare columnas contra el hub real, ejecutable solo en local y bajo demanda. **No entra en v1** — se registra como trabajo aparte.

**El gate bloqueante amplifica cualquier flake.** Un test inestable pasa de molestia a bloqueo de main. Por eso la sección 5 es normativa. Si aun así aparece flake, la respuesta correcta es arreglar o borrar el test, nunca subir `retries`.

**La suite alarga el CI.** `next build` ya corre en el job `build`; el job `e2e` necesita la app construida. Si el tiempo total se vuelve un problema, se reutiliza el artifact de build en vez de reconstruir.

## 11. Criterios de aceptación

1. `npm run test:e2e` pasa en limpio sobre un checkout nuevo, sin `.env.local` y sin acceso al VPS.
2. Los tres bugs conocidos tienen un test que **falla si se revierte el arreglo**. Verificado revirtiendo, no supuesto.
3. El job `e2e` corre en CI y bloquea el merge.
4. `npm run typecheck` limpio, `npm run lint` en 10 warnings exactos, `npm test` en **117 pasando + 1 saltado** (verificado en el estado actual).
   - Ojo: el saltado es `src/lib/auth/__tests__/auth.smoke.test.ts`, que se salta por ausencia de `DATABASE_URL`. El job de E2E **no** debe exportar `DATABASE_URL` al paso de vitest, o ese test dejaría de saltarse y correría contra la BD de E2E sin querer. Mantener los dos pasos con entornos separados.
5. Dos ejecuciones consecutivas en CI dan el mismo resultado (sin flakes).
