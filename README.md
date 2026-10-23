# SalesTracker Pro

Aplicación web interna de análisis comercial. Muestra ventas (órdenes de venta y
facturas) por categoría, cliente y artículo, márgenes, forecast y KPIs comerciales.
Los datos de ventas se leen en solo lectura de una réplica de Zoho (el *zoho-hub*);
la BD propia del app guarda usuarios, categorías, agrupaciones, metas y preferencias.

Las reglas de trabajo (para personas y agentes de IA) están en [AGENTS.md](AGENTS.md).

## Stack

Next.js 16 (App Router + Server Actions) · TypeScript · better-auth · Drizzle ORM + `pg`
sobre Postgres self-hosted · Tailwind 4 + shadcn · Recharts · vitest · Playwright.

## Requisitos

- Node 24 (ver `.nvmrc`) y npm.
- Docker, para la BD de los tests E2E.
- Acceso a un Postgres para el app y, opcionalmente, al zoho-hub.

## Puesta en marcha

```bash
npm ci
cp .env.example .env.local   # y rellenar los valores
npm run dev                  # http://localhost:3000
```

Variables que lee el código:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres del app. Obligatoria en producción. |
| `BETTER_AUTH_SECRET` | Secreto de better-auth. |
| `BETTER_AUTH_URL` | URL pública del app (origen de cookies y enlaces). Obligatoria en producción. |
| `HUB_DB_URL` | Conexión de solo lectura al zoho-hub. Sin ella, solo las vistas agregadas funcionan (con `sales_records`); clientes, artículos, márgenes y KPIs fallan. |
| `PG_POOL_MAX` | Tamaño del pool del app (por defecto 5). |
| `HUB_POOL_MAX` | Tamaño del pool del hub (por defecto 5). |
| `HUB_STATEMENT_TIMEOUT_MS` | Tope por consulta al hub, en ms (por defecto 30000). |
| `KPI_EXCLUDED_SALESPEOPLE` | Nombres separados por comas que no se ofrecen como comercial en los KPIs. |
| `RATE_LIMIT_READS_PER_MINUTE` | Opcional. Lecturas de `/api/data` por usuario y minuto (por defecto 600). Pasado el límite: 429 con `Retry-After`. |
| `RATE_LIMIT_MUTATIONS_PER_MINUTE` | Opcional. Mutaciones (Server Actions de escritura y subida de avatar) por usuario y minuto (por defecto 120). |
| `RATE_LIMIT_EXPORTS_PER_MINUTE` | Opcional. Exportaciones a Excel por usuario y minuto (por defecto 30). |
| `DRIZZLE_DATABASE_URL` | Opcional, solo para `drizzle-kit`. Debe ser una URL con el usuario `postgres`. |

Nunca se commitean `.env*` reales (solo `.env.example`).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm start` | Build de producción y arranque. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Tests unitarios con vitest (`test:watch` en modo observador). |
| `npm run test:coverage` | Tests unitarios con cobertura de `src/lib` y `src/actions`; falla si baja de los umbrales de `vitest.config.ts`. |
| `npm run test:e2e` | Levanta la BD de E2E, la reinicia y ejecuta Playwright. |
| `npm run test:e2e:ui` | Playwright en modo interfaz. |
| `npm run e2e:db:up` | Arranca el Postgres de E2E en Docker (puerto `E2E_PG_PORT`, 55432 por defecto). |
| `npm run e2e:db:reset` | Recrea las BD de E2E, aplica migraciones y siembra datos ficticios. |
| `npm run e2e:db:down` | Para el contenedor y borra su volumen. |

## Migraciones

Están en `drizzle/` y se aplican **a mano, como `postgres`**, nunca con el
`DATABASE_URL` del app (que debe usar el rol de mínimo privilegio `salestracker_app`,
sin permisos de DDL). El procedimiento está en
[docs/runbooks/db-least-privilege.md](docs/runbooks/db-least-privilege.md).

## Despliegue

Imagen Docker multi-etapa (`Dockerfile`, modo `standalone`) desplegada en EasyPanel.
Las variables se inyectan en runtime, nunca en la imagen. Comprobaciones de salud:

- `GET /api/health`: liveness (no toca la BD).
- `GET /api/health?ready=1`: readiness (BD del app y, si está configurado, el hub).

## Documentación

- [AGENTS.md](AGENTS.md): reglas del proyecto.
- [docs/runbooks/](docs/runbooks/): procedimientos operativos.
- [docs/superpowers/](docs/superpowers/): specs y planes de cada funcionalidad.
- [ROADMAP.md](ROADMAP.md).
