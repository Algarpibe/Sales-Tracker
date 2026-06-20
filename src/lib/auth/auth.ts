import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, session, account, verification, profiles, companies } from "@/db/schema";

const DEFAULT_COMPANY = "Ambientalia S.A.S.";

// Fail-fast: en runtime exige el secreto (nunca arrancar con el secreto por defecto).
// Durante el build estático (sin envs) no se lanza, para no romper la generación de páginas.
if (process.env.NEXT_PHASE !== "phase-production-build" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("Falta BETTER_AUTH_SECRET en el entorno.");
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 10,
    // bcryptjs para verificar los hashes migrados desde Supabase/GoTrue ($2a$...)
    // verify sigue aceptando hashes antiguos (cost 10); los nuevos se generan con cost 12.
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  // Cookie cache (F3-04): getSession lee la sesión de una cookie firmada de corta
  // vida en vez de pegarle a la BD en cada request (el middleware corre en cada
  // navegación). maxAge corto para que revocaciones/cambios se reflejen pronto.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    // Las columnas id son uuid con DEFAULT gen_random_uuid(): que las genere Postgres,
    // no better-auth (que por defecto generaría un string no-uuid).
    database: { generateId: false },
  },
  // Reemplaza el trigger Supabase on_auth_user_created: al crear un usuario, crea su
  // profile (rol 'lector', sin aprobar) ligado a la empresa por defecto.
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          let [company] = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.name, DEFAULT_COMPANY));
          if (!company) {
            [company] = await db
              .insert(companies)
              .values({ name: DEFAULT_COMPANY })
              .returning({ id: companies.id });
          }
          await db.insert(profiles).values({
            id: createdUser.id,
            company_id: company.id,
            role: "lector",
            is_approved: false,
          });
        },
      },
    },
  },
  // Rate limiting: tope global por IP + reglas estrictas en login/registro para
  // frenar fuerza bruta y enumeración. Almacenamiento en memoria (la app corre con
  // 1 réplica). enabled:true lo activa también en desarrollo para poder validarlo.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  plugins: [nextCookies()], // nextCookies SIEMPRE el último
});
