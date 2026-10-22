import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, profiles } from "@/db/schema";

/** Empresa a la que se asigna cada cuenta nueva. e2e/constants.ts la replica. */
export const DEFAULT_COMPANY = "Ambientalia S.A.S.";

/**
 * Reemplaza el trigger Supabase on_auth_user_created: al crear un usuario, crea su
 * profile (rol 'lector', sin aprobar) ligado a la empresa por defecto.
 *
 * Todo en UNA transacción (DATA-051): si falla el perfil no queda una empresa creada a
 * medias. `companies.name` no tiene UNIQUE (añadirlo exige migración), así que dos
 * altas simultáneas podrían crear la empresa dos veces; el advisory lock de la
 * transacción serializa este bloque y lo evita mientras sea el único que la crea.
 */
export async function createProfileForNewUser(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('salestracker:default-company'))`);
    let [company] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, DEFAULT_COMPANY))
      .limit(1);
    if (!company) {
      [company] = await tx
        .insert(companies)
        .values({ name: DEFAULT_COMPANY })
        .returning({ id: companies.id });
    }
    await tx.insert(profiles).values({
      id: userId,
      company_id: company.id,
      role: "lector",
      is_approved: false,
    });
  });
}
