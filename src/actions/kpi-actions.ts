"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { kpiTargets, kpiProjectOrders } from "@/db/schema";
import { searchHubSalesOrders, type HubOrderRow } from "@/db/hub-kpi";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { ROLES_EDITAN_METAS } from "@/lib/commercial-kpis";
import {
  readKpiDealsMonthly,
  readKpiMonthlySales,
  readKpiProjectOrders,
  readKpiTargets,
  readKpiTicketsChanges,
  readKpiWonDealsMonthly,
  readSalespeople,
} from "@/lib/data-reads";
import { hubOrderSearchSchema, hubYearSchema, kpiTargetsSchema } from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { DealMonthRow } from "@/lib/kpi-score";
import type { CambioFase } from "@/lib/kpi-tickets";
import type { CustomerMonthRow, RecordType } from "@/types/database";

export interface KpiTargetRow {
  kpi_key: string;
  target_value: number;
  weight_pct: number;
  /** Plazo en horas laborables. Solo en tickets_st, uno por ámbito; null = plazo por defecto. */
  plazo_horas: number | null;
}

/** Ámbito de las metas: null es el total de la compañía. */
export type KpiScope = string | null;

// Las lecturas viven en src/lib/data-reads.ts, compartidas con GET /api/data/*
// (DATA-043).
export async function getSalespeople(): Promise<string[]> {
  await requireApproved();
  return readSalespeople();
}

export async function getKpiTargets(year: number, salesperson: KpiScope): Promise<KpiTargetRow[]> {
  const { profile } = await requireApproved();
  return readKpiTargets(profile.company_id, year, salesperson);
}

export async function saveKpiTargets(
  year: number,
  salesperson: KpiScope,
  items: KpiTargetRow[]
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole(...ROLES_EDITAN_METAS, { fresh: true });
    const data = kpiTargetsSchema.parse({ year, salesperson, items });
    const keys = data.items.map((i) => i.kpi_key);

    await db.transaction(async (tx) => {
      for (const it of data.items) {
        // Solo tickets_st trae plazo (lo garantiza kpiTargetsSchema), en cualquier ámbito; el resto
        // guarda nulo, que en la lectura vale el plazo por defecto.
        const plazo = it.plazo_horas == null ? null : String(it.plazo_horas);
        await tx
          .insert(kpiTargets)
          .values({
            company_id: profile.company_id,
            record_year: data.year,
            kpi_key: it.kpi_key,
            salesperson: data.salesperson,
            target_value: String(it.target_value),
            weight_pct: String(it.weight_pct),
            plazo_horas: plazo,
          })
          .onConflictDoUpdate({
            target: [kpiTargets.company_id, kpiTargets.record_year, kpiTargets.kpi_key, kpiTargets.salesperson],
            set: {
              target_value: String(it.target_value),
              weight_pct: String(it.weight_pct),
              plazo_horas: plazo,
              updated_at: new Date().toISOString(),
            },
          });
      }

      // Un KPI que ya no se envía deja de medirse en ESE ámbito.
      await tx.delete(kpiTargets).where(
        and(
          eq(kpiTargets.company_id, profile.company_id),
          eq(kpiTargets.record_year, data.year),
          sql`${kpiTargets.salesperson} IS NOT DISTINCT FROM ${data.salesperson}`,
          notInArray(kpiTargets.kpi_key, keys)
        )
      );
    });
    // El ámbito de un comercial es su NOMBRE: no se registra, solo si es de compañía.
    audit({
      action: "kpi_targets.save",
      actorId: profile.id,
      companyId: profile.company_id,
      meta: { year: data.year, scope: data.salesperson === null ? "company" : "salesperson", kpis: keys.length },
    });

    revalidatePath("/settings");
  });
}

/** Ventas por cliente y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiMonthlySales(
  tipo: RecordType,
  anio: number,
  owner: KpiScope
): Promise<CustomerMonthRow[]> {
  await requireApproved();
  return readKpiMonthlySales(tipo, anio, owner);
}

/** Tratos por cuenta y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiDealsMonthly(anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  await requireApproved();
  return readKpiDealsMonthly(anio, owner);
}

/** Tratos ganados por cuenta y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiWonDealsMonthly(anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  await requireApproved();
  return readKpiWonDealsMonthly(anio, owner);
}

/** Busca ordenes de venta para marcarlas como ingresos de proyecto. Lectura: cualquier
 *  usuario aprobado puede buscar, no expone nada que no vea ya en el resto de la app. */
export async function searchSalesOrdersForProjects(query: string, anio: number): Promise<HubOrderRow[]> {
  await requireApproved();
  const q = hubOrderSearchSchema.parse(query.trim());
  if (q.length < 2) return [];
  const a = hubYearSchema.parse(anio);
  return searchHubSalesOrders(q, a);
}

/** Ordenes ya marcadas como ingresos de proyecto de la empresa, con su importe en vivo. */
export async function getKpiProjectOrders(): Promise<HubOrderRow[]> {
  const { profile } = await requireApproved();
  return readKpiProjectOrders(profile.company_id);
}

/** Marca una orden de venta como ingreso de proyecto. Idempotente: marcarla dos veces
 *  no falla ni duplica. Solo administradores. */
export async function addProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", { fresh: true });
    const id = z.string().trim().min(1).parse(hubOrderId);
    await db
      .insert(kpiProjectOrders)
      .values({ company_id: profile.company_id, hub_order_id: id, tagged_by: profile.id })
      .onConflictDoNothing();
    audit({ action: "project_order.add", actorId: profile.id, companyId: profile.company_id, targetId: id });
    revalidatePath("/analytics");
  });
}

/** Quita la marca de ingreso de proyecto de una orden. Solo administradores. */
export async function removeProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin", { fresh: true });
    await db
      .delete(kpiProjectOrders)
      .where(and(eq(kpiProjectOrders.company_id, profile.company_id), eq(kpiProjectOrders.hub_order_id, hubOrderId)));
    audit({ action: "project_order.remove", actorId: profile.id, companyId: profile.company_id, targetId: hubOrderId });
    revalidatePath("/analytics");
  });
}

/** Cambios de fase de "Notificación Comercial" del año. De compañía: Desk no asigna
 *  comercial al ticket, así que no hay ámbito que filtrar. Lectura: lanza en error. */
export async function getKpiTicketsChanges(year: number): Promise<CambioFase[]> {
  await requireApproved();
  return readKpiTicketsChanges(year);
}
