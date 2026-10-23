import type { NextRequest } from "next/server";
import { handleDataRequest } from "@/lib/data-api";

// Lecturas de datos por GET (DATA-043): ver src/lib/data-api.ts. Siempre dinámica: son
// datos por usuario y nunca se prerenderizan ni se cachean.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  return handleDataRequest(resource, req.nextUrl.searchParams);
}
