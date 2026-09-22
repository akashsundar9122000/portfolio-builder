import { classifyThrown, isFallbackable, ProviderError, type ErrorType } from "./errors";
import type { ProviderHealthTracker } from "./health";
import { isTerminal, transition } from "./lifecycle";
import type { ProviderRegistry } from "./registry";
import type { IntelligentProviderRouter } from "./router";
import type { ImageStorage } from "./storage";
import { newGenerationKey, signToken, userHash, verifyToken, type GenerationToken } from "./token";
import type { GenerationResult, GenerationStatus, ImageGenerationRequest } from "./types";
import type { Logger } from "./events";

/**
 * The public face of the gateway. Routes call start / status / cancel and
 * get back provider-free answers: an opaque generationId, a status, and
 * (when done) an app-storage URL.
 *
 * Synchronous providers finish inside start() under a hard timeout;
 * asynchronous ones return QUEUED and are advanced on each status() poll,
 * so no HTTP request ever blocks on a queue.
 */

export interface PublicGeneration {
  generationId: string;
  status: GenerationStatus;
  imageUrl: string | null;
  /** Safe, user-facing text for FAILED / TIMEOUT. */
  message?: string;
}

export interface ServiceDeps {
  registry: ProviderRegistry;
  router: IntelligentProviderRouter;
  health: ProviderHealthTracker;
  storage: ImageStorage;
  log: Logger;
  secret: string;
  maxAttempts: number;
  timeoutMs: number;
  hordeMaxWaitMs: number;
  /** Server-side floor between provider status checks for one generation. */
  minPollMs?: number;
  now?: () => number;
}

interface Cached { status: GenerationStatus; imageUrl: string | null; message?: string; checkedAt: number; at: number }

const MESSAGES: Partial<Record<ErrorType | "ALL_UNAVAILABLE" | "TIMEOUT", string>> = {
  INVALID_REQUEST: "That request can't be generated. Try describing it differently.",
  ALL_UNAVAILABLE: "Image generation is busy right now. Please try again in a minute.",
  TIMEOUT: "Image generation took too long. Please try again.",
};
const GENERIC = "Image generation failed. Please try again.";

export class ImageGenerationService {
  private cache = new Map<string, Cached>();
  private readonly now: () => number;

  constructor(private readonly d: ServiceDeps) {
    this.now = d.now ?? Date.now;
  }

