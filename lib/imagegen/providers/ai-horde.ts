import { classifyHttp, ProviderError } from "../errors";
import { downloadImage, fitSize, fromBase64, type Fetch } from "../http";
import { modelPreferences } from "../models";
import type { GenerationResult, ImageGenerationProvider, ImageGenerationRequest, ModelAlias, ProviderCapabilities, ProviderLoad } from "../types";

/**
 * AI Horde (https://aihorde.net/api, API v2.6 per /api/swagger.json).
 * A crowdsourced cluster; generation is asynchronous:
 *   POST   /v2/generate/async        → 202 { id, kudos }       (QUEUED)
 *   GET    /v2/generate/check/{id}   → waiting/processing/done, wait_time,
 *                                      queue_position, is_possible, faulted
 *   GET    /v2/generate/status/{id}  → generations[].img (limited to
 *                                      10 req/min: only called once done)
 *   DELETE /v2/generate/status/{id}  → cancel
 *   GET    /v2/status/performance    → horde-wide queue
 *   GET    /v2/status/models         → live models, queue and ETA per model
 * Requests expire 10 minutes after submission. Header `apikey`
 * ("0000000000" = anonymous, lowest priority) and a Client-Agent.
 *
 * Text-to-image only here: its img2img redraws the subject, so it does not
 * advertise identity-preserving editing.
 */

const BASE = "https://aihorde.net/api";
const CLIENT_AGENT = "portfolio-builder:1.0:akash-portfolio-builder.vercel.app";
const MODELS_TTL_MS = 10 * 60_000;

export interface AIHordeOptions {
  apiKey: string;
  modelMap?: Partial<Record<ModelAlias, Record<string, string[]>>>;
  fetch?: Fetch;
}

interface CheckResponse {
  finished?: number;
  processing?: number;
  waiting?: number;
  done?: boolean;
  faulted?: boolean;
  wait_time?: number;
  queue_position?: number;
  is_possible?: boolean;
}

export class AIHordeProvider implements ImageGenerationProvider {
  readonly name = "ai_horde";
  readonly capabilities: ProviderCapabilities = {
    textToImage: true,
    imageToImage: false,
    imageEditing: false,
    maxWidth: 1024,
    maxHeight: 1024,
    sizeStep: 64,
    asynchronous: true,
  };
  private models?: { at: number; names: Set<string> };
  private readonly f: Fetch;

  constructor(private readonly o: AIHordeOptions) {
    this.f = o.fetch ?? fetch;
  }

  isConfigured(): boolean {
    return true; // works anonymously; a key only raises priority
  }

  private headers(): Record<string, string> {
    return { apikey: this.o.apiKey, "Client-Agent": CLIENT_AGENT, "Content-Type": "application/json", Accept: "application/json" };
  }

  private async liveModels(): Promise<Set<string>> {
    if (this.models && Date.now() - this.models.at < MODELS_TTL_MS) return this.models.names;
    try {
      const res = await this.f(`${BASE}/v2/status/models?type=image&min_count=1`, { headers: { "Client-Agent": CLIENT_AGENT }, signal: AbortSignal.timeout(5000) });
      const list = (await res.json()) as { name: string; count: number }[];
      this.models = { at: Date.now(), names: new Set(list.filter((m) => m.count > 0).map((m) => m.name)) };
    } catch {
      this.models = { at: Date.now(), names: this.models?.names ?? new Set() };
    }
    return this.models.names;
  }

  async resolveModels(req: ImageGenerationRequest): Promise<string[] | undefined> {
    if (req.modelOverride) return [req.modelOverride];
    const prefs = modelPreferences(req.model, this.name, this.o.modelMap);
    const live = await this.liveModels();
    const available = prefs.filter((m) => live.has(m));
    // none of ours served right now: let the horde pick any available model
    return available.length ? available : undefined;
  }

