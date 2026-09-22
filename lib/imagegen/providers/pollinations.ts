import { classifyHttp, ProviderError } from "../errors";
import { downloadImage, fitSize, fromBase64, type Fetch } from "../http";
import { modelPreferences } from "../models";
import type { GenerationResult, ImageGenerationProvider, ImageGenerationRequest, ModelAlias, ProviderCapabilities } from "../types";

/**
 * Pollinations (https://gen.pollinations.ai), per its OpenAPI spec
 * (/openapi.json):
 *   POST /v1/images/generations   text → image (OpenAI-compatible)
 *   POST /v1/images/edits         image + prompt → image; accepts a base64
 *                                 data URI, so user photos never need a public URL
 *   GET  /image/models            live catalogue: input_modalities, paid_only,
 *                                 pricing (pollen), aliases
 * Auth: `Authorization: Bearer sk_…` (secret key, server-side only).
 * 402 = pollen balance or key budget exhausted; 429 = too fast.
 *
 * Synchronous: one request returns the finished image.
 */

const BASE = "https://gen.pollinations.ai";
const CATALOGUE_TTL_MS = 10 * 60_000;

interface CatalogueModel {
  name: string;
  aliases?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
  paid_only?: boolean | null;
}

export interface PollinationsOptions {
  apiKey?: string;
  allowPaid: boolean;
  modelMap?: Partial<Record<ModelAlias, Record<string, string[]>>>;
  fetch?: Fetch;
}

export class PollinationsProvider implements ImageGenerationProvider {
  readonly name = "pollinations";
  readonly capabilities: ProviderCapabilities = {
    textToImage: true,
    imageToImage: true,
    imageEditing: true,
    maxWidth: 2048,
    maxHeight: 2048,
    sizeStep: 16,
    asynchronous: false,
  };
  private catalogue?: { at: number; models: CatalogueModel[] };
  private readonly f: Fetch;

  constructor(private readonly o: PollinationsOptions) {
    this.f = o.fetch ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.o.apiKey);
  }

  async isAvailable(): Promise<boolean> {
    return (await this.models()).length > 0;
  }

  /** The live image-model catalogue (public endpoint), cached. */
  async models(): Promise<CatalogueModel[]> {
    if (this.catalogue && Date.now() - this.catalogue.at < CATALOGUE_TTL_MS) return this.catalogue.models;
    try {
      const res = await this.f(`${BASE}/image/models`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as CatalogueModel[] | { data: CatalogueModel[] };
      const models = (Array.isArray(json) ? json : json.data).filter((m) => (m.output_modalities ?? ["image"]).includes("image"));
      this.catalogue = { at: Date.now(), models };
      return models;
    } catch {
      return this.catalogue?.models ?? [];
    }
  }

  /** First preferred model the catalogue currently offers for this task. */
  async resolveModel(req: ImageGenerationRequest): Promise<string> {
    if (req.modelOverride) return req.modelOverride;
    const prefs = modelPreferences(req.model, this.name, this.o.modelMap);
    const catalogue = await this.models();
    if (catalogue.length === 0) return prefs[0] ?? "flux"; // catalogue unreachable: trust the configured order
    for (const id of prefs) {
      const m = catalogue.find((x) => x.name === id || x.aliases?.includes(id));
      if (!m) continue;
      if (m.paid_only && !this.o.allowPaid) continue;
      if (req.task === "imageEditing" && !m.input_modalities?.includes("image")) continue;
      return m.name;
    }
    throw new ProviderError("INVALID_REQUEST", `No available Pollinations model for ${req.model}`, this.name);
  }

  async generate(req: ImageGenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const model = await this.resolveModel(req);
    const { width, height } = fitSize(req.width, req.height, this.capabilities.maxWidth, this.capabilities.maxHeight, this.capabilities.sizeStep);
    const editing = req.task === "imageEditing";
    if (editing && !req.sourceImage) throw new ProviderError("INVALID_REQUEST", "Editing needs a source image", this.name);

    const body: Record<string, unknown> = {
      prompt: req.negativePrompt ? `${req.prompt}\nAvoid: ${req.negativePrompt}` : req.prompt,
      model,
      n: 1,
      size: `${width}x${height}`,
      quality: req.quality,
      response_format: "b64_json",
      // provider-side safety filters on: privacy, secrets, sexual, violence
      safe: "true,nsfw",
      ...(req.userTag ? { user: req.userTag } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(editing ? { image: [{ image_url: req.sourceImage }] } : {}),
    };
    const res = await this.f(`${BASE}/v1/images/${editing ? "edits" : "generations"}`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${this.o.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("cf-ray") ?? undefined;
    if (!res.ok) throw classifyHttp(res.status, this.name, await res.text().catch(() => ""));
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = json.data?.[0];
    const image = item?.b64_json
      ? fromBase64(item.b64_json)
      : item?.url
        ? await downloadImage(this.f, item.url, ["pollinations.ai"], this.name, signal)
        : undefined;
    if (!image) throw new ProviderError("TRANSIENT", "Pollinations returned no image", this.name);
    return { provider: this.name, status: "COMPLETED", providerRequestId: requestId, image, metadata: { model, width, height } };
  }
}
