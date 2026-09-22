import { NextResponse } from "next/server";
import { imageGateway } from "@/lib/imagegen";
import { respond } from "@/lib/imagegen/http-api";
import { requireSession } from "@/lib/server/guard";

export const maxDuration = 60;

const notFound = () => NextResponse.json({ error: "Generation not found." }, { status: 404 });

/**
 * GET /api/generate-image/:generationId → { generationId, status, imageUrl }
 * Another user's ID (or a forged one) is indistinguishable from a missing
 * one: 404. The returned generationId can change if the gateway fell back
 * to another provider; clients should keep polling the latest one.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/generate-image/[generationId]">) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { generationId } = await ctx.params;
  const g = await imageGateway().service.status(decodeURIComponent(generationId), session.code);
  return g ? respond(g) : notFound();
}

/** DELETE /api/generate-image/:generationId → cancels a queued generation. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/generate-image/[generationId]">) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { generationId } = await ctx.params;
  const g = await imageGateway().service.cancel(decodeURIComponent(generationId), session.code);
  return g ? respond(g) : notFound();
}
