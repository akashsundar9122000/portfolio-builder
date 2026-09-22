import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, inviteCodes, type InviteCode } from "./env";

/**
 * Invite sessions without a database.
 *
 * A valid code becomes an httpOnly cookie `code.expiry.signature`, signed
 * with CREATE_SESSION_SECRET. Every AI route checks it. Codes are
 * compared in constant time.
 */

const COOKIE = "pb_session";
const MAX_AGE = 7 * 24 * 60 * 60;

function sign(payload: string): string {
  const secret = env.CREATE_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    // Never sign production sessions with a guessable fallback.
    throw new Error("CREATE_SESSION_SECRET is not set");
  }
  return createHmac("sha256", secret ?? "dev-only-secret").update(payload).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function findCode(input: string): InviteCode | undefined {
  const wanted = input.trim().toUpperCase();
  return inviteCodes().find((c) => same(c.code.toUpperCase(), wanted));
}

export async function startSession(code: InviteCode) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${code.code}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function currentCode(): Promise<InviteCode | undefined> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return undefined;
  const i = raw.lastIndexOf(".");
  const payload = raw.slice(0, i);
  if (!same(raw.slice(i + 1), sign(payload))) return undefined;
  const [code, exp] = payload.split(".");
  if (Number(exp) * 1000 < Date.now()) return undefined;
  return inviteCodes().find((c) => c.code === code);
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
