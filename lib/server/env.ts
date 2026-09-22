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
  NVIDIA_MODEL: z.string().optional(), // comma-separated; defaults to DEFAULT_MODELS in lib/ai/nvidia.ts
  POLLINATIONS_API_KEY: z.string().optional(),
  AI_TEXT_FALLBACK: z.enum(["pollinations", "none"]).default("pollinations"),
  CREATE_INVITE_CODES: z.string().optional(), // "CODE:limit,CODE2:limit"
  CREATE_SESSION_SECRET: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // emailed access codes (lib/server/codes.ts, lib/server/mail.ts)
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  // …or any SMTP provider (e.g. Brevo: smtp-relay.brevo.com:587)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().email().optional(), // sender address; must be verified with the provider
  ADMIN_EMAIL: z.string().email().default("support.folioforge@gmail.com"),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  APP_URL: z.string().url().optional(),
  ISSUED_PORTRAIT_LIMIT: z.coerce.number().int().min(0).default(6),
});

const blankToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

export const env = Schema.parse(blankToUndefined);

export const hasText = Boolean(env.NVIDIA_API_KEY || (env.POLLINATIONS_API_KEY && env.AI_TEXT_FALLBACK !== "none"));
// image generation is configured in lib/imagegen/config.ts (Pollinations, AI Horde)


export interface InviteCode {
  code: string;
  portraits: number;
  /** "master" = permanent code from CREATE_INVITE_CODES; "issued" = emailed, single-portfolio code */
  kind: "master" | "issued";
  email?: string;
}

export function inviteCodes(): InviteCode[] {
  return (env.CREATE_INVITE_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [code, limit] = s.split(":");
      return { code: code.trim(), portraits: Math.max(0, Number(limit) || 6), kind: "master" as const };
    });
}
