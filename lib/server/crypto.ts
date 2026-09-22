import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** HMAC-SHA256 with CREATE_SESSION_SECRET — session cookies, admin cookies and admin email links. */
export function sign(payload: string): string {
  const secret = env.CREATE_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    // Never sign production sessions with a guessable fallback.
    throw new Error("CREATE_SESSION_SECRET is not set");
  }
  return createHmac("sha256", secret ?? "dev-only-secret").update(payload).digest("base64url");
}

/** Constant-time string comparison. */
export function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `payload.signature` → payload, or undefined when the signature is wrong. */
export function unsign(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const i = raw.lastIndexOf(".");
  if (i < 1) return undefined;
  const payload = raw.slice(0, i);
  return same(raw.slice(i + 1), sign(payload)) ? payload : undefined;
}
