import { NextResponse } from "next/server";
import { z } from "zod";
import { editPortrait, ImageUnavailable } from "@/lib/ai/image";
import { outfitById, outfitPrompt } from "@/lib/builder/outfits";
import { requireSession, fail } from "@/lib/server/guard";
import { consume } from "@/lib/server/limits";

export const maxDuration = 60;

const Body = z.object({
  photo: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  outfitId: z.string().max(40),
  color: z.string().max(20),
  consent: z.literal(true),
});

/**
 * Photo in, dressed portrait out. The photo is used for this one request
 * and never stored.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Please upload a JPEG, PNG or WebP photo under 3 MB, and confirm consent.");
  const outfit = outfitById(parsed.data.outfitId);
  if (outfit.id === "keep") return fail("Nothing to generate for 'Keep my outfit'.");
  const color = outfit.colors.includes(parsed.data.color) ? parsed.data.color : outfit.colors[0];
  if (!(await consume(session.code, "portrait", session.portraits))) {
    return fail("This invite code has used all its portrait generations.", 429);
  }
  const [head, base64] = parsed.data.photo.split(",");
  const mime = head.slice(5, head.indexOf(";"));
  try {
    const img = await editPortrait({ mime, base64 }, outfitPrompt(outfit, color));
    return NextResponse.json({ image: `data:${img.mime};base64,${img.base64}` });
  } catch (e) {
    if (e instanceof ImageUnavailable) return fail(e.message, 503);
    return fail(e instanceof Error ? e.message : "Image error", 502);
  }
}
