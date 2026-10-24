# AGENTS.md — Reglas para agentes de IA y personas

Fuente única de instrucciones para trabajar en este repositorio. Si otro documento
contradice a este, manda este. Lo que hay en `docs/archive/` está obsoleto: no seguirlo.

## Stack real

- **Next.js 16** con App Router y **Server Actions** (`src/actions/*`). Salida
  `output: "standalone"` en `next.config.ts` (la usa el `Dockerfile`).
- **Auth:** better-auth (contraseñas con bcryptjs). Configuración en `src/lib/auth/`.
- **BD del app:** Postgres self-hosted vía **Drizzle ORM** + `pg` (`src/db/index.ts`,
  esquema en `src/db/schema.ts`). **No se usa Supabase**: el proyecto migró fuera.
- **Datos de ventas:** se leen del **zoho-hub** (réplica de Zoho Books/CRM/Desk) en
  **solo lectura** con `HUB_DB_URL` (`src/db/hub.ts`). Las consultas viven en
  `src/db/hub-*.ts` como **SQL crudo parametrizado** (`$1`, `$2`…), nunca con
  interpolación de entrada de usuario. El pool del hub abre las sesiones en modo
  `default_transaction_read_only`: no se escribe nunca en el hub.
- **UI:** Tailwind 4, componentes shadcn (`src/components/ui`), lucide-react, Recharts,
  framer-motion, sonner y @tanstack/react-query.
- **Formularios:** react-hook-form + zod.
- **Tests:** vitest (unitarios, `src/**/__tests__`) y Playwright (E2E, `e2e/`).

## Reglas de código

1. **Autorización en cada acción.** Toda Server Action llama a un guard de
   `src/lib/auth/guards.ts` (`requireUser`, `requireApproved` o `requireRole`) antes de
   tocar datos. Un helper que recibe `companyId` sin comprobar sesión **no se exporta**
   desde un fichero `"use server"`.
2. **Mutaciones con `runAction`** (`src/lib/errors.ts`): devuelven `ActionResult`; los
   errores esperados se lanzan como `AppError`, los inesperados se registran en servidor
   y al usuario le llega un mensaje genérico.
3. **TypeScript estricto**, sin `any`. Alias `@/` → `src/`.
4. **Textos de la interfaz en español.** Código y nombres técnicos pueden ir en inglés.
5. **Variables de entorno:** los secretos (`DATABASE_URL`, `HUB_DB_URL`,
   `BETTER_AUTH_SECRET`) solo en servidor; `NEXT_PUBLIC_` únicamente para valores
   realmente públicos.
6. **Estilo visual:** superficies con `backdrop-blur`, sombras suaves y bordes sutiles,
   responsive mobile-first y el mismo aspecto en todos los módulos. Reutilizar los
   componentes existentes antes de crear otros.
7. **Tests primero** en lógica pura (`src/lib`): el test nuevo debe fallar antes de
   implementar. Gates antes de dar algo por terminado: `npm run typecheck`,
   `npm run lint`, `npm test` y, si toca flujos de usuario, `npm run test:e2e`.

## Base de datos y migraciones

- Las migraciones están en `drizzle/` y las aplica el operador **a mano, como
  `postgres`**, con el runner `npm run db:migrate -- <status|baseline|up|down>`
  (`scripts/migrate/`), que lee solo `MIGRATIONS_DATABASE_URL` y registra lo aplicado en
  `migrations.applied`. **Nunca con el `DATABASE_URL` del app** (rol de mínimo privilegio
  `salestracker_app`, sin DDL): el runner se niega. Procedimiento:
  [docs/runbooks/migrations.md](docs/runbooks/migrations.md); rol del app:
  [docs/runbooks/db-least-privilege.md](docs/runbooks/db-least-privilege.md).
- Migraciones nuevas: SQL escrito a mano (`NNNN_descripcion.sql`, sin `BEGIN`/`COMMIT`),
  `drizzle-kit` no está instalado y no se reinstala: su journal se quedó en 0001 y no conoce `migrations.applied`.
- Una migración ya aplicada (o marcada por baseline) no se edita: se añade otra. El
  runner detecta el cambio por checksum y se niega a seguir.
- Las migraciones versionadas no llevan secretos ni datos de clientes.

## Datos sensibles y git

- **Nunca** commitear `.env*` (salvo `.env.example`), `AUDIT_*`, ficheros con datos
  reales de clientes, importes reales, nombres de comerciales ni infraestructura
  (IPs, hosts internos, dominios, usuarios SSH, rutas locales). En documentación se usan
  marcadores: `Cliente A`, `$X`, `<VPS_IP>`, `<host-interno>`, `<dominio-app>`.
- Los datos reales (p. ej. el histórico de clientes) van a la BD, nunca al repositorio.
- **No hacer `git add`, `git commit` ni `git push` sin que el usuario lo pida
  expresamente** (ver `.agent/rules/limites.md`). Commits en formato *conventional
  commits*. No reescribir historia publicada.

## Despliegue

- Imagen Docker multi-etapa (`Dockerfile`), desplegada en EasyPanel por el usuario,
  nunca por un agente.
- `GET /api/health` (liveness) y `GET /api/health?ready=1` (readiness: BD del app y,
  si está configurado, el hub).

## Más documentación

- [README.md](README.md): puesta en marcha y scripts.
- [docs/runbooks/](docs/runbooks/): procedimientos operativos.
- [docs/superpowers/](docs/superpowers/): specs y planes históricos de cada funcionalidad.
  Describen el momento en que se escribieron; ante duda, manda el código.
- [ROADMAP.md](ROADMAP.md) y [SECURITY-BACKLOG.md](SECURITY-BACKLOG.md).
