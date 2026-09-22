import "server-only";
import { config } from "./config";
import { logEvent } from "./events";
import { ProviderHealthTracker } from "./health";
import { AIHordeProvider } from "./providers/ai-horde";
import { PollinationsProvider } from "./providers/pollinations";
import { RateLimiter } from "./ratelimit";
import { ProviderRegistry } from "./registry";
import { IntelligentProviderRouter } from "./router";
import { ImageGenerationService } from "./service";
import { InlineImageStorage } from "./storage";
import { env } from "@/lib/server/env";
import { hasRedis, redis } from "@/lib/server/limits";

/**
 * Composition root: one gateway per server instance.
 * To add a provider: implement ImageGenerationProvider in providers/,
 * register it below, and add its model preferences in models.ts.
 */

function build() {
  const c = config();
  const registry = new ProviderRegistry()
    .register(new PollinationsProvider({ apiKey: c.pollinationsKey, allowPaid: c.pollinationsAllowPaid, modelMap: c.modelMap }))
    .register(new AIHordeProvider({ apiKey: c.hordeKey, modelMap: c.modelMap }));

  const health = new ProviderHealthTracker({ windowSize: c.windowSize, failureThreshold: c.failureThreshold, cooldownMs: c.cooldownMs, maxCooldownMs: c.maxCooldownMs });
  const router = new IntelligentProviderRouter(registry, health, { strategy: c.strategy, forceProvider: c.forceProvider, weights: c.weights });
  const secret = env.CREATE_SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "dev-only-secret");
  if (!secret) throw new Error("CREATE_SESSION_SECRET is not set");
  const service = new ImageGenerationService({
    registry, router, health, storage: new InlineImageStorage(), log: logEvent, secret,
    maxAttempts: c.maxAttempts, timeoutMs: c.timeoutMs, hordeMaxWaitMs: c.hordeMaxWaitMs,
  });
  const limiter = new RateLimiter(hasRedis() ? redis : undefined);
  return { config: c, registry, health, router, service, limiter };
}

let gateway: ReturnType<typeof build> | undefined;
export function imageGateway() {
  return (gateway ??= build());
}

/** Whether any provider can currently take an identity-preserving edit (the outfit step). */
export function editingAvailable(): boolean {
  return imageGateway().registry.configured().some((p) => p.capabilities.imageEditing);
}
