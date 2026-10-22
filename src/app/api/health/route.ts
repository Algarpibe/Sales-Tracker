import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getHubPool, hubEnabled } from "@/db/hub";
import { logError } from "@/lib/logger";

// Health check (INFRA-067). Público (fuera del matcher del proxy) y sin datos:
// el cuerpo solo lleva estados, nunca mensajes de error, hosts ni trazas.
//  - GET /api/health          → liveness: 200 mientras el proceso sirva peticiones.
//    NO toca la BD: es lo que usa el HEALTHCHECK de Docker, y una caída de Postgres
//    no debe hacer que Docker/Swarm reinicie el contenedor en bucle.
//  - GET /api/health?ready=1  → readiness: SELECT 1 en el pool principal y, si está
//    habilitado, en el del hub. 200 si todo responde; 503 "degraded" si no.
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 2_000;
const NO_STORE = { "Cache-Control": "no-store" };

type CheckStatus = "ok" | "error" | "timeout";

// Ejecuta una sonda con tope de tiempo. El detalle del fallo solo va al log.
async function probe(name: string, run: () => Promise<unknown>): Promise<CheckStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), CHECK_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([run().then(() => "ok" as const), timeout]);
    if (result === "timeout") logError("health: la sonda no respondió a tiempo", undefined, { check: name });
    return result;
  } catch (e) {
    logError("health: la sonda falló", e, { check: name });
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("ready") !== "1") {
    return NextResponse.json({ status: "ok" }, { headers: NO_STORE });
  }

  const [dbStatus, hubStatus] = await Promise.all([
    probe("db", () => db.execute(sql`SELECT 1`)),
    hubEnabled() ? probe("hub", () => getHubPool().query("SELECT 1")) : Promise.resolve("disabled" as const),
  ]);

  const healthy = dbStatus === "ok" && (hubStatus === "ok" || hubStatus === "disabled");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db: dbStatus, hub: hubStatus },
    { status: healthy ? 200 : 503, headers: NO_STORE }
  );
}
