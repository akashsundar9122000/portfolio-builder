import "server-only";
import { z } from "zod";
import type { ModelAlias } from "./types";

/**
 * Gateway configuration, read once from the environment. Every value has a
 * safe default, so the gateway runs with only provider keys set.
 */

export const STRATEGIES = ["ROUND_ROBIN", "WEIGHTED", "HEALTH_BASED", "LEAST_LATENCY", "AUTO"] as const;
export type Strategy = (typeof STRATEGIES)[number];

const int = (d: number, min = 0) => z.coerce.number().int().min(min).default(d);

const Schema = z.object({
  POLLINATIONS_API_KEY: z.string().optional(),
  POLLINATIONS_ALLOW_PAID_MODELS: z.enum(["true", "false"]).default("false"),
  AI_HORDE_API_KEY: z.string().optional(),
  IMAGE_PROVIDER_STRATEGY: z.enum(STRATEGIES).default("AUTO"),
  IMAGE_FORCE_PROVIDER: z.string().optional(),
  IMAGE_PROVIDER_WEIGHTS: z.string().optional(), // "pollinations:3,ai_horde:1"
  IMAGE_MAX_PROVIDER_ATTEMPTS: int(2, 1),
  PROVIDER_FAILURE_THRESHOLD: int(3, 1),
  PROVIDER_COOLDOWN_MS: int(60_000, 1000),
  PROVIDER_MAX_COOLDOWN_MS: int(15 * 60_000, 1000),
  PROVIDER_HEALTH_WINDOW_SIZE: int(20, 3),
  IMAGE_GENERATION_TIMEOUT_MS: int(120_000, 5000),
  AI_HORDE_MAX_WAIT_MS: int(10 * 60_000, 30_000),
  IMAGE_REQUESTS_PER_MINUTE: int(5, 1),
  IMAGE_GLOBAL_REQUESTS_PER_MINUTE: int(60, 1),
  IMAGE_MODEL_MAP: z.string().optional(), // JSON, see models.ts
  IMAGE_ADMIN_TOKEN: z.string().min(16).optional(),
});

const blank = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]));

export type GatewayConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = blank) {
  const c = Schema.parse(env);
  return {
    pollinationsKey: c.POLLINATIONS_API_KEY,
    pollinationsAllowPaid: c.POLLINATIONS_ALLOW_PAID_MODELS === "true",
    // AI Horde accepts an anonymous key; requests then run at the lowest priority.
    hordeKey: c.AI_HORDE_API_KEY ?? "0000000000",
    hordeAnonymous: !c.AI_HORDE_API_KEY,
    strategy: c.IMAGE_PROVIDER_STRATEGY as Strategy,
    forceProvider: c.IMAGE_FORCE_PROVIDER || undefined,
    weights: Object.fromEntries(
      (c.IMAGE_PROVIDER_WEIGHTS ?? "").split(",").map((s) => s.split(":")).filter(([k, v]) => k && Number(v) > 0).map(([k, v]) => [k.trim(), Number(v)]),
    ) as Record<string, number>,
    maxAttempts: c.IMAGE_MAX_PROVIDER_ATTEMPTS,
    failureThreshold: c.PROVIDER_FAILURE_THRESHOLD,
    cooldownMs: c.PROVIDER_COOLDOWN_MS,
    maxCooldownMs: c.PROVIDER_MAX_COOLDOWN_MS,
    windowSize: c.PROVIDER_HEALTH_WINDOW_SIZE,
    timeoutMs: c.IMAGE_GENERATION_TIMEOUT_MS,
    hordeMaxWaitMs: c.AI_HORDE_MAX_WAIT_MS,
    perUserPerMinute: c.IMAGE_REQUESTS_PER_MINUTE,
    globalPerMinute: c.IMAGE_GLOBAL_REQUESTS_PER_MINUTE,
    modelMap: c.IMAGE_MODEL_MAP ? (JSON.parse(c.IMAGE_MODEL_MAP) as Partial<Record<ModelAlias, Record<string, string[]>>>) : undefined,
    adminToken: c.IMAGE_ADMIN_TOKEN,
  };
}

let cached: GatewayConfig | undefined;
export function config(): GatewayConfig {
  return (cached ??= loadConfig());
}
