import { z } from "zod";
import { MODEL_ALIASES } from "./types";

/**
 * The public request, validated and normalised. Only these fields are
 * accepted (unknown keys are rejected), so no caller can smuggle
 * provider-specific parameters — or choose the provider — through the API.
 */

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

export const PublicImageRequest = z
  .object({
    prompt: z.string().transform(clean).pipe(z.string().min(3, "Describe the image in a few words.").max(1000, "Keep the prompt under 1000 characters.")),
    model: z.enum(MODEL_ALIASES).exclude(["EDIT"]).default("QUALITY"),
    width: z.number().int().min(256).max(1536).default(1024),
    height: z.number().int().min(256).max(1536).default(1024),
    quality: z.enum(["low", "medium", "high"]).default("medium"),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .strict();

export type PublicImageRequest = z.infer<typeof PublicImageRequest>;

/** Admin-only extras, honoured only with a valid IMAGE_ADMIN_TOKEN. */
export const AdminExtras = z.object({ modelOverride: z.string().max(120).optional() });
