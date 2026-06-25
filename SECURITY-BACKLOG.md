# Backlog de seguridad / calidad

Auditoría Staff Engineer + AppSec (5 ejes, 29 hallazgos). **27/29 resueltos o
atendidos** (Fases 0-3, en producción). Quedan 2 ítems, ninguno es un bug de
código: infraestructura y opcional.

## Pendientes

### F5-04 — BD de test aislada (MEDIA)
- **Estado:** mitigado en CI (`describe.skipIf(!process.env.DATABASE_URL)` en
  `auth.smoke.test.ts` evita tocar prod), pero no hay una BD de pruebas dedicada.
- **Fix futuro:** Postgres efímero (contenedor / Testcontainers) o transacción con
  rollback por test. Requiere infra de test.

### F1-02 — Secreto en historial git (BAJA, opcional)
- **Estado:** un JWT por defecto de Supabase quedó en el historial
  (`aa1b88f:scripts/gen-keys.js`). El stack Supabase ya está **decomisado**, el
  secreto no sirve.
- **Fix futuro (opcional):** `git filter-repo` / BFG para purgar el historial.
  Disruptivo (reescribe historia). Bajo valor dado el decomiso.

## Resumen de lo resuelto
- **Seguridad:** CSP, rate-limit en login, avatar magic-bytes, gate de aprobación
  (approved+!rejected+active), bcrypt 12, política de claves, ownership de
  agrupaciones, webhooks n8n ZohoHub desactivados.
- **Datos/perf:** índices, `cookieCache` (menos golpes a BD), invalidación de caché
  react-query, reorder con `unnest`, lazy-load de charts, monitor de payload de
  `getSalesData` (F3-06: aviso por logger si supera umbral; ya devuelve agregado).
- **Arquitectura/calidad:** contrato de errores (`ActionResult` + error boundary),
  logging estructurado, dedup de dashboards, 0 `no-explicit-any`, enums derivados
  de Drizzle.
- **Tests/DX:** vitest + CI (typecheck+lint+test+build), **lint como gate duro**,
  husky + lint-staged, scripts `test`/`typecheck`.
