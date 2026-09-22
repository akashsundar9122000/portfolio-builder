import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyHttp, ProviderError } from "@/lib/imagegen/errors";
import { ProviderHealthTracker } from "@/lib/imagegen/health";
import { canTransition, transition } from "@/lib/imagegen/lifecycle";
import { AIHordeProvider } from "@/lib/imagegen/providers/ai-horde";
import { PollinationsProvider } from "@/lib/imagegen/providers/pollinations";
import { RateLimiter } from "@/lib/imagegen/ratelimit";
import { ProviderRegistry } from "@/lib/imagegen/registry";
import { IntelligentProviderRouter } from "@/lib/imagegen/router";
import { ImageGenerationService } from "@/lib/imagegen/service";
import { InlineImageStorage } from "@/lib/imagegen/storage";
import { signToken, verifyToken } from "@/lib/imagegen/token";
import type { GenerationResult, ImageGenerationProvider, ImageGenerationRequest, ProviderCapabilities } from "@/lib/imagegen/types";
import { PublicImageRequest } from "@/lib/imagegen/validate";
import type { Strategy } from "@/lib/imagegen/config";

// ── helpers ──────────────────────────────────────────────────────────────

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const PNG_B64 = Buffer.from(PNG).toString("base64");
const req = (over: Partial<ImageGenerationRequest> = {}): ImageGenerationRequest => ({
  task: "textToImage", prompt: "a lighthouse at dusk", model: "QUALITY", width: 1024, height: 1024, quality: "medium", ...over,
});

class Clock { t = 1_000_000; now = () => this.t; advance(ms: number) { this.t += ms; } }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const SYNC: ProviderCapabilities = { textToImage: true, imageToImage: true, imageEditing: true, maxWidth: 2048, maxHeight: 2048, sizeStep: 16, asynchronous: false };
const ASYNC: ProviderCapabilities = { textToImage: true, imageToImage: false, imageEditing: false, maxWidth: 1024, maxHeight: 1024, sizeStep: 64, asynchronous: true };

/** A scriptable in-memory provider. */
class FakeProvider implements ImageGenerationProvider {
  calls = 0;
  statusCalls = 0;
  cancelled: string[] = [];
  generateImpl: (r: ImageGenerationRequest) => Promise<GenerationResult>;
  statusImpl: (id: string) => Promise<GenerationResult> = async () => ({ provider: this.name, status: "QUEUED" });
  constructor(public readonly name: string, public readonly capabilities: ProviderCapabilities, private configured = true) {
    this.generateImpl = async () => this.capabilities.asynchronous
      ? { provider: this.name, status: "QUEUED", providerRequestId: `${this.name}-req-1` }
      : { provider: this.name, status: "COMPLETED", image: { mime: "image/png", data: PNG } };
  }
  isConfigured() { return this.configured; }
  generate(r: ImageGenerationRequest) { this.calls++; return this.generateImpl(r); }
  getStatus?(id: string) { this.statusCalls++; return this.statusImpl(id); }
  async cancel(id: string) { this.cancelled.push(id); }
}

function setup(o: { strategy?: Strategy; maxAttempts?: number; providers?: ImageGenerationProvider[]; force?: string } = {}) {
  const clock = new Clock();
  const pol = new FakeProvider("pollinations", SYNC);
  const horde = new FakeProvider("ai_horde", ASYNC);
  const registry = new ProviderRegistry();
  for (const p of o.providers ?? [pol, horde]) registry.register(p);
  const health = new ProviderHealthTracker({ windowSize: 20, failureThreshold: 3, cooldownMs: 60_000, maxCooldownMs: 600_000, now: clock.now });
  const router = new IntelligentProviderRouter(registry, health, { strategy: o.strategy ?? "AUTO", forceProvider: o.force });
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  const service = new ImageGenerationService({
    registry, router, health, storage: new InlineImageStorage(), secret: "test-secret-0123456789",
    log: (event, fields) => events.push({ event, fields }), maxAttempts: o.maxAttempts ?? 2, timeoutMs: 1000, hordeMaxWaitMs: 600_000, minPollMs: 0, now: clock.now,
  });
  return { clock, pol, horde, registry, health, router, service, events };
}

// ── errors & lifecycle ───────────────────────────────────────────────────

