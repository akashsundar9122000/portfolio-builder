/**
 * The provider-agnostic contract of the image-generation gateway.
 *
 * Everything outside `providers/` speaks only these types. A provider
 * adapter translates them to and from its own API, so adding Replicate,
 * fal.ai or OpenAI later means writing one adapter and registering it.
 */

export type GenerationStatus = "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";

/** Application-level model aliases. Provider model IDs never leave the adapters. */
export const MODEL_ALIASES = ["FAST", "QUALITY", "CINEMATIC", "ILLUSTRATION", "EDIT"] as const;
export type ModelAlias = (typeof MODEL_ALIASES)[number];

export type Task = "textToImage" | "imageEditing";

/** The normalised internal request. Nothing user-controlled reaches a provider except through this. */
export interface ImageGenerationRequest {
  task: Task;
  prompt: string;
  negativePrompt?: string;
  model: ModelAlias;
  width: number;
  height: number;
  quality: "low" | "medium" | "high";
  seed?: number;
  /** Source image for editing, as a data: URI. Never a URL — the server does not fetch user-supplied URLs. */
  sourceImage?: string;
  /** Provider-specific model ID. Only ever set server-side by an admin. */
  modelOverride?: string;
  /** Opaque, non-identifying user tag for provider abuse tracking. */
  userTag?: string;
}

export interface ImageBytes {
  mime: string;
  data: Uint8Array;
}

export interface GenerationResult {
  provider: string;
  status: GenerationStatus;
  /** For asynchronous providers: the ID to poll. */
  providerRequestId?: string;
  /** Present when status is COMPLETED. */
  image?: ImageBytes;
  /** Provider-reported queue estimate, when known. */
  queueSeconds?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  /** Edits that preserve the subject (e.g. the person's face). */
  imageEditing: boolean;
  maxWidth: number;
  maxHeight: number;
  /** Dimensions must be a multiple of this. */
  sizeStep: number;
  asynchronous: boolean;
}

export interface ProviderLoad {
  /** 0 = idle, 1 = saturated. */
  queueScore: number;
  queueSeconds?: number;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** Configured and allowed to receive traffic. */
  isConfigured(): boolean;
  generate(request: ImageGenerationRequest, signal: AbortSignal): Promise<GenerationResult>;
  getStatus?(providerRequestId: string, signal: AbortSignal): Promise<GenerationResult>;
  cancel?(providerRequestId: string): Promise<void>;
  isAvailable?(): Promise<boolean>;
  getLoad?(): Promise<ProviderLoad | undefined>;
}
