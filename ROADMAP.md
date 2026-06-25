# Roadmap de mejora — SalesTracker

Plan consolidado (análisis transversal + ideas pendientes), priorizado por
**valor / esfuerzo / riesgo**. Esfuerzo: **S** ≈ ½–1 tanda · **M** ≈ 1–2 · **L** ≈ varias ·
**XL** ≈ iniciativa con infra.

Estado base: app en prod leyendo el zoho-hub (ventas read-only); auditoría 27/29;
vistas Artículos, Clientes, Cliente×Artículo y pestaña Análisis→Comercial ya entregadas.

---

## Fase 1 — Quick wins: IA + base UX  *(empezar por aquí)*
Barato, muy visible, y crea cimientos que reutilizan las fases siguientes.

| Ítem | Valor | Esf. | Notas |
|---|---|---|---|
| **Arreglar navegación**: enlazar `/subscriptions`; decidir `/kpis` (fusionar con Inicio); `/sales` (enlazar o retirar); **eliminar `/import`** | Alto | S | Recupera features ya construidas; limpia IA |
| **Toggle de tema** claro/oscuro | Medio | S | Ya hay `next-themes` + clases `dark:`; falta el botón |
| **`<ReportToolbar>` común** (Año/Tipo OV-FAC/Buscar/CSV) | Alto | M | Unifica Tablas/Artículos/Clientes/Cliente×Art.; base para el resto |
| Plantillas **EmptyState / ErrorState** | Medio | S | Estados consistentes en todas las vistas |

## Fase 2 — Completar la analítica  *(reusa el patrón "Comercial")*
Aprovecha la card lazy + helpers puros ya establecidos.

| Ítem | Valor | Esf. | Notas |
|---|---|---|---|
| **A2 Pareto de SKUs (ABC)** | Alto | S | mismo patrón que C2 |
| **M3 Macro-categoría × top clientes** (barras apiladas) | Alto | S | reusa buckets |
| **A3 Mix por marca** (dona/treemap) | Medio | S | marca ya disponible |
| **C3 Nuevos vs recurrentes** por año | Alto | M | requiere primera-compra por cliente |
| **C4 Heatmap cliente × año** | Medio | M | visual de la matriz de Clientes |
| C1 Top N clientes (barras) · M1 Mix (dona, 1 año) | Bajo | S | parcialmente cubiertos por C2/M2 |
| **Margen / rentabilidad** (usar `purchase_rate` del hub) | Alto | M | de "ventas" a "rentabilidad"; validar dato |
| Estacionalidad por categoría | Medio | M | |

## Fase 3 — Producto / interacción
| Ítem | Valor | Esf. | Notas |
|---|---|---|---|
| **Drill-down de cliente** (clic → detalle artículos/categorías/evolución) | Alto | M | conecta Clientes ↔ Cliente×Art. ↔ charts |
| **Contexto de periodo global** (año/tipo compartido) | Medio | M | habilita "mismo periodo en todas las vistas" |
| **Comparador de periodos** en las vistas nuevas | Medio | M | como ya hace Análisis |
| **Búsqueda global (cmd-k)** | Medio | M | `cmdk` ya es dependencia |
| **Export Excel (.xlsx)** + copiar tabla | Medio | S/M | valorar reintroducir lib (xlsx se quitó por CVE → usar exceljs) |
| **Moneda COP** (toggle USD/COP con TRM) | Medio | M | negocio colombiano; reportes hoy solo USD |
| Vistas guardadas / favoritos | Bajo | M | |

## Fase 4 — Capacidades nuevas (frentes grandes)
| Ítem | Valor | Esf. | Notas |
|---|---|---|---|
| **CRM desde el hub** (deals/pipeline) | Alto | L | `crm.deals` (~1.973) sin explotar |
| **Desk desde el hub** (tickets/soporte) | Alto | L | `desk.tickets` (~726) sin explotar |
| **Informes por email** programados (resumen mensual) | Alto | XL | requiere worker/cron + servicio de email |
| **Alertas de KPI** (backlog>X, caída interanual) | Medio | L | notificación; apoyarse en el logger/observabilidad |

## Track transversal — Calidad / Operación / Rendimiento
Continuo, en paralelo a las fases.

| Ítem | Valor | Esf. | Notas |
|---|---|---|---|
| **Observabilidad con alertas** (Sentry/GlitchTip) | Alto | M | hoy solo logs estructurados |
| **F5-04 BD de test aislada** (Testcontainers) | Medio | M | backlog auditoría |
| **Tests E2E** (Playwright) de flujos clave | Alto | L | login, dashboards, export |
| `middleware → proxy` (deprecación Next 16) | Bajo | S | auth-crítico → con cuidado |
| **7 vulns moderate** (deps) | Bajo | S | revisar/actualizar |
| Rendimiento: agregación en SQL + paginación si los datos crecen | Medio | M | hoy se agrega en cliente |
| F1-02 purga de historial git (opcional) | Bajo | S | secreto Supabase ya decomisado |

---

## Secuencia recomendada
1. **Fase 1** (quick wins de IA + tema + ReportToolbar) → mejora percibida inmediata y base reutilizable.
2. **Fase 2** (completar analítica + margen) → más valor sobre los datos que ya tenemos.
3. **Fase 3** (drill-down + periodo global + cmd-k) → la app se vuelve "navegable" y comparativa.
4. **Frente grande de Fase 4** a elegir (CRM/Desk *o* informes por email).
5. **Track de calidad** en paralelo (observabilidad + E2E primero).

Cada ítem se aborda con el flujo: brainstorming → spec → plan → implementación subagent-driven.
