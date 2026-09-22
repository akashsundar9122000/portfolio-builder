import type { ErrorType } from "./errors";
import { countsAsFailure } from "./errors";

/**
 * Per-provider health, over a rolling window of recent outcomes.
 *
 * States:
 *   HEALTHY      normal traffic
 *   DEGRADED     recent failures but under the threshold: still routable, scored lower
 *   COOLDOWN     crossed the failure threshold, or rate limited: no normal traffic
 *                until cooldownUntil, then ONE recovery attempt is allowed
 *   QUOTA        budget/credits exhausted (e.g. HTTP 402): longer cooldown, no retries
 *   AUTH_ERROR   credentials rejected: excluded until the config changes (or 30 min)
 *
 * State is per server instance. On serverless this is a sensible default:
 * each instance learns quickly, and nothing depends on it for correctness.
 */

export type HealthState = "HEALTHY" | "DEGRADED" | "COOLDOWN" | "QUOTA" | "AUTH_ERROR";

interface Outcome { ok: boolean; latencyMs: number; at: number; errorType?: ErrorType }

export interface HealthSnapshot {
  provider: string;
  state: HealthState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number | null;
  consecutiveFailures: number;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  timeouts: number;
  fallbacks: number;
  currentActiveRequests: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  lastErrorType: ErrorType | null;
  cooldownUntil: number | null;
  queueSeconds: number | null;
}

interface Entry {
  window: Outcome[];
  total: number;
  ok: number;
  failed: number;
  timeouts: number;
  fallbacks: number;
  consecutiveFailures: number;
  active: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  lastErrorType: ErrorType | null;
  cooldownUntil: number | null;
  cooldownMs: number;
  special: "QUOTA" | "AUTH_ERROR" | null;
  probing: boolean;
  queueSeconds: number | null;
}

export interface HealthOptions {
  windowSize: number;
  failureThreshold: number;
  cooldownMs: number;
  maxCooldownMs: number;
  now?: () => number;
}

