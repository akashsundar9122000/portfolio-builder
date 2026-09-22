import "server-only";
import { env } from "./env";

/**
 * Per-code usage counters on Upstash's free tier (REST, no SDK). Without
 * Upstash configured, limits are not enforced — the code itself is still
 * required. Counters expire after 30 days.
 */
async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Usage store error ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

/** Returns false if this use would exceed the limit. */
export async function consume(code: string, kind: "portrait" | "text", limit: number): Promise<boolean> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return true;
  const key = `pb:${kind}:${code}`;
  const n = Number(await redis(["INCR", key]));
  if (n === 1) await redis(["EXPIRE", key, 60 * 60 * 24 * 30]);
  if (n > limit) {
    await redis(["DECR", key]);
    return false;
  }
  return true;
}
