import "server-only";
import { env } from "@/lib/server/env";

/**
 * Outfit editing: photo + fixed professional prompt → edited portrait.
 *
 * Providers are tried in order and the first configured one is used:
 *   1. Gemini image model (free tier on a Google AI Studio key)
 *   2. an NVIDIA-hosted image-edit model, if NVIDIA_IMAGE_MODEL is set
 * With neither, the route reports "unavailable" and the UI falls back to
 * "keep my outfit" (in-browser cut-out only).
 */

export class ImageUnavailable extends Error {}

export async function editPortrait(photo: { mime: string; base64: string }, prompt: string): Promise<{ mime: string; base64: string }> {
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
  if (res.status === 429) throw new Error("The image model is at its free limit for now — try again later.");
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
