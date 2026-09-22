import { NextResponse } from "next/server";
import { z } from "zod";
import { imageGateway } from "@/lib/imagegen";
import { rateLimit, respond } from "@/lib/imagegen/http-api";
import { outfitById, outfitPrompt } from "@/lib/builder/outfits";
import { requireSession, fail } from "@/lib/server/guard";
import { consume } from "@/lib/server/limits";

export const maxDuration = 150; // > IMAGE_GENERATION_TIMEOUT_MS (120 s); Vercel Hobby allows up to 300 s

const Body = z
  .object({
    photo: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
    outfitId: z.string().max(40),
    color: z.string().max(20),
    consent: z.literal(true),
  })
  .strict();

/**
 * The outfit step: an identity-preserving edit through the image gateway.
 * Same response shape as /api/generate-image, so the client polls
 * /api/generate-image/:id if it comes back queued. The photo is used for
 * this request only and never stored server-side.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Please upload a JPEG, PNG or WebP photo under 3 MB, and confirm consent.");
  const outfit = outfitById(parsed.data.outfitId);
  if (outfit.id === "keep") return fail("Nothing to generate for 'Keep my outfit'.");
  const color = outfit.colors.includes(parsed.data.color) ? parsed.data.color : outfit.colors[0];

  const limited = await rateLimit(session.code);
  if (limited) return limited;
  if (!(await consume(session.code, "portrait", session.portraits))) return fail("This invite code has used all its portrait generations.", 429);

  const result = await imageGateway().service.start(
    {
      task: "imageEditing",
      prompt: outfitPrompt(outfit, color),
      negativePrompt: "different person, altered face, distorted face, extra people, text, watermark, logo",
      model: "EDIT",
      width: 768,
      height: 960,
      quality: "high",
      sourceImage: parsed.data.photo,
    },
    session.code,
  );
  return respond(result, true);
}
