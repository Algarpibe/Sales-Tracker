import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, session, account, verification, profiles, companies } from "@/db/schema";

const DEFAULT_COMPANY = "Ambientalia S.A.S.";

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
    // bcryptjs para verificar los hashes migrados desde Supabase/GoTrue ($2a$...)
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  advanced: {
    // Las columnas id son uuid con DEFAULT gen_random_uuid(): que las genere Postgres,
    // no better-auth (que por defecto generaría un string no-uuid).
    database: { generateId: false },
  },
  // Reemplaza el trigger Supabase on_auth_user_created: al crear un usuario, crea su
  // profile (rol 'viewer', sin aprobar) ligado a la empresa por defecto.
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
            companyId: company.id,
            role: "viewer",
            isApproved: false,
          });
        },
      },
    },
  },
  plugins: [nextCookies()], // nextCookies SIEMPRE el último
});