  private remember(key: string, v: Omit<Cached, "at" | "checkedAt">, checkedAt = this.now()) {
    const prev = this.cache.get(key);
    if (prev && prev.status !== v.status) transition(prev.status, v.status);
    this.cache.set(key, { ...v, checkedAt, at: this.now() });
    if (this.cache.size > 500) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
      oldest.forEach(([k]) => this.cache.delete(k));
    }
  }

  /**
   * Hard deadline. The signal asks the provider to stop, and the race
   * guarantees the gateway moves on even if an adapter ignores it — a
   * request can never outlive its timeout.
   */
  private async withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(Object.assign(new Error(`timed out after ${ms} ms`), { name: "TimeoutError" }));
      }, ms);
    });
    try {
      return await Promise.race([fn(ctrl.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Starts a generation. `identity` is the authenticated user (here: the invite session). */
  async start(req: ImageGenerationRequest, identity: string): Promise<PublicGeneration> {
    const key = newGenerationKey();
    const owner = userHash(identity, this.d.secret);
    this.d.log("image_generation_started", { generationKey: key, task: req.task, model: req.model, width: req.width, height: req.height });
    this.remember(key, { status: "PENDING", imageUrl: null });
    return this.attempt(req, owner, key, []);
  }

  private failedResult(owner: string, key: string, tried: string[], message = GENERIC, status: GenerationStatus = "FAILED"): PublicGeneration {
    const generationId = signToken({ v: 1, g: key, u: owner, p: tried.at(-1) ?? "none", t: this.now(), a: tried }, this.d.secret);
    this.remember(key, { status, imageUrl: null, message });
    this.d.log(status === "TIMEOUT" ? "image_generation_timeout" : "image_generation_failed", { generationKey: key, tried: tried.join(",") });
    return { generationId, status, imageUrl: null, message };
  }

  /** Tries providers in router order until one accepts, up to maxAttempts in total. */
  private async attempt(req: ImageGenerationRequest, owner: string, key: string, alreadyTried: string[]): Promise<PublicGeneration> {
    const tried = [...alreadyTried];
    const budget = this.d.maxAttempts - tried.length;
    if (budget <= 0) return this.failedResult(owner, key, tried, MESSAGES.ALL_UNAVAILABLE);
    const plan = (await this.d.router.plan(req, tried)).slice(0, budget);
    if (plan.length === 0) return this.failedResult(owner, key, tried, MESSAGES.ALL_UNAVAILABLE);

    let last: ProviderError | undefined;
    for (const [i, cand] of plan.entries()) {
      const p = cand.provider;
      if (i > 0) {
        this.d.health.recordFallback(p.name);
        this.d.log("image_generation_fallback", { generationKey: key, from: tried.at(-1), to: p.name, errorType: last?.type });
      }
      if (cand.probe) this.d.health.markProbing(p.name);
      this.d.log("image_generation_provider_selected", { generationKey: key, provider: p.name, probe: cand.probe, score: cand.score ? +cand.score.toFixed(3) : undefined });
      tried.push(p.name);
      this.d.health.started(p.name);
      const t0 = this.now();
      try {
        // async providers only have to accept the job, so give them less time
        const limit = p.capabilities.asynchronous ? Math.min(20_000, this.d.timeoutMs) : this.d.timeoutMs;
        const result = await this.withTimeout((signal) => p.generate(req, signal), limit);
        if (result.status === "COMPLETED" && result.image) {
          this.d.health.succeeded(p.name, this.now() - t0);
          return this.complete(result, owner, key, tried, t0);
        }
        // accepted into a queue: release the in-flight slot; the outcome is recorded when it finishes
        this.d.health.released(p.name);
        this.d.health.recordQueue(p.name, result.queueSeconds);
        const token: GenerationToken = {
          v: 1, g: key, u: owner, p: p.name, r: result.providerRequestId, t: this.now(), a: tried,
          ...(req.task === "textToImage" ? { q: { task: req.task, prompt: req.prompt, negativePrompt: req.negativePrompt, model: req.model, width: req.width, height: req.height, quality: req.quality, seed: req.seed } } : {}),
        };
        this.remember(key, { status: "QUEUED", imageUrl: null });
        this.d.log("image_generation_queued", { generationKey: key, provider: p.name, providerRequestId: result.providerRequestId, durationMs: this.now() - t0 });
        return { generationId: signToken(token, this.d.secret), status: "QUEUED", imageUrl: null };
      } catch (e) {
        const err = classifyThrown(e, p.name);
        last = err;
        this.d.health.failed(p.name, err.type, err.message, this.now() - t0);
        this.d.log("image_generation_provider_failed", { generationKey: key, provider: p.name, durationMs: this.now() - t0, errorType: err.type, httpStatus: err.httpStatus });
        if (!isFallbackable(err.type)) return this.failedResult(owner, key, tried, MESSAGES.INVALID_REQUEST);
      }
    }
    return this.failedResult(owner, key, tried, last?.type === "TIMEOUT" ? MESSAGES.TIMEOUT : MESSAGES.ALL_UNAVAILABLE, last?.type === "TIMEOUT" && plan.length === 1 ? "TIMEOUT" : "FAILED");
  }

  private async complete(result: GenerationResult, owner: string, key: string, tried: string[], t0: number): Promise<PublicGeneration> {
    const { url } = await this.d.storage.store(result.image!, { generationKey: key, provider: result.provider });
    const generationId = signToken({ v: 1, g: key, u: owner, p: result.provider, r: result.providerRequestId, t: t0, a: tried }, this.d.secret);
    this.remember(key, { status: "COMPLETED", imageUrl: url });
    this.d.log("image_generation_completed", { generationKey: key, provider: result.provider, durationMs: this.now() - t0 });
    return { generationId, status: "COMPLETED", imageUrl: url };
  }

  /** Reads (and, for async providers, advances) a generation. Returns null if it isn't this user's. */
  async status(generationId: string, identity: string): Promise<PublicGeneration | null> {
    const t = verifyToken(generationId, this.d.secret);
    if (!t || t.u !== userHash(identity, this.d.secret)) return null;
    const cached = this.cache.get(t.g);
    if (cached && isTerminal(cached.status)) return { generationId, status: cached.status, imageUrl: cached.imageUrl, message: cached.message };
    // polling floor: status checks on the provider are cached upstream anyway
    if (cached && this.now() - cached.checkedAt < (this.d.minPollMs ?? 4000)) return { generationId, status: cached.status, imageUrl: null };

    const provider = this.d.registry.get(t.p);
    if (!provider?.getStatus || !t.r) {
      // a synchronous generation this instance doesn't remember; nothing to advance
      return { generationId, status: cached?.status ?? "FAILED", imageUrl: null, message: cached ? undefined : GENERIC };
    }
    const elapsed = this.now() - t.t;
    const prev = cached?.status ?? "QUEUED";

    if (elapsed > this.d.hordeMaxWaitMs) {
      await provider.cancel?.(t.r);
      this.d.health.failed(provider.name, "TIMEOUT", "Queue wait exceeded", elapsed, false);
      return this.fallbackOrEnd(t, "TIMEOUT");
    }

    let result: GenerationResult;
    try {
      result = await this.withTimeout((signal) => provider.getStatus!(t.r!, signal), 20_000);
    } catch (e) {
      const err = classifyThrown(e, provider.name);
      if (err.type === "INVALID_REQUEST") {
        this.d.health.failed(provider.name, err.type, err.message, elapsed, false);
        return this.failedResult(t.u, t.g, t.a, MESSAGES.INVALID_REQUEST);
      }
      // a failed status CHECK is not a failed generation: keep waiting
      this.remember(t.g, { status: prev, imageUrl: null });
      return { generationId, status: prev, imageUrl: null };
    }

    this.d.health.recordQueue(provider.name, result.queueSeconds);
    if (result.status === "COMPLETED" && result.image) {
      this.d.health.succeeded(provider.name, elapsed, false);
      return this.complete(result, t.u, t.g, t.a, t.t);
    }
    if (result.status === "FAILED" || result.status === "TIMEOUT") {
      this.d.health.failed(provider.name, result.status === "TIMEOUT" ? "TIMEOUT" : "TRANSIENT", result.error ?? "failed", elapsed, false);
      return this.fallbackOrEnd(t, result.status);
    }
    // is_possible=false for a sustained period: no workers can serve it
    if (result.metadata?.isPossible === false && elapsed > 90_000) {
      await provider.cancel?.(t.r);
      this.d.health.failed(provider.name, "PROVIDER_UNAVAILABLE", "No workers can serve this request", elapsed, false);
      return this.fallbackOrEnd(t, "FAILED");
    }
    if (result.status !== prev) this.d.log(result.status === "PROCESSING" ? "image_generation_processing" : "image_generation_queued", { generationKey: t.g, provider: provider.name, queueSeconds: result.queueSeconds });
    this.remember(t.g, { status: result.status, imageUrl: null });
    return { generationId, status: result.status, imageUrl: null };
  }

  /** After an async provider fails or times out: try the next provider if the budget allows, else end. */
  private async fallbackOrEnd(t: GenerationToken, ending: "FAILED" | "TIMEOUT"): Promise<PublicGeneration> {
    // the fallback attempt records its own outcome, success or failure
    if (t.q && t.a.length < this.d.maxAttempts) return this.attempt({ ...t.q }, t.u, t.g, t.a);
    return this.failedResult(t.u, t.g, t.a, ending === "TIMEOUT" ? MESSAGES.TIMEOUT : GENERIC, ending);
  }

  async cancel(generationId: string, identity: string): Promise<PublicGeneration | null> {
    const t = verifyToken(generationId, this.d.secret);
    if (!t || t.u !== userHash(identity, this.d.secret)) return null;
    const cached = this.cache.get(t.g);
    if (cached && isTerminal(cached.status)) return { generationId, status: cached.status, imageUrl: cached.imageUrl };
    const p = this.d.registry.get(t.p);
    if (p?.cancel && t.r) await p.cancel(t.r);
    this.remember(t.g, { status: "CANCELLED", imageUrl: null });
    this.d.log("image_generation_cancelled", { generationKey: t.g, provider: t.p });
    return { generationId, status: "CANCELLED", imageUrl: null };
  }
}
