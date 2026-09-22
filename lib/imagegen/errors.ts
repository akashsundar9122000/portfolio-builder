/**
 * Provider failures, classified so the router can decide what to do:
 * fall back, cool the provider down, or stop immediately.
 */

export type ErrorType =
  | "TRANSIENT"
  | "PERMANENT"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "AUTHENTICATION"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "PROVIDER_UNAVAILABLE";

export class ProviderError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly provider: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Worth trying another provider for. An invalid prompt is not. */
export function isFallbackable(type: ErrorType): boolean {
  return type !== "INVALID_REQUEST";
}

/**
 * Failures that say something about the provider's health. Rate limits,
 * quota and auth are tracked as their own states; an invalid request is
 * the caller's fault and does not count against the provider.
 */
export function countsAsFailure(type: ErrorType): boolean {
  return type === "TRANSIENT" || type === "TIMEOUT" || type === "PROVIDER_UNAVAILABLE" || type === "PERMANENT";
}

export function classifyHttp(status: number, provider: string, detail = ""): ProviderError {
  const msg = `${provider} HTTP ${status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
  if (status === 400 || status === 413 || status === 422) return new ProviderError("INVALID_REQUEST", msg, provider, status);
  if (status === 401 || status === 403) return new ProviderError("AUTHENTICATION", msg, provider, status);
  if (status === 402) return new ProviderError("QUOTA_EXHAUSTED", msg, provider, status);
  if (status === 429) return new ProviderError("RATE_LIMITED", msg, provider, status);
  if (status === 503) return new ProviderError("PROVIDER_UNAVAILABLE", msg, provider, status);
  if (status >= 500) return new ProviderError("TRANSIENT", msg, provider, status);
  return new ProviderError("PERMANENT", msg, provider, status);
}

export function classifyThrown(e: unknown, provider: string): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as Error;
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return new ProviderError("TIMEOUT", `${provider} timed out`, provider);
  return new ProviderError("TRANSIENT", `${provider}: ${err?.message ?? "network error"}`, provider);
}
