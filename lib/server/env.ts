import "server-only";
import { z } from "zod";

/**
 * The ONLY place a secret is read from process.env. Every key is optional
 * so the app builds and the whole wizard works without them — the AI
 * buttons simply report that they're unavailable.
 */
const Schema = z.object({
  NVIDIA_API_KEY: z.string().min(10).optional(),
  NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_MODEL: z.string().default("nvidia/nemotron-3-super-120b-a12b"),
  GEMINI_API_KEY: z.string().min(10).optional(),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),
  NVIDIA_IMAGE_MODEL: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(8).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(20).optional(),
  CREATE_INVITE_CODES: z.string().optional(), // "CODE:limit,CODE2:limit"
  CREATE_SESSION_SECRET: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const blankToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

export const env = Schema.parse(blankToUndefined);

export const hasText = Boolean(env.NVIDIA_API_KEY);
export const hasCloudflare = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
export const hasImage = hasCloudflare || Boolean(env.GEMINI_API_KEY || (env.NVIDIA_API_KEY && env.NVIDIA_IMAGE_MODEL));

export interface InviteCode {
  code: string;
  portraits: number;
}

export function inviteCodes(): InviteCode[] {
  return (env.CREATE_INVITE_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [code, limit] = s.split(":");
      return { code: code.trim(), portraits: Math.max(0, Number(limit) || 6) };
    });
}