describe("error classification", () => {
  it("maps HTTP statuses to error types", () => {
    expect(classifyHttp(400, "p").type).toBe("INVALID_REQUEST");
    expect(classifyHttp(401, "p").type).toBe("AUTHENTICATION");
    expect(classifyHttp(402, "p").type).toBe("QUOTA_EXHAUSTED");
    expect(classifyHttp(429, "p").type).toBe("RATE_LIMITED");
    expect(classifyHttp(503, "p").type).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyHttp(500, "p").type).toBe("TRANSIENT");
  });
});

describe("generation lifecycle (the persisted state machine)", () => {
  it("allows the documented transitions", () => {
    expect(transition("PENDING", "QUEUED")).toBe("QUEUED");
    expect(transition("QUEUED", "PROCESSING")).toBe("PROCESSING");
    expect(transition("PROCESSING", "COMPLETED")).toBe("COMPLETED");
    expect(canTransition("PROCESSING", "FAILED")).toBe(true);
    expect(canTransition("PROCESSING", "TIMEOUT")).toBe(true);
    expect(canTransition("PROCESSING", "QUEUED")).toBe(true); // horde restarts jobs
  });
  it("never leaves a terminal state", () => {
    for (const t of ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"] as const) expect(() => transition(t, "PROCESSING")).toThrow();
  });
});

// ── Pollinations adapter ─────────────────────────────────────────────────

const CATALOGUE = [
  { name: "black-forest-labs/flux.1-schnell", aliases: ["flux"], input_modalities: ["text"], output_modalities: ["image"], paid_only: null },
  { name: "openai/gpt-image-1-mini", aliases: ["gptimage"], input_modalities: ["text", "image"], output_modalities: ["image"], paid_only: null },
  { name: "black-forest-labs/flux.2-klein-4b", aliases: ["klein"], input_modalities: ["text", "image"], output_modalities: ["image"], paid_only: null },
  { name: "google/gemini-3-pro-image", aliases: ["nanobanana-pro"], input_modalities: ["text", "image"], output_modalities: ["image"], paid_only: true },
];

function pollinationsWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, allowPaid = false) {
  const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    if (url.endsWith("/image/models")) return json(CATALOGUE);
    return handler(url, init);
  });
  return { p: new PollinationsProvider({ apiKey: "sk_test_secret_value", allowPaid, fetch: f as unknown as typeof fetch }), f };
}

