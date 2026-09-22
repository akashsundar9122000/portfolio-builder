import "server-only";
import { env } from "@/lib/server/env";

/**
 * Outfit editing: photo + fixed professional prompt → edited portrait.
 *
 * Providers are tried in order and the first configured one is used:
 *   1. Cloudflare Workers AI, FLUX.2 [klein] (free daily allowance):
 *      reference-image editing that keeps the face; 9B first, 4B fallback
 *   2. Gemini image model (needs a key with image quota)
 *   3. an NVIDIA-hosted image-edit model, if NVIDIA_IMAGE_MODEL is set
 * With neither, the route reports "unavailable" and the UI falls back to
 * "keep my outfit" (in-browser cut-out only).
 */

export class ImageUnavailable extends Error {}

export async function editPortrait(photo: { mime: string; base64: string }, prompt: string): Promise<{ mime: string; base64: string }> {
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) return cloudflare(photo, prompt);
  if (env.GEMINI_API_KEY) return gemini(photo, prompt);
  if (env.NVIDIA_API_KEY && env.NVIDIA_IMAGE_MODEL) return nvidia(photo, prompt);
  throw new ImageUnavailable("Outfit generation isn't configured.");
}

async function gemini(photo: { mime: string; base64: string }, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: photo.mime, data: photo.base64 } }, { text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (res.status === 429) {
    // Google's free tier gives image models no quota at all, so this is not
    // a "wait a bit" limit: the key needs billing enabled.
    throw new ImageUnavailable("AI outfits need a Gemini key with image quota (billing enabled). Choose “Keep my outfit” for now.");
  }
  if (!res.ok) throw new Error(`Image request failed (${res.status})`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }[] } }[] };
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) return { mime: part.inlineData.mimeType, base64: part.inlineData.data };
    if (part.inline_data) return { mime: part.inline_data.mime_type, base64: part.inline_data.data };
  }
  throw new Error("The image model returned no image (it may have declined this photo).");
}

async function nvidia(photo: { mime: string; base64: string }, prompt: string) {
  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${env.NVIDIA_IMAGE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ prompt, image: `data:${photo.mime};base64,${photo.base64}`, steps: 28, seed: 0 }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw new Error(`Image request failed (${res.status})`);
  const data = (await res.json()) as { artifacts?: { base64: string }[]; image?: string };
  const b64 = data.artifacts?.[0]?.base64 ?? data.image;
  if (!b64) throw new Error("The image model returned no image.");
  return { mime: "image/png", base64: b64.replace(/^data:[^,]+,/, "") };
}

const CF_MODELS = ["@cf/black-forest-labs/flux-2-klein-9b", "@cf/black-forest-labs/flux-2-klein-4b"];

async function cloudflare(photo: { mime: string; base64: string }, prompt: string) {
  let last = "";
  for (const model of CF_MODELS) {
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("input_image_0", new Blob([Buffer.from(photo.base64, "base64")], { type: photo.mime }), "photo");
    // portrait 4:5, the shape of the hero frame
    fd.append("width", "768");
    fd.append("height", "960");
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      body: fd,
      signal: AbortSignal.timeout(50_000),
    }).catch((e: Error) => e);
    if (res instanceof Error) { last = res.message; continue; }
    if (res.status === 429) { last = "daily limit"; continue; }
    const data = (await res.json().catch(() => ({}))) as { result?: { image?: string }; errors?: { message: string }[] };
    const b64 = data.result?.image;
    if (res.ok && b64) return { mime: "image/png", base64: b64 };
    last = data.errors?.[0]?.message ?? `HTTP ${res.status}`;
  }
  if (/limit|429|neuron/i.test(last)) throw new Error("Today's free outfit allowance is used up — try again tomorrow, or choose “Keep my outfit”.");
  throw new Error(`The outfit model couldn't process this photo (${last}).`);
}
