import type { ModelAlias } from "./types";

/**
 * Application-level model aliases → ordered preference lists per provider.
 *
 * The frontend only ever says "FAST" or "EDIT". Each adapter walks its list
 * and uses the first ID its live catalogue currently offers, so a model
 * being retired upstream degrades to the next choice rather than an error.
 * Override any of it with IMAGE_MODEL_MAP (same JSON shape).
 */
export const DEFAULT_MODEL_MAP: Record<ModelAlias, Record<string, string[]>> = {
  FAST: {
    pollinations: ["flux", "zimage"],
    ai_horde: ["AlbedoBase XL 3.1", "stable_diffusion"],
  },
  QUALITY: {
    pollinations: ["gptimage", "klein", "zimage", "flux"],
    ai_horde: ["AlbedoBase XL 3.1", "AlbedoBase XL (SDXL)", "Deliberate"],
  },
  CINEMATIC: {
    pollinations: ["klein", "zimage", "flux"],
    ai_horde: ["ICBINP - I Can't Believe It's Not Photography", "AlbedoBase XL 3.1"],
  },
  ILLUSTRATION: {
    pollinations: ["zimage", "flux"],
    ai_horde: ["Deliberate", "AlbedoBase XL 3.1"],
  },
  // Identity-preserving edits. AI Horde has no equivalent, so it has no entry.
  EDIT: {
    pollinations: ["klein", "kontext", "gptimage"],
  },
};

export function modelPreferences(alias: ModelAlias, provider: string, override?: Partial<Record<ModelAlias, Record<string, string[]>>>): string[] {
  return override?.[alias]?.[provider] ?? DEFAULT_MODEL_MAP[alias][provider] ?? [];
}
