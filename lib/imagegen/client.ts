"use client";

/**
 * Browser side of the image gateway. Knows nothing about providers: it
 * starts a generation, then polls the status endpoint with back-off
 * (4 s growing to 12 s) until a terminal state, reporting each state to
 * the UI. The server enforces its own polling floor as well.
 */

export type UiStatus = "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";

export interface GenerationResponse {
  generationId: string;
  status: UiStatus;
  imageUrl: string | null;
  message?: string;
  error?: string;
}

const TERMINAL: UiStatus[] = ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"];
const FRIENDLY_FAILURE = "Image generation failed. Please try again.";

export class GenerationError extends Error {}

async function read(res: Response): Promise<GenerationResponse> {
  const data = (await res.json().catch(() => ({}))) as Partial<GenerationResponse>;
  if (!res.ok && !data.generationId) throw new GenerationError(data.error ?? FRIENDLY_FAILURE);
  return data as GenerationResponse;
}

export interface WaitOptions {
  onStatus?: (s: UiStatus, elapsedMs: number) => void;
  signal?: AbortSignal;
  /** Give up waiting after this long (the server has its own limit). */
  maxWaitMs?: number;
}

export async function runGeneration(start: () => Promise<Response>, o: WaitOptions = {}): Promise<string> {
  const t0 = performance.now();
  let g = await read(await start());
  let delay = 4000;
  o.onStatus?.(g.status, 0);
  while (!TERMINAL.includes(g.status)) {
    if (o.signal?.aborted) {
      await fetch(`/api/generate-image/${encodeURIComponent(g.generationId)}`, { method: "DELETE" }).catch(() => undefined);
      throw new GenerationError("Cancelled.");
    }
    if (performance.now() - t0 > (o.maxWaitMs ?? 11 * 60_000)) throw new GenerationError("Image generation took too long. Please try again.");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(12_000, Math.round(delay * 1.4));
    g = await read(await fetch(`/api/generate-image/${encodeURIComponent(g.generationId)}`, { cache: "no-store", signal: o.signal }));
    o.onStatus?.(g.status, performance.now() - t0);
  }
  if (g.status !== "COMPLETED" || !g.imageUrl) throw new GenerationError(g.message ?? FRIENDLY_FAILURE);
  return g.imageUrl;
}

export function statusLabel(s: UiStatus | "IDLE", elapsedMs: number): string {
  switch (s) {
    case "PENDING": return "Generating image…";
    case "QUEUED": return elapsedMs > 20_000 ? "Still in the queue — busy right now, this can take a minute or two…" : "Queued…";
    case "PROCESSING": return "Processing…";
    case "COMPLETED": return "Done.";
    default: return "";
  }
}
