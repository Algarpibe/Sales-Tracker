import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema";

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
  plugins: [nextCookies()], // nextCookies SIEMPRE el último
});