describe("PollinationsProvider", () => {
  it("generates via /v1/images/generations with the key server-side and returns bytes", async () => {
    const { p, f } = pollinationsWith(() => json({ data: [{ b64_json: PNG_B64 }] }, 200, { "x-request-id": "rq-1" }));
    const r = await p.generate(req(), new AbortController().signal);
    expect(r.status).toBe("COMPLETED");
    expect(r.providerRequestId).toBe("rq-1");
    expect(r.image?.mime).toBe("image/png");
    const [url, init] = f.mock.calls.at(-1)!;
    expect(String(url)).toBe("https://gen.pollinations.ai/v1/images/generations");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_secret_value");
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("openai/gpt-image-1-mini"); // QUALITY → first catalogue match
    expect(body.size).toBe("1024x1024");
  });
  it("uses /v1/images/edits with a data URI for identity-preserving edits and skips paid-only models", async () => {
    const { p, f } = pollinationsWith(() => json({ data: [{ b64_json: PNG_B64 }] }));
    await p.generate(req({ task: "imageEditing", model: "EDIT", sourceImage: "data:image/jpeg;base64,AAAA" }), new AbortController().signal);
    const [url, init] = f.mock.calls.at(-1)!;
    expect(String(url)).toBe("https://gen.pollinations.ai/v1/images/edits");
    const body = JSON.parse(init!.body as string);
    expect(body.image).toEqual([{ image_url: "data:image/jpeg;base64,AAAA" }]);
    expect(body.model).toBe("black-forest-labs/flux.2-klein-4b");
  });
  it("classifies 429 as RATE_LIMITED and 402 as QUOTA_EXHAUSTED", async () => {
    await expect(pollinationsWith(() => json({}, 429)).p.generate(req(), new AbortController().signal)).rejects.toMatchObject({ type: "RATE_LIMITED" });
    await expect(pollinationsWith(() => json({}, 402)).p.generate(req(), new AbortController().signal)).rejects.toMatchObject({ type: "QUOTA_EXHAUSTED" });
  });
  it("propagates an abort as a timeout", async () => {
    const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
    // like real fetch: reject at once if already aborted, else on abort
    const { p } = pollinationsWith((_u, init) => new Promise((_, rej) => (init!.signal!.aborted ? rej(abortError()) : init!.signal!.addEventListener("abort", () => rej(abortError())))));
    const ctrl = new AbortController();
    const pending = p.generate(req(), ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("is unconfigured without a key", () => {
    expect(new PollinationsProvider({ allowPaid: false }).isConfigured()).toBe(false);
  });
  it("refuses image URLs from unexpected hosts", async () => {
    const { p } = pollinationsWith(() => json({ data: [{ url: "https://169.254.169.254/latest" }] }));
    await expect(p.generate(req(), new AbortController().signal)).rejects.toBeInstanceOf(ProviderError);
  });
});

// ── AI Horde adapter ─────────────────────────────────────────────────────

function hordeWith(routes: Record<string, () => Response>) {
  const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    const key = `${init?.method ?? "GET"} ${url.replace("https://aihorde.net/api", "")}`;
    for (const [k, fn] of Object.entries(routes)) if (key.startsWith(k)) return fn();
    if (url.includes("/v2/status/models")) return json([{ name: "AlbedoBase XL 3.1", count: 5 }]);
    throw new Error(`unexpected ${key}`);
  });
  return { p: new AIHordeProvider({ apiKey: "horde-key-secret", fetch: f as unknown as typeof fetch }), f };
}

describe("AIHordeProvider", () => {
  const sig = () => new AbortController().signal;
  it("submits async and returns QUEUED with the horde request id", async () => {
    const { p, f } = hordeWith({ "POST /v2/generate/async": () => json({ id: "h-1", kudos: 10 }, 202) });
    const r = await p.generate(req({ width: 1000, height: 700 }), sig());
    expect(r).toMatchObject({ status: "QUEUED", providerRequestId: "h-1" });
    const init = f.mock.calls.find(([u]) => String(u).endsWith("/v2/generate/async"))![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.params.width % 64).toBe(0);
    expect(body.models).toEqual(["AlbedoBase XL 3.1"]);
    expect((init.headers as Record<string, string>).apikey).toBe("horde-key-secret");
  });
  it("maps waiting → QUEUED and processing → PROCESSING via /check (not /status)", async () => {
    const q = hordeWith({ "GET /v2/generate/check/h-1": () => json({ done: false, waiting: 1, processing: 0, wait_time: 40 }) });
    expect(await q.p.getStatus("h-1", sig())).toMatchObject({ status: "QUEUED", queueSeconds: 40 });
    const pr = hordeWith({ "GET /v2/generate/check/h-1": () => json({ done: false, waiting: 0, processing: 1 }) });
    expect((await pr.p.getStatus("h-1", sig())).status).toBe("PROCESSING");
    expect(pr.f.mock.calls.some(([u]) => String(u).includes("/generate/status/"))).toBe(false);
  });
  it("on completion fetches /status once and downloads the r2 image", async () => {
    const { p } = hordeWith({
      "GET /v2/generate/check/h-1": () => json({ done: true, finished: 1 }),
      "GET /v2/generate/status/h-1": () => json({ generations: [{ img: "https://bucket.r2.cloudflarestorage.com/x.webp", model: "AlbedoBase XL 3.1" }] }),
      "GET https://bucket.r2": () => new Response(PNG, { headers: { "content-type": "image/webp" } }),
    });
    const r = await p.getStatus("h-1", sig());
    expect(r.status).toBe("COMPLETED");
    expect(r.image?.data.byteLength).toBe(PNG.byteLength);
  });
  it("reports faults, expiry and censorship", async () => {
    expect((await hordeWith({ "GET /v2/generate/check/h-1": () => json({ faulted: true }) }).p.getStatus("h-1", sig())).status).toBe("FAILED");
    expect((await hordeWith({ "GET /v2/generate/check/h-1": () => json({}, 404) }).p.getStatus("h-1", sig())).status).toBe("TIMEOUT");
    const censored = hordeWith({ "GET /v2/generate/check/h-1": () => json({ done: true }), "GET /v2/generate/status/h-1": () => json({ generations: [{ img: PNG_B64, censored: true }] }) });
    // a worker-side output flag is retryable, not the user's fault
    expect(await censored.p.getStatus("h-1", sig())).toMatchObject({ status: "FAILED" });
  });
  it("derives a queue score from /v2/status/performance", async () => {
    const { p } = hordeWith({ "GET /v2/status/performance": () => json({ queued_megapixelsteps: 3000, past_minute_megapixelsteps: 600 }) });
    expect(await p.getLoad()).toEqual({ queueSeconds: 300, queueScore: 1 });
  });
  it("does not claim identity-preserving editing", () => {
    expect(new AIHordeProvider({ apiKey: "0000000000" }).capabilities.imageEditing).toBe(false);
  });
});

// ── health ───────────────────────────────────────────────────────────────

describe("ProviderHealthTracker", () => {
  let clock: Clock;
  let h: ProviderHealthTracker;
  beforeEach(() => { clock = new Clock(); h = new ProviderHealthTracker({ windowSize: 5, failureThreshold: 3, cooldownMs: 60_000, maxCooldownMs: 240_000, now: clock.now }); });

  it("does not cool down on one isolated failure", () => {
    h.started("p"); h.failed("p", "TRANSIENT", "x", 10);
    expect(h.state("p")).toBe("DEGRADED");
    expect(h.routable("p").ok).toBe(true);
  });
  it("cools down after the threshold, then allows exactly one recovery probe", () => {
    for (let i = 0; i < 3; i++) { h.started("p"); h.failed("p", "TIMEOUT", "t", 10); }
    expect(h.state("p")).toBe("COOLDOWN");
    expect(h.routable("p").ok).toBe(false);
    clock.advance(60_001);
    expect(h.routable("p")).toEqual({ ok: true, probe: true });
    h.markProbing("p");
    expect(h.routable("p").ok).toBe(false); // only one probe at a time
    h.started("p"); h.succeeded("p", 500);
    expect(h.state("p")).toBe("HEALTHY");
  });
  it("extends cooldown with bounded back-off when recovery fails", () => {
    for (let i = 0; i < 3; i++) { h.started("p"); h.failed("p", "TRANSIENT", "x", 10); }
    for (const expected of [120_000, 240_000, 240_000]) {
      clock.advance(10 * 60_000);
      h.markProbing("p"); h.started("p"); h.failed("p", "TRANSIENT", "x", 10);
      expect(h.snapshot("p").cooldownUntil! - clock.now()).toBe(expected);
    }
  });
  it("treats quota and auth as their own states, not as failures", () => {
    h.started("p"); h.failed("p", "QUOTA_EXHAUSTED", "402", 5);
    expect(h.state("p")).toBe("QUOTA");
    expect(h.snapshot("p").failedRequests).toBe(0);
    h.started("q"); h.failed("q", "AUTHENTICATION", "401", 5);
    expect(h.state("q")).toBe("AUTH_ERROR");
  });
  it("uses a rolling window", () => {
    for (let i = 0; i < 5; i++) { h.started("p"); h.failed("p", "TRANSIENT", "x", 10); clock.advance(61 * 60_000); }
    for (let i = 0; i < 5; i++) { h.started("p"); h.succeeded("p", 100); }
    expect(h.successRate("p")).toBe(1);
    expect(h.snapshot("p").p95LatencyMs).toBe(100);
  });
});

// ── router ───────────────────────────────────────────────────────────────

describe("IntelligentProviderRouter", () => {
  it("ROUND_ROBIN rotates", async () => {
    const { router } = setup({ strategy: "ROUND_ROBIN" });
    const a = (await router.plan(req()))[0].provider.name;
    const b = (await router.plan(req()))[0].provider.name;
    expect(a).not.toBe(b);
  });
  it("HEALTH_BASED prefers the higher success rate", async () => {
    const { router, health } = setup({ strategy: "HEALTH_BASED" });
    health.started("pollinations"); health.failed("pollinations", "TRANSIENT", "x", 10);
    health.started("ai_horde"); health.succeeded("ai_horde", 30_000);
    expect((await router.plan(req()))[0].provider.name).toBe("ai_horde");
  });
  it("LEAST_LATENCY prefers the faster provider", async () => {
    const { router, health } = setup({ strategy: "LEAST_LATENCY" });
    health.started("pollinations"); health.succeeded("pollinations", 5000);
    health.started("ai_horde"); health.succeeded("ai_horde", 40_000);
    expect((await router.plan(req()))[0].provider.name).toBe("pollinations");
  });
  it("AUTO prefers healthy + fast over slow + queued", async () => {
    const { router, health, horde } = setup();
    (horde as FakeProvider & { getLoad?: () => Promise<{ queueScore: number }> }).getLoad = async () => ({ queueScore: 0.9 });
    for (let i = 0; i < 10; i++) { health.started("pollinations"); health.succeeded("pollinations", 5000); health.started("ai_horde"); health.succeeded("ai_horde", 40_000); }
    const plan = await router.plan(req());
    expect(plan.map((c) => c.provider.name)).toEqual(["pollinations", "ai_horde"]);
  });
  it("skips providers in cooldown and puts a due recovery probe first", async () => {
    const { router, health, clock } = setup();
    for (let i = 0; i < 3; i++) { health.started("pollinations"); health.failed("pollinations", "TIMEOUT", "t", 10); }
    expect((await router.plan(req())).map((c) => c.provider.name)).toEqual(["ai_horde"]);
    clock.advance(60_001);
    const plan = await router.plan(req());
    expect(plan[0]).toMatchObject({ probe: true });
    expect(plan[0].provider.name).toBe("pollinations");
  });
  it("filters by capability: editing never goes to a provider that can't preserve identity", async () => {
    const { router } = setup();
    const plan = await router.plan(req({ task: "imageEditing", model: "EDIT", sourceImage: "data:image/png;base64,AA" }));
    expect(plan.map((c) => c.provider.name)).toEqual(["pollinations"]);
  });
  it("honours a server-side forced provider", async () => {
    const { router } = setup({ force: "ai_horde" });
    expect((await router.plan(req())).map((c) => c.provider.name)).toEqual(["ai_horde"]);
  });
  it("adds a provider without router changes", async () => {
    const extra = new FakeProvider("replicate", SYNC);
    const { router } = setup({ strategy: "ROUND_ROBIN", providers: [new FakeProvider("pollinations", SYNC), extra] });
    const names = new Set([(await router.plan(req()))[0].provider.name, (await router.plan(req()))[0].provider.name]);
    expect(names.has("replicate")).toBe(true);
  });
});

// ── service: failure scenarios A–H ───────────────────────────────────────

describe("ImageGenerationService", () => {
  it("A: Pollinations succeeds → COMPLETED with an app-storage URL, provider never exposed", async () => {
    const { service } = setup();
    const r = await service.start(req(), "user-a");
    expect(r.status).toBe("COMPLETED");
    expect(r.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(r)).not.toMatch(/pollinations|ai_horde/);
  });
  it("B: Pollinations fails → records failure, falls back to AI Horde (QUEUED)", async () => {
    const { service, pol, horde, health, events } = setup();
    pol.generateImpl = async () => { throw new ProviderError("TIMEOUT", "timed out", "pollinations"); };
    const r = await service.start(req(), "user-a");
    expect(r.status).toBe("QUEUED");
    expect(horde.calls).toBe(1);
    expect(health.snapshot("pollinations").failedRequests).toBe(1);
    expect(events.map((e) => e.event)).toContain("image_generation_fallback");
  });
  it("C: AI Horde fails on a later poll → falls back to Pollinations", async () => {
    const { service, pol, horde, health } = setup();
    for (let i = 0; i < 5; i++) { health.started("ai_horde"); health.succeeded("ai_horde", 1000); health.started("pollinations"); health.failed("pollinations", "TRANSIENT", "x", 10); health.started("pollinations"); health.succeeded("pollinations", 90_000); }
    const started = await service.start(req(), "user-a");
    expect(started.status).toBe("QUEUED"); // horde chosen first
    horde.statusImpl = async () => ({ provider: "ai_horde", status: "FAILED", error: "faulted" });
    const polled = await service.status(started.generationId, "user-a");
    expect(polled?.status).toBe("COMPLETED");
    expect(pol.calls).toBe(1);
  });
  it("a worker-censored AI Horde result falls back instead of re-polling", async () => {
    const { service, pol, horde, health } = setup();
    for (let i = 0; i < 5; i++) { health.started("pollinations"); health.succeeded("pollinations", 90_000); health.started("ai_horde"); health.succeeded("ai_horde", 1000); }
    const s = await service.start(req(), "u");
    expect(s.status).toBe("QUEUED");
    horde.statusImpl = async () => ({ provider: "ai_horde", status: "FAILED", error: "flagged" });
    expect((await service.status(s.generationId, "u"))?.status).toBe("COMPLETED");
    expect(pol.calls).toBe(1);
  });
  it("D: both fail → FAILED with a clean message", async () => {
    const { service, pol, horde } = setup();
    pol.generateImpl = async () => { throw new ProviderError("TRANSIENT", "boom 500 stack...", "pollinations"); };
    horde.generateImpl = async () => { throw new ProviderError("PROVIDER_UNAVAILABLE", "503", "ai_horde"); };
    const r = await service.start(req(), "user-a");
    expect(r.status).toBe("FAILED");
    expect(r.message).not.toMatch(/boom|stack|503|pollinations|horde/i);
  });
  it("E: quota exhaustion → no retry, provider marked unavailable, AI Horde used", async () => {
    const { service, pol, horde, health } = setup();
    pol.generateImpl = async () => { throw new ProviderError("QUOTA_EXHAUSTED", "402", "pollinations"); };
    expect((await service.start(req(), "u")).status).toBe("QUEUED");
    expect(health.state("pollinations")).toBe("QUOTA");
    await service.start(req(), "u");
    expect(pol.calls).toBe(1); // not retried while exhausted
    expect(horde.calls).toBe(2);
  });
  it("F: a long AI Horde queue stays QUEUED, not failed", async () => {
    const { service, pol, horde, clock } = setup();
    pol.generateImpl = async () => { throw new ProviderError("TRANSIENT", "x", "pollinations"); };
    const s = await service.start(req(), "u");
    horde.statusImpl = async () => ({ provider: "ai_horde", status: "QUEUED", queueSeconds: 400 });
    clock.advance(5 * 60_000);
    expect((await service.status(s.generationId, "u"))?.status).toBe("QUEUED");
    horde.statusImpl = async () => ({ provider: "ai_horde", status: "PROCESSING" });
    expect((await service.status(s.generationId, "u"))?.status).toBe("PROCESSING");
    horde.statusImpl = async () => ({ provider: "ai_horde", status: "COMPLETED", image: { mime: "image/png", data: PNG } });
    const done = await service.status(s.generationId, "u");
    expect(done).toMatchObject({ status: "COMPLETED" });
    expect(done?.imageUrl).toMatch(/^data:image\/png/);
  });
  it("G: a queue wait beyond the limit ends in TIMEOUT (never stuck) and cancels upstream", async () => {
    const pol = new FakeProvider("pollinations", SYNC, false); // unconfigured: horde only
    const horde = new FakeProvider("ai_horde", ASYNC);
    const { service, clock } = setup({ providers: [pol, horde], maxAttempts: 1 });
    const s = await service.start(req(), "u");
    expect(s.status).toBe("QUEUED");
    clock.advance(600_001);
    expect((await service.status(s.generationId, "u"))?.status).toBe("TIMEOUT");
    expect(horde.cancelled).toEqual(["ai_horde-req-1"]);
  });
  it("G: synchronous timeout is recorded and falls back", async () => {
    const { service, pol, health } = setup();
    pol.generateImpl = (r) => new Promise(() => void r); // never resolves; service timeout is 1s
    const r = await service.start(req(), "u");
    expect(r.status).toBe("QUEUED");
    expect(health.snapshot("pollinations").timeouts).toBe(1);
  });
  it("H: provider recovers → cooldown removed after a successful recovery request", async () => {
    const pol = new FakeProvider("pollinations", SYNC);
    const { service, health, clock } = setup({ providers: [pol] });
    let fail = true;
    pol.generateImpl = async () => { if (fail) throw new ProviderError("TRANSIENT", "x", "pollinations"); return { provider: "pollinations", status: "COMPLETED", image: { mime: "image/png", data: PNG } }; };
    for (let i = 0; i < 3; i++) await service.start(req(), "u");
    expect(health.state("pollinations")).toBe("COOLDOWN");
    fail = false;
    clock.advance(60_001);
    expect((await service.start(req(), "u")).status).toBe("COMPLETED");
    expect(health.state("pollinations")).toBe("HEALTHY");
  });
  it("does not retry invalid requests on another provider", async () => {
    const { service, pol, horde } = setup();
    pol.generateImpl = async () => { throw new ProviderError("INVALID_REQUEST", "bad prompt", "pollinations"); };
    expect((await service.start(req(), "u")).status).toBe("FAILED");
    expect(horde.calls).toBe(0);
  });
  it("respects the maximum number of provider attempts", async () => {
    const a = new FakeProvider("a", SYNC), b = new FakeProvider("b", SYNC), c = new FakeProvider("c", SYNC);
    for (const p of [a, b, c]) p.generateImpl = async () => { throw new ProviderError("TRANSIENT", "x", p.name); };
    const { service } = setup({ providers: [a, b, c], maxAttempts: 2, strategy: "ROUND_ROBIN" });
    await service.start(req(), "u");
    expect(a.calls + b.calls + c.calls).toBe(2);
  });
  it("isolates users: another user's or a forged ID reads as not found", async () => {
    const { service, pol } = setup();
    pol.generateImpl = async () => { throw new ProviderError("TRANSIENT", "x", "pollinations"); };
    const s = await service.start(req(), "user-a");
    expect(await service.status(s.generationId, "user-b")).toBeNull();
    const [body] = s.generationId.split(".");
    expect(await service.status(`${body}.forged`, "user-a")).toBeNull();
    expect(await service.cancel(s.generationId, "user-b")).toBeNull();
  });
  it("cancels a queued generation", async () => {
    const { service, pol, horde } = setup();
    pol.generateImpl = async () => { throw new ProviderError("TRANSIENT", "x", "pollinations"); };
    const s = await service.start(req(), "u");
    expect((await service.cancel(s.generationId, "u"))?.status).toBe("CANCELLED");
    expect(horde.cancelled).toEqual(["ai_horde-req-1"]);
  });
  it("never puts credentials in events or responses", async () => {
    const { service, pol, events } = setup();
    pol.generateImpl = async () => { throw new ProviderError("AUTHENTICATION", "401 for Bearer sk_live_abcdefghijk", "pollinations"); };
    const r = await service.start(req(), "u");
    expect(JSON.stringify(events) + JSON.stringify(r)).not.toContain("sk_live_abcdefghijk");
  });
});

// ── tokens, validation, rate limits ──────────────────────────────────────

describe("generation IDs", () => {
  it("round-trip and reject tampering", () => {
    const id = signToken({ v: 1, g: "k", u: "o", p: "ai_horde", r: "h", t: 1, a: [] }, "s3cret-s3cret");
    expect(verifyToken(id, "s3cret-s3cret")?.r).toBe("h");
    expect(verifyToken(id, "other-secret")).toBeNull();
    expect(verifyToken(id.replace(/.$/, "x"), "s3cret-s3cret")).toBeNull();
  });
});

describe("public request validation", () => {
  it("normalises and rejects provider-specific or unknown fields", () => {
    expect(PublicImageRequest.parse({ prompt: "  a   city \u0007at night " }).prompt).toBe("a city at night");
    expect(PublicImageRequest.safeParse({ prompt: "a city", provider: "ai_horde" }).success).toBe(false);
    expect(PublicImageRequest.safeParse({ prompt: "a city", model: "EDIT" }).success).toBe(false);
    expect(PublicImageRequest.safeParse({ prompt: "a city", width: 5000 }).success).toBe(false);
    expect(PublicImageRequest.safeParse({ prompt: "a" }).success).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("limits per key per window", async () => {
    const clock = new Clock();
    const rl = new RateLimiter(undefined, clock.now);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await rl.take("u", 5));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(await rl.take("other", 5)).toBe(true);
    clock.advance(60_000);
    expect(await rl.take("u", 5)).toBe(true);
  });
});
