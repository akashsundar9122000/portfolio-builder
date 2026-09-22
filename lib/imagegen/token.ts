import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ImageGenerationRequest } from "./types";

/**
 * The generation ID is a signed, user-bound record — the "row" of this
 * gateway. The app deliberately stores nothing about users server-side, so
 * instead of a database the ID itself carries:
 *   g  unique id            u  owner (hash of the user's session identity)
 *   p  provider             r  provider request ID
 *   t  started at (ms)      a  providers already tried
 *   q  the normalised text-to-image request (for fallback on a later poll)
 * It is HMAC-signed, so it cannot be forged or pointed at another user's
 * generation, and it never contains credentials.
 */

export interface GenerationToken {
  v: 1;
  g: string;
  u: string;
  p: string;
  r?: string;
  t: number;
  a: string[];
  q?: Omit<ImageGenerationRequest, "sourceImage" | "modelOverride" | "userTag">;
}

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function newGenerationKey(): string {
  return randomBytes(9).toString("base64url");
}

export function userHash(identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`user:${identity}`).digest("base64url").slice(0, 16);
}

export function signToken(t: GenerationToken, secret: string): string {
  const body = b64u(JSON.stringify(t));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(id: string, secret: string): GenerationToken | null {
  if (typeof id !== "string" || id.length > 6000) return null;
  const i = id.lastIndexOf(".");
  if (i < 1) return null;
  const body = id.slice(0, i);
  const sig = Buffer.from(id.slice(i + 1));
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64url"));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GenerationToken;
    return t.v === 1 && typeof t.g === "string" ? t : null;
  } catch {
    return null;
  }
}
