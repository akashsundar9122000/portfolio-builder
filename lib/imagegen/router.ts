import type { ImageGenerationProvider, ImageGenerationRequest, ProviderLoad } from "./types";
import type { ProviderRegistry } from "./registry";
import type { ProviderHealthTracker } from "./health";
import type { Strategy } from "./config";

/**
 * Chooses which providers to try, in order.
 *
 * 1. Eligibility (hard filters): configured, capable of the task and size,
 *    not cooling down, and IMAGE_FORCE_PROVIDER if set.
 * 2. Recovery: a provider whose cooldown has just expired is placed first
 *    for ONE request (a controlled recovery attempt). Its fallback is the
 *    next provider in the list, so a failed probe costs the user nothing
 *    but a few seconds.
 * 3. Ordering by strategy. AUTO scores health, latency, availability and
 *    load; it does not alternate for the sake of alternating.
 */

export interface AutoWeights { health: number; latency: number; availability: number; load: number }
export const DEFAULT_AUTO_WEIGHTS: AutoWeights = { health: 0.45, latency: 0.25, availability: 0.15, load: 0.15 };

export interface RouterOptions {
  strategy: Strategy;
  forceProvider?: string;
  weights?: Record<string, number>;
  autoWeights?: AutoWeights;
  random?: () => number;
}

export interface Candidate {
  provider: ImageGenerationProvider;
  probe: boolean;
  score?: number;
}

export function supports(p: ImageGenerationProvider, r: ImageGenerationRequest): boolean {
  const c = p.capabilities;
  if (r.task === "textToImage" && !c.textToImage) return false;
  if (r.task === "imageEditing" && !c.imageEditing) return false;
  return r.width <= c.maxWidth && r.height <= c.maxHeight;
}

export class IntelligentProviderRouter {
  private rr = 0;
  private loads = new Map<string, { at: number; load?: ProviderLoad }>();

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly health: ProviderHealthTracker,
    private readonly o: RouterOptions,
  ) {}

  /** Refreshes provider load at most once a minute; never blocks routing for long. */
  private async load(p: ImageGenerationProvider): Promise<ProviderLoad | undefined> {
    if (!p.getLoad) return undefined;
    const hit = this.loads.get(p.name);
    if (hit && Date.now() - hit.at < 60_000) return hit.load;
    const load = await Promise.race([p.getLoad().catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, 1500))]);
    this.loads.set(p.name, { at: Date.now(), load });
    if (load?.queueSeconds !== undefined) this.health.recordQueue(p.name, load.queueSeconds);
    return load;
  }

  /** Expected latency when a provider has no history yet. */
  private expectedLatency(p: ImageGenerationProvider): number {
    return this.health.averageLatency(p.name) ?? (p.capabilities.asynchronous ? 60_000 : 15_000);
  }

  async score(p: ImageGenerationProvider, probe: boolean): Promise<number> {
    const w = this.o.autoWeights ?? DEFAULT_AUTO_WEIGHTS;
    const health = this.health.successRate(p.name) * Math.max(0, 1 - 0.15 * this.health.consecutiveFailures(p.name));
    const latency = 1 / (1 + this.expectedLatency(p) / 10_000);
    const state = this.health.state(p.name);
    const availability = probe ? 0.4 : state === "HEALTHY" ? 1 : state === "DEGRADED" ? 0.6 : 0.2;
    const load = await this.load(p);
    const queue = load?.queueScore ?? 0;
    const busy = Math.min(1, this.health.active(p.name) / 10);
    const loadScore = Math.max(0, 1 - Math.max(queue, busy));
    return w.health * health + w.latency * latency + w.availability * availability + w.load * loadScore;
  }

  async plan(request: ImageGenerationRequest, exclude: string[] = []): Promise<Candidate[]> {
    let pool = this.registry.configured().filter((p) => !exclude.includes(p.name) && supports(p, request));
    if (this.o.forceProvider) pool = pool.filter((p) => p.name === this.o.forceProvider);

    const eligible: Candidate[] = [];
    for (const p of pool) {
      const r = this.health.routable(p.name);
      if (r.ok) eligible.push({ provider: p, probe: r.probe });
    }
    const probes = eligible.filter((c) => c.probe);
    const normal = eligible.filter((c) => !c.probe);
    return [...probes, ...(await this.order(normal))];
  }

  private async order(cands: Candidate[]): Promise<Candidate[]> {
    if (cands.length < 2) return cands;
    switch (this.o.strategy) {
      case "ROUND_ROBIN": {
        const start = this.rr++ % cands.length;
        return [...cands.slice(start), ...cands.slice(0, start)];
      }
      case "WEIGHTED": {
        // weighted random choice for the first slot, the rest by weight
        const rnd = this.o.random ?? Math.random;
        const weight = (c: Candidate) => this.o.weights?.[c.provider.name] ?? 1;
        const total = cands.reduce((a, c) => a + weight(c), 0);
        let pick = rnd() * total;
        const first = cands.find((c) => (pick -= weight(c)) < 0) ?? cands[0];
        return [first, ...cands.filter((c) => c !== first).sort((a, b) => weight(b) - weight(a))];
      }
      case "HEALTH_BASED":
        return [...cands].sort(
          (a, b) =>
            this.health.successRate(b.provider.name) - this.health.successRate(a.provider.name) ||
            this.health.consecutiveFailures(a.provider.name) - this.health.consecutiveFailures(b.provider.name),
        );
      case "LEAST_LATENCY":
        return [...cands].sort((a, b) => this.expectedLatency(a.provider) - this.expectedLatency(b.provider));
      case "AUTO":
      default: {
        const scored = await Promise.all(cands.map(async (c) => ({ ...c, score: await this.score(c.provider, c.probe) })));
        return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
    }
  }
}
