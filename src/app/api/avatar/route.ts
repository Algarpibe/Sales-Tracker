import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireApproved } from "@/lib/auth/guards";
import { authErrorStatus } from "@/lib/errors";
import { expectedOrigin, isSameOriginRequest } from "@/lib/same-origin";

// Detecta el tipo real por magic bytes (no se confía en file.type del cliente).
// Solo imágenes rasterizadas seguras (NO SVG: puede contener <script>).
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG  89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // GIF  47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  // WEBP 'RIFF'....'WEBP'
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Sube el avatar del usuario actual (multipart 'file') y lo guarda como bytea.
// Solo cuentas aprobadas y activas: el registro es abierto y una cuenta pendiente
// no debe poder escribir 2 MB por petición aunque el proxy falle.
export async function POST(req: NextRequest) {
  // Route handler propio: no tiene la comprobación de origen de las Server Actions.
  const sameOrigin = isSameOriginRequest({
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    expected: expectedOrigin(process.env.BETTER_AUTH_URL, req.nextUrl.origin),
  });
  if (!sameOrigin) return new NextResponse(null, { status: 403 });

  let user;
  try {
    // Escritura: sesión leída de la BD, sin la cookie cache (SEC-038).
    ({ user } = await requireApproved({ fresh: true }));
  } catch (e) {
    const status = authErrorStatus(e);
    if (status) return new NextResponse(null, { status });
    throw e;
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(bytes); // tipo REAL, no el declarado por el cliente
  if (!mime) {
    return NextResponse.json({ error: "Formato no permitido (solo PNG, JPEG, WEBP o GIF)" }, { status: 415 });
  }
  await db
    .update(profiles)
    .set({ avatar: bytes, avatar_mime: mime, updated_at: new Date().toISOString() })
    .where(eq(profiles.id, user.id));
  return NextResponse.json({ url: `/api/avatar/${user.id}?t=${Date.now()}` });
}