const QUOTA_COOLDOWN_MS = 30 * 60_000;
const AUTH_COOLDOWN_MS = 30 * 60_000;

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export class ProviderHealthTracker {
  private entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(private readonly o: HealthOptions) {
    this.now = o.now ?? Date.now;
  }

  private e(provider: string): Entry {
    let x = this.entries.get(provider);
    if (!x) {
      x = { window: [], total: 0, ok: 0, failed: 0, timeouts: 0, fallbacks: 0, consecutiveFailures: 0, active: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null, lastErrorType: null, cooldownUntil: null, cooldownMs: this.o.cooldownMs, special: null, probing: false, queueSeconds: null };
      this.entries.set(provider, x);
    }
    return x;
  }

  private push(x: Entry, o: Outcome) {
    x.window.push(o);
    if (x.window.length > this.o.windowSize) x.window.shift();
  }

  started(provider: string) {
    this.e(provider).active++;
  }

  /**
   * `release` frees the active-request slot taken by started(). Async
   * providers release it when the job is submitted and record the outcome
   * later (possibly on another instance), with release=false.
   */
  succeeded(provider: string, latencyMs: number, release = true) {
    const x = this.e(provider);
    if (release) x.active = Math.max(0, x.active - 1);
    x.total++; x.ok++;
    x.consecutiveFailures = 0;
    x.lastSuccessAt = this.now();
    this.push(x, { ok: true, latencyMs, at: this.now() });
    // a successful (recovery) request clears any cooldown and resets backoff
    x.cooldownUntil = null;
    x.cooldownMs = this.o.cooldownMs;
    x.special = null;
    x.probing = false;
  }

  failed(provider: string, errorType: ErrorType, message: string, latencyMs: number, release = true) {
    const x = this.e(provider);
    const now = this.now();
    if (release) x.active = Math.max(0, x.active - 1);
    x.lastError = message.slice(0, 300);
    x.lastErrorType = errorType;
    x.lastFailureAt = now;
    if (errorType === "TIMEOUT") x.timeouts++;
    const wasProbe = x.probing;
    x.probing = false;

    if (errorType === "QUOTA_EXHAUSTED") {
      x.special = "QUOTA";
      x.cooldownUntil = now + QUOTA_COOLDOWN_MS;
      return;
    }
    if (errorType === "AUTHENTICATION") {
      x.special = "AUTH_ERROR";
      x.cooldownUntil = now + AUTH_COOLDOWN_MS;
      return;
    }
    if (errorType === "RATE_LIMITED") {
      // short, fixed back-off: the provider is healthy, just busy with us
      x.cooldownUntil = now + Math.min(this.o.cooldownMs, 30_000);
      return;
    }
    if (!countsAsFailure(errorType)) return;

    x.total++; x.failed++;
    x.consecutiveFailures++;
    this.push(x, { ok: false, latencyMs, at: now, errorType });
    if (wasProbe) {
      // failed recovery: extend with bounded exponential back-off
      x.cooldownMs = Math.min(this.o.maxCooldownMs, x.cooldownMs * 2);
      x.cooldownUntil = now + x.cooldownMs;
    } else if (x.consecutiveFailures >= this.o.failureThreshold) {
      x.cooldownUntil = now + x.cooldownMs;
    }
  }

  /** Request never reached a verdict (e.g. cancelled): release the active slot only. */
  released(provider: string) {
    const x = this.e(provider);
    x.active = Math.max(0, x.active - 1);
  }

  recordFallback(provider: string) {
    this.e(provider).fallbacks++;
  }

  recordQueue(provider: string, seconds: number | undefined) {
    if (seconds !== undefined) this.e(provider).queueSeconds = seconds;
  }

  state(provider: string): HealthState {
    const x = this.e(provider);
    const cooling = x.cooldownUntil !== null && x.cooldownUntil > this.now();
    if (x.special && cooling) return x.special;
    if (cooling) return "COOLDOWN";
    if (x.consecutiveFailures > 0) return "DEGRADED";
    return "HEALTHY";
  }

  /**
   * May this provider take a request now? After a cooldown expires exactly
   * one request is let through as a recovery probe; the rest wait for its
   * verdict.
   */
  routable(provider: string): { ok: boolean; probe: boolean } {
    const x = this.e(provider);
    if (x.cooldownUntil === null) return { ok: true, probe: false };
    if (x.cooldownUntil > this.now()) return { ok: false, probe: false };
    if (x.probing) return { ok: false, probe: false };
    return { ok: true, probe: true };
  }

  markProbing(provider: string) {
    this.e(provider).probing = true;
  }

  /** 0..1 success rate over the window; unknown providers get a neutral 0.9. */
  successRate(provider: string): number {
    const w = this.e(provider).window;
    if (w.length === 0) return 0.9;
    return w.filter((o) => o.ok).length / w.length;
  }

  averageLatency(provider: string): number | null {
    const w = this.e(provider).window.filter((o) => o.ok);
    if (!w.length) return null;
    return w.reduce((a, o) => a + o.latencyMs, 0) / w.length;
  }

  active(provider: string): number {
    return this.e(provider).active;
  }

  consecutiveFailures(provider: string): number {
    return this.e(provider).consecutiveFailures;
  }

  queueSeconds(provider: string): number | null {
    return this.e(provider).queueSeconds;
  }

  snapshot(provider: string): HealthSnapshot {
    const x = this.e(provider);
    const lat = x.window.filter((o) => o.ok).map((o) => o.latencyMs).sort((a, b) => a - b);
    const w = x.window;
    return {
      provider,
      state: this.state(provider),
      totalRequests: x.total,
      successfulRequests: x.ok,
      failedRequests: x.failed,
      successRate: w.length ? w.filter((o) => o.ok).length / w.length : null,
      consecutiveFailures: x.consecutiveFailures,
      averageLatencyMs: this.averageLatency(provider),
      p50LatencyMs: percentile(lat, 50),
      p95LatencyMs: percentile(lat, 95),
      timeouts: x.timeouts,
      fallbacks: x.fallbacks,
      currentActiveRequests: x.active,
      lastSuccessAt: x.lastSuccessAt,
      lastFailureAt: x.lastFailureAt,
      lastError: x.lastError,
      lastErrorType: x.lastErrorType,
      cooldownUntil: x.cooldownUntil && x.cooldownUntil > this.now() ? x.cooldownUntil : null,
      queueSeconds: x.queueSeconds,
    };
  }
}
