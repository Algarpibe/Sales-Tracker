# SalesTracker → Postgres — Plan 2: Auth (better-auth)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Reemplazar la autenticación Supabase/GoTrue por **better-auth** sobre `sales-tracker-db`: login/registro/logout/cambio de password+email, verificación de los hashes **bcrypt** migrados, sesión por cookie, middleware con gate de aprobación, y `auth-provider` sin Supabase.

**Architecture:** `better-auth` con `drizzleAdapter(db, {provider:"pg"})`, `emailAndPassword` con hash/verify **bcryptjs** (para los `$2a$` migrados), `nextCookies()` plugin. Route handler `/api/auth/[...all]`. Cliente `authClient` (better-auth/react). IDs uuid generados por Postgres (schema ya tiene `defaultRandom()`). Confirmado contra la guía oficial better-auth de migración desde Supabase.

**Tech Stack:** better-auth ^1.6, bcryptjs, drizzle (ya instalado en Plan 1).

**Prerequisito:** Plan 1 completo (`sales-tracker-db` con datos; `src/db`). Para pruebas locales contra la BD, abrir túnel SSH `-L 5544:<ip-sales-tracker-db>:5432` y `DATABASE_URL=postgres://postgres:<pw>@localhost:5544/sales_tracker`.

---

### Task 1: Config de better-auth (`src/lib/auth/auth.ts`)

**Files:** Create `src/lib/auth/auth.ts`

- [ ] **Step 1:** Implementar:
```ts
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
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  plugins: [nextCookies()], // nextCookies SIEMPRE el último
});
```
- [ ] **Step 2:** Añadir env a `.env.local` (local) y al servicio Easypanel (cutover): `BETTER_AUTH_SECRET=<openssl rand -base64 32>`, `BETTER_AUTH_URL=https://sales-tracker.ambientalia.cloud` (local: `http://localhost:3000`).
- [ ] **Step 3:** Commit.

---

### Task 2: Route handler `/api/auth/[...all]`

**Files:** Create `src/app/api/auth/[...all]/route.ts`
```ts
import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```
- [ ] Commit.

---

### Task 3: Cliente better-auth (`src/lib/auth/client.ts`)

**Files:** Create `src/lib/auth/client.ts`
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```
- [ ] Commit.

---

### Task 4: Smoke test del esquema better-auth (TDD)

**Files:** Create `src/lib/auth/__tests__/auth.smoke.test.ts`

- [ ] **Step 1:** Test: crear un usuario de prueba y verificar login (contra la BD vía túnel). Usa `auth.api.signUpEmail` + `auth.api.signInEmail`.
```ts
import { describe, it, expect } from "vitest";
import { auth } from "@/lib/auth/auth";
it("signup + signin de usuario nuevo funciona", async () => {
  const email = `test_${Date.now()}@example.com`;
  const up = await auth.api.signUpEmail({ body: { email, password: "Test1234!", name: "T" } });
  expect(up.user.id).toBeTruthy();
  const inn = await auth.api.signInEmail({ body: { email, password: "Test1234!" } });
  expect(inn.token).toBeTruthy();
});
```
- [ ] **Step 2:** Test: verificar que un hash **bcrypt** importado valida. Insertar un user+account con `bcrypt.hash("Known123!",10)` y comprobar `signInEmail` OK. (Esto valida el camino de los usuarios migrados sin conocer su contraseña real.)
- [ ] **Step 3:** Ejecutar `npm test`; limpiar usuarios de prueba al final.
- [ ] Commit.

---

### Task 5: Server helpers de sesión + guards (`src/lib/auth/guards.ts`)

**Files:** Create `src/lib/auth/guards.ts`
```ts
import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getSessionUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, s.user.id));
  return { user: s.user, profile };
}
export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}
export async function requireApproved() {
  const u = await requireUser();
  if (!u.profile?.isApproved) throw new Error("NOT_APPROVED");
  return u;
}
export async function requireRole(...roles: string[]) {
  const u = await requireApproved();
  if (!roles.includes(u.profile!.role)) throw new Error("FORBIDDEN");
  return u;
}
```
- [ ] Test guards (rol/aprobación). Commit.

---

### Task 6: Middleware con gate de aprobación

**Files:** Modify `src/middleware.ts`; delete `src/lib/supabase/middleware.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function middleware(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { pathname } = req.nextUrl;
  const isAuthPage = ["/login","/register"].some(p => pathname.startsWith(p));
  if (!session) return isAuthPage ? NextResponse.next() : NextResponse.redirect(new URL("/login", req.url));
  const [p] = await db.select({ approved: profiles.isApproved }).from(profiles).where(eq(profiles.id, session.user.id));
  if (!p?.approved && pathname !== "/waiting-approval")
    return NextResponse.redirect(new URL("/waiting-approval", req.url));
  if (p?.approved && (isAuthPage || pathname === "/waiting-approval"))
    return NextResponse.redirect(new URL("/home", req.url));
  return NextResponse.next();
}
export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"] };
```
- [ ] Commit.

---

### Task 7: Reescribir `auth-provider.tsx`

**Files:** Modify `src/components/providers/auth-provider.tsx`
- [ ] Reemplazar `getSession`/`onAuthStateChange`/canal realtime por `authClient.useSession()` y una server action `getMyProfile()` (de `guards`/nueva action) para el perfil. `signOut` → `authClient.signOut()`. Eliminar el canal realtime.
- [ ] Commit.

---

### Task 8: Páginas/forms de auth

**Files:** Modify `login/page.tsx`, `register/page.tsx`, `waiting-approval/page.tsx`, `settings/_components/security-form.tsx`, `profile-form.tsx`, `account-settings-form.tsx`; delete `src/app/auth/callback/route.ts`

- [ ] **login**: `signIn.email({ email, password })`.
- [ ] **register**: `signUp.email({ email, password, name })` → crea user; **crear profile** asociado (server action `createProfileForNewUser` con `is_approved=false`, company por defecto/elegida). Redirige a `/waiting-approval`.
- [ ] **waiting-approval**: leer `getSessionUser()` (server) y mostrar estado.
- [ ] **security-form** (cambio password): `authClient.changePassword({ newPassword, currentPassword })`.
- [ ] **profile/account email**: `authClient.updateUser`/`changeEmail` (sin verificación).
- [ ] Borrar el callback OAuth de Supabase.
- [ ] Commit por archivo.

---

### Task 9: Trigger de creación de profile

En Supabase el trigger `on_auth_user_created` creaba el profile. Aquí lo hace la app: en el registro (Task 8) tras `signUp`, una server action inserta la fila en `profiles` (id=nuevo user.id, role por defecto 'viewer', is_approved=false, company_id). Test del flujo registro→profile no aprobado. Commit.

---

## Self-review
- Cobertura spec §6,7,9 (auth, guards, middleware, registro/aprobación): Tasks 1-9. ✅
- bcrypt verify (riesgo §16): Task 1 + test Task 4 step 2 lo validan sin la contraseña real. ✅
- Placeholders: `<pw>`,`<ip>`,`<secret>` son valores runtime. ✅
- Consistencia: `profiles.isApproved`/`role` coinciden con schema Plan 1; `account(providerId='credential', password=bcrypt)` coincide con migración Plan 1. ✅
- Pendiente Plan 3 (capa de datos) y Plan 4 (cutover).
