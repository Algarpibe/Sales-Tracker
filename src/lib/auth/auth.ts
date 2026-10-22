import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { enforceRuntimeEnv } from "@/lib/env";
import { user, session, account, verification } from "@/db/schema";
import { createProfileForNewUser } from "./new-user-profile";

// Fail-fast: en runtime exige el secreto (nunca arrancar con el secreto por defecto).
// Durante el build estático (sin envs) no se lanza, para no romper la generación de páginas.
if (process.env.NEXT_PHASE !== "phase-production-build" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("Falta BETTER_AUTH_SECRET en el entorno.");
}
// Fail-fast de producción: DATABASE_URL y BETTER_AUTH_URL obligatorias; aviso único
// si falta HUB_DB_URL (opcional). Omitido en next build y fuera de producción.
enforceRuntimeEnv();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Sin sesión al registrarse (SEC-039): la cuenta nace pendiente de aprobación y,
    // sobre todo, better-auth responde igual exista o no el email (con autoSignIn
    // devolvía USER_ALREADY_EXISTS y permitía enumerar cuentas).
    autoSignIn: false,
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
  // profile (rol 'lector', sin aprobar) ligado a la empresa por defecto, en una
  // transacción (new-user-profile.ts). better-auth lo ejecuta tras confirmar el usuario.
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await createProfileForNewUser(createdUser.id);
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
    },
  },
  plugins: [nextCookies()], // nextCookies SIEMPRE el último
});
