"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { kpiTargets, kpiProjectOrders } from "@/db/schema";
import {
  getHubCustomerMonthByOwner,
  getHubDealsMonth,
  getHubSalespeople,
  getHubWonDealsMonth,
  searchHubSalesOrders,
  getHubOrdersByIds,
  type HubOrderRow,
} from "@/db/hub-kpi";
import { requireApproved, requireRole } from "@/lib/auth/guards";
import { kpiTargetsSchema } from "@/lib/validation";
import { runAction, type ActionResult } from "@/lib/errors";
import type { DealMonthRow } from "@/lib/kpi-score";
import type { CustomerMonthRow, RecordType } from "@/types/database";

export interface KpiTargetRow {
  kpi_key: string;
  target_value: number;
  weight_pct: number;
}

/** Ámbito de las metas: null es el total de la compañía. */
export type KpiScope = string | null;

export async function getSalespeople(): Promise<string[]> {
  await requireApproved();
  return getHubSalespeople();
}

export async function getKpiTargets(year: number, salesperson: KpiScope): Promise<KpiTargetRow[]> {
  const { profile } = await requireApproved();
  const rows = await db
    .select({
      kpi_key: kpiTargets.kpi_key,
      target_value: kpiTargets.target_value,
      weight_pct: kpiTargets.weight_pct,
    })
    .from(kpiTargets)
    .where(
      and(
        eq(kpiTargets.company_id, profile.company_id),
        eq(kpiTargets.record_year, year),
        // eq(col, null) genera "= NULL" y no casa nunca: hace falta IS NOT DISTINCT FROM.
        sql`${kpiTargets.salesperson} IS NOT DISTINCT FROM ${salesperson}`
      )
    );

  // numeric llega como string desde Drizzle.
  return rows.map((r) => ({
    kpi_key: r.kpi_key,
    target_value: Number(r.target_value),
    weight_pct: Number(r.weight_pct),
  }));
}

export async function saveKpiTargets(
  year: number,
  salesperson: KpiScope,
  items: KpiTargetRow[]
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const data = kpiTargetsSchema.parse({ year, salesperson, items });
    const keys = data.items.map((i) => i.kpi_key);

    await db.transaction(async (tx) => {
      for (const it of data.items) {
        await tx
          .insert(kpiTargets)
          .values({
            company_id: profile.company_id,
            record_year: data.year,
            kpi_key: it.kpi_key,
            salesperson: data.salesperson,
            target_value: String(it.target_value),
            weight_pct: String(it.weight_pct),
          })
          .onConflictDoUpdate({
            target: [kpiTargets.company_id, kpiTargets.record_year, kpiTargets.kpi_key, kpiTargets.salesperson],
            set: {
              target_value: String(it.target_value),
              weight_pct: String(it.weight_pct),
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
  return getHubCustomerMonthByOwner({ tipo, anio, owner });
}

/** Tratos por cuenta y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiDealsMonthly(anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  await requireApproved();
  return getHubDealsMonth({ anio, owner });
}

/** Tratos ganados por cuenta y mes del año, opcionalmente de un solo comercial. Lectura: lanza en error. */
export async function getKpiWonDealsMonthly(anio: number, owner: KpiScope): Promise<DealMonthRow[]> {
  await requireApproved();
  return getHubWonDealsMonth({ anio, owner });
}

/** Busca ordenes de venta para marcarlas como ingresos de proyecto. Lectura: cualquier
 *  usuario aprobado puede buscar, no expone nada que no vea ya en el resto de la app. */
export async function searchSalesOrdersForProjects(query: string, anio: number): Promise<HubOrderRow[]> {
  await requireApproved();
  const q = query.trim();
  if (q.length < 2) return [];
  const a = z.number().int().min(2000).max(2100).parse(anio);
  return searchHubSalesOrders(q, a);
}

/** Ordenes ya marcadas como ingresos de proyecto de la empresa, con su importe en vivo. */
export async function getKpiProjectOrders(): Promise<HubOrderRow[]> {
  const { profile } = await requireApproved();
  const marcadas = await db
    .select({ hub_order_id: kpiProjectOrders.hub_order_id })
    .from(kpiProjectOrders)
    .where(eq(kpiProjectOrders.company_id, profile.company_id));
  return getHubOrdersByIds(marcadas.map((m) => m.hub_order_id));
}

/** Marca una orden de venta como ingreso de proyecto. Idempotente: marcarla dos veces
 *  no falla ni duplica. Solo administradores. */
export async function addProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    const id = z.string().trim().min(1).parse(hubOrderId);
    await db
      .insert(kpiProjectOrders)
      .values({ company_id: profile.company_id, hub_order_id: id, tagged_by: profile.id })
      .onConflictDoNothing();
    revalidatePath("/analytics");
  });
}

/** Quita la marca de ingreso de proyecto de una orden. Solo administradores. */
export async function removeProjectOrder(hubOrderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await requireRole("admin");
    await db
      .delete(kpiProjectOrders)
      .where(and(eq(kpiProjectOrders.company_id, profile.company_id), eq(kpiProjectOrders.hub_order_id, hubOrderId)));
    revalidatePath("/analytics");
  });
}
