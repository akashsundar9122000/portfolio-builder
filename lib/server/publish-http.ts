import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, fail } from "./guard";
import { redis } from "./limits";
import { KvMissing } from "./kv";
import { StoreMissing } from "./sites";

/** Publishing is for anyone with a valid code; the owner key is their email ("master" for master codes). */
export async function publisher(): Promise<{ owner: string; email?: string } | NextResponse> {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  return s.kind === "issued" && s.email ? { owner: s.email, email: s.email } : { owner: "master" };
}

/** Per-owner daily budget, so one person can't spend the shared KV write allowance. */
export async function withinDaily(kind: string, owner: string, limit: number): Promise<boolean> {
  const key = `ff:rl:${kind}:${owner}`;
  const n = Number(await redis(["INCR", key]));
  if (n === 1) await redis(["EXPIRE", key, 24 * 60 * 60]);
  return n <= limit;
}

export function publishError(e: unknown, route: string) {
  if (e instanceof KvMissing || e instanceof StoreMissing) return fail("Publishing isn’t available right now.", 503);
  if (e instanceof ZodError) return fail("Part of your portfolio couldn’t be read — reload the builder and try again.");
  const message = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ route, error: message }));
  // messages from our own checks are written for people; storage errors aren't
  return fail(/storage|fetch failed/i.test(message) ? "Couldn’t reach site storage — try again in a minute." : message, 400);
}
