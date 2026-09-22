import { NextResponse } from "next/server";
import { imageGateway } from "@/lib/imagegen";
import { AdminExtras, PublicImageRequest } from "@/lib/imagegen/validate";
import { isAdmin, rateLimit, respond } from "@/lib/imagegen/http-api";
import { requireSession, fail } from "@/lib/server/guard";


export const maxDuration = 150; // > IMAGE_GENERATION_TIMEOUT_MS (120 s); Vercel Hobby allows up to 300 s

/**
 * POST /api/generate-image
 * { prompt, model?: FAST|QUALITY|CINEMATIC|ILLUSTRATION, width?, height?, quality?, seed? }
 * → 202 { generationId, status, imageUrl }   (COMPLETED immediately, or QUEUED)
 * The caller never chooses the provider.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return fail("Send a JSON body with a prompt.");
  const admin = isAdmin(req);
  const { modelOverride, ...publicPart } = raw;
  const parsed = PublicImageRequest.safeParse(publicPart);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const extras = admin ? AdminExtras.parse({ modelOverride }) : {};

  const limited = await rateLimit(session.code);
  if (limited) return limited;

  const g = imageGateway();
  const result = await g.service.start({ task: "textToImage", ...parsed.data, ...extras }, session.code);
  return respond(result, true);
}
