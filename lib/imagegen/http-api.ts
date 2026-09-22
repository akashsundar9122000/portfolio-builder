import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { imageGateway } from "./index";
import type { PublicGeneration } from "./service";

/** Shared pieces of the image API routes. */

export function isAdmin(req: Request): boolean {
  const token = imageGateway().config.adminToken;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Per-user, then global. Returns a 429 response, or null if allowed. */
export async function rateLimit(identity: string): Promise<NextResponse | null> {
  const g = imageGateway();
  const user = await g.limiter.take(`img:user:${identity}`, g.config.perUserPerMinute);
  const global = user && (await g.limiter.take("img:global", g.config.globalPerMinute));
  if (user && global) return null;
  return NextResponse.json(
    { error: "You're generating images too quickly. Please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

export function respond(g: PublicGeneration, created = false) {
  const status = created ? (g.status === "FAILED" || g.status === "TIMEOUT" ? 502 : 202) : 200;
  return NextResponse.json(
    { generationId: g.generationId, status: g.status, imageUrl: g.imageUrl, ...(g.message ? { message: g.message } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
