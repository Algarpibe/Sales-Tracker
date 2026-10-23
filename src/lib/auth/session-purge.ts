import { lt } from "drizzle-orm";
import { db } from "@/db";
import { session, verification } from "@/db/schema";
import { logWarn } from "@/lib/logger";

/**
 * Retención de sesiones (PRIV-093). Cada sesión guarda la IP y el user-agent de quien
 * inició sesión; better-auth no borra las caducadas, así que se acumulaban para
 * siempre. Regla: las sesiones (y las verificaciones) caducadas se borran al
 * expirar, como tarde en el siguiente inicio de sesión de cualquier usuario. Sin
 * cron: lo dispara databaseHooks.session.create.after (auth.ts) sin esperarlo.
 *
 * Best-effort: nunca lanza. Un fallo deja un aviso con el código del error, sin su
 * mensaje (puede llevar el host de la BD) ni datos personales, y se reintenta en el
 * siguiente login. Cada tabla va por separado: si falla una, se intenta la otra.
 */
export async function purgeExpiredAuthRows(now: Date = new Date()): Promise<void> {
  const results = await Promise.allSettled([
    db.delete(session).where(lt(session.expiresAt, now)),
    db.delete(verification).where(lt(verification.expiresAt, now)),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logWarn("no se pudieron purgar las filas caducadas de auth", {
        table: i === 0 ? "session" : "verification",
        code: errorCode(r.reason),
      });
    }
  });
}

function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string") return e.code;
  return e instanceof Error ? e.name : "UNKNOWN";
}
