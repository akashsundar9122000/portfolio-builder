import { ProviderError } from "./errors";
import type { ImageBytes } from "./types";

export type Fetch = typeof fetch;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Downloads a provider-hosted result. Only https, only hosts the adapter
 * names, bounded size — so a provider response can never make the server
 * fetch an arbitrary (e.g. internal) URL.
 */
export async function downloadImage(fetchFn: Fetch, url: string, allowedHosts: string[], provider: string, signal: AbortSignal): Promise<ImageBytes> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ProviderError("PERMANENT", `${provider} returned an invalid image URL`, provider);
  }
  if (u.protocol !== "https:" || !allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
    throw new ProviderError("PERMANENT", `${provider} returned an image from an unexpected host`, provider);
  }
  const res = await fetchFn(u, { signal });
  if (!res.ok) throw new ProviderError("TRANSIENT", `${provider} image download failed (${res.status})`, provider, res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new ProviderError("PERMANENT", `${provider} image too large`, provider);
  return { mime: res.headers.get("content-type")?.split(";")[0] || sniff(buf), data: buf };
}

export function fromBase64(b64: string): ImageBytes {
  const clean = b64.replace(/^data:[^,]+,/, "");
  const data = new Uint8Array(Buffer.from(clean, "base64"));
  if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("image too large");
  return { mime: sniff(data), data };
}

export function sniff(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return "application/octet-stream";
}

/** Round to the provider's step and scale down to fit its maximum, keeping the aspect ratio. */
export function fitSize(w: number, h: number, maxW: number, maxH: number, step: number): { width: number; height: number } {
  const k = Math.min(1, maxW / w, maxH / h);
  const round = (v: number) => Math.max(step, Math.floor((v * k) / step) * step);
  return { width: round(w), height: round(h) };
}