  async getLoad(): Promise<ProviderLoad | undefined> {
    const res = await this.f(`${BASE}/v2/status/performance`, { headers: { "Client-Agent": CLIENT_AGENT }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return undefined;
    const p = (await res.json()) as { queued_megapixelsteps?: number; past_minute_megapixelsteps?: number };
    const perMin = p.past_minute_megapixelsteps || 1;
    const queueSeconds = Math.round(((p.queued_megapixelsteps ?? 0) / perMin) * 60);
    return { queueSeconds, queueScore: Math.min(1, queueSeconds / 300) };
  }

  async generate(req: ImageGenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    if (req.task !== "textToImage") throw new ProviderError("INVALID_REQUEST", "AI Horde adapter is text-to-image only", this.name);
    const { width, height } = fitSize(req.width, req.height, this.capabilities.maxWidth, this.capabilities.maxHeight, this.capabilities.sizeStep);
    const models = await this.resolveModels(req);
    const body = {
      prompt: req.negativePrompt ? `${req.prompt} ### ${req.negativePrompt}` : req.prompt,
      params: {
        width,
        height,
        n: 1,
        steps: req.quality === "high" ? 30 : req.quality === "low" ? 15 : 24,
        cfg_scale: 7,
        sampler_name: "k_euler_a",
        ...(req.seed !== undefined ? { seed: String(req.seed) } : {}),
      },
      ...(models ? { models } : {}),
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      slow_workers: true,
      // anonymous/low-kudos accounts: shrink rather than reject oversize requests
      allow_downgrade: true,
    };
    const res = await this.f(`${BASE}/v2/generate/async`, { method: "POST", signal, headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw classifyHttp(res.status, this.name, await res.text().catch(() => ""));
    const json = (await res.json()) as { id?: string; kudos?: number };
    if (!json.id) throw new ProviderError("TRANSIENT", "AI Horde returned no request id", this.name);
    return { provider: this.name, status: "QUEUED", providerRequestId: json.id, metadata: { width, height, models, kudos: json.kudos } };
  }

  async getStatus(id: string, signal: AbortSignal): Promise<GenerationResult> {
    const res = await this.f(`${BASE}/v2/generate/check/${encodeURIComponent(id)}`, { headers: { "Client-Agent": CLIENT_AGENT }, signal });
    if (res.status === 404) return { provider: this.name, status: "TIMEOUT", providerRequestId: id, error: "Request expired on AI Horde" };
    if (!res.ok) throw classifyHttp(res.status, this.name, await res.text().catch(() => ""));
    const c = (await res.json()) as CheckResponse;
    const meta = { waitSeconds: c.wait_time, queuePosition: c.queue_position, isPossible: c.is_possible };
    if (c.faulted) return { provider: this.name, status: "FAILED", providerRequestId: id, error: "AI Horde reported a fault", metadata: meta };
    if (!c.done) {
      const status = (c.processing ?? 0) > 0 ? "PROCESSING" : "QUEUED";
      return { provider: this.name, status, providerRequestId: id, queueSeconds: c.wait_time, metadata: meta };
    }
    // done: fetch the image once (this endpoint is rate limited)
    const full = await this.f(`${BASE}/v2/generate/status/${encodeURIComponent(id)}`, { headers: { "Client-Agent": CLIENT_AGENT }, signal });
    if (!full.ok) throw classifyHttp(full.status, this.name, await full.text().catch(() => ""));
    const s = (await full.json()) as { generations?: { img?: string; censored?: boolean; model?: string; seed?: string }[] };
    const g = s.generations?.[0];
    if (!g?.img) return { provider: this.name, status: "FAILED", providerRequestId: id, error: "AI Horde returned no image" };
    // Workers run their own NSFW filter on the OUTPUT and it produces false
    // positives on harmless prompts (seen live on "a neon city at night").
    // That is the worker's verdict on its image, not on the user's request,
    // so it is retryable elsewhere rather than blamed on the prompt.
    // Returned, not thrown: an exception from getStatus means "the status
    // check itself failed, keep waiting", whereas this is a final verdict.
    if (g.censored) return { provider: this.name, status: "FAILED", providerRequestId: id, error: "AI Horde worker's safety filter flagged the output" };
    const image = /^https:\/\//.test(g.img)
      ? await downloadImage(this.f, g.img, ["r2.cloudflarestorage.com", "aihorde.net"], this.name, signal)
      : fromBase64(g.img);
    return { provider: this.name, status: "COMPLETED", providerRequestId: id, image, metadata: { model: g.model, seed: g.seed } };
  }

  async cancel(id: string): Promise<void> {
    await this.f(`${BASE}/v2/generate/status/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Client-Agent": CLIENT_AGENT }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
}
