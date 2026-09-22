/**
 * Fixed-window rate limiting per user and globally. Uses the app's
 * existing optional Upstash store (see lib/server/limits.ts) when it is
 * configured, so limits hold across serverless instances; otherwise an
 * in-memory window per instance.
 */

export type RedisCmd = (cmd: (string | number)[]) => Promise<unknown>;

export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly redis?: RedisCmd, private readonly now: () => number = Date.now) {}

  /** true if allowed; counts the request. */
  async take(key: string, limit: number, windowMs = 60_000): Promise<boolean> {
    const window = Math.floor(this.now() / windowMs);
    if (this.redis) {
      try {
        const k = `pb:rl:${key}:${window}`;
        const n = Number(await this.redis(["INCR", k]));
        if (n === 1) await this.redis(["PEXPIRE", k, windowMs]);
        return n <= limit;
      } catch {
        // store unreachable: fall back to the local window rather than failing open or closed
      }
    }
    const h = this.hits.get(key);
    if (!h || h.windowStart !== window) {
      this.hits.set(key, { windowStart: window, count: 1 });
      if (this.hits.size > 5000) this.hits.clear();
      return 1 <= limit;
    }
    h.count++;
    return h.count <= limit;
  }
}
