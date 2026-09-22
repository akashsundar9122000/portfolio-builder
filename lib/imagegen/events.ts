/**
 * Structured lifecycle events, one JSON line each (Vercel log drains parse
 * these). Fields are chosen by the caller from a fixed set — prompts,
 * images and credentials are never passed in, and anything key-shaped is
 * redacted as a last line of defence.
 */

export type ImageEvent =
  | "image_generation_started"
  | "image_generation_provider_selected"
  | "image_generation_provider_failed"
  | "image_generation_fallback"
  | "image_generation_queued"
  | "image_generation_processing"
  | "image_generation_completed"
  | "image_generation_failed"
  | "image_generation_timeout"
  | "image_generation_cancelled";

type Field = string | number | boolean | null | undefined;

const SECRETISH = /(sk_[A-Za-z0-9]{8,}|pk_[A-Za-z0-9]{8,}|nvapi-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/g;

export type Logger = (event: ImageEvent, fields: Record<string, Field>) => void;

export const logEvent: Logger = (event, fields) => {
  const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.replace(SECRETISH, "[redacted]").slice(0, 300) : v]));
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...safe }));
};
