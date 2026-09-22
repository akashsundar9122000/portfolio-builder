import "server-only";
import { cookies } from "next/headers";
import { env, inviteCodes, type InviteCode } from "./env";
import { same, sign, unsign } from "./crypto";
import { checkLogin, getCode, codeStatus, normalCode, type CodeStatus } from "./codes";

/**
 * Invite sessions.
 *
 * A valid code becomes an httpOnly cookie `kind:code.expiry.signature`,
 * signed with CREATE_SESSION_SECRET. Every AI route checks it.
 *
 * - master codes (CREATE_INVITE_CODES) are permanent and need no email;
 * - issued codes (emailed, see ./codes) must be signed in with their email
 *   and are re-checked in Redis on every request, so a code that's been
 *   revoked or has expired ends the session immediately.
 */

const COOKIE = "pb_session";
const MAX_AGE = 7 * 24 * 60 * 60;

export function findMasterCode(input: string): InviteCode | undefined {
  const wanted = input.trim().toUpperCase();
  return inviteCodes().find((c) => same(c.code.toUpperCase(), wanted));
}

export type Login = { ok: true; code: InviteCode; expiresAt: number } | { ok: false; reason: "invalid" | CodeStatus };

export async function resolveLogin(email: string, input: string): Promise<Login> {
  const master = findMasterCode(input);
  if (master) return { ok: true, code: master, expiresAt: Date.now() + MAX_AGE * 1000 };
  if (!email.trim()) return { ok: false, reason: "invalid" };
  const r = await checkLogin(email, input);
  if (!r.ok) return r;
  return { ok: true, code: issued(r.code.code, r.code.email, r.code.expiresAt), expiresAt: r.code.expiresAt };
}

const issued = (code: string, email: string, expiresAt: number): InviteCode => ({ code, email, expiresAt, kind: "issued", portraits: env.ISSUED_PORTRAIT_LIMIT });

/**
 * `secure` must follow the actual protocol: browsers silently drop a
 * Secure cookie on plain http (Safari even on localhost, every browser on
 * a LAN address), which made the invite look like it "did nothing".
 * Production on Vercel is always https, so it stays Secure there.
 */
export async function startSession(code: InviteCode, expiresAt: number, secure: boolean) {
  const exp = Math.floor(Math.min(expiresAt, Date.now() + MAX_AGE * 1000) / 1000);
  const payload = `${code.kind === "issued" ? "i" : "m"}:${code.code}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)),
  });
}

export type SessionState = { code: InviteCode } | { code?: undefined; ended?: CodeStatus };

/** The signed-in code, or why there isn't one ("used", "expired", "revoked" for issued codes). */
export async function sessionState(): Promise<SessionState> {
  const payload = unsign((await cookies()).get(COOKIE)?.value);
  if (!payload) return {};
  const dot = payload.lastIndexOf(".");
  const head = payload.slice(0, dot);
  const kind = head.slice(0, head.indexOf(":"));
  const code = head.slice(head.indexOf(":") + 1);
  if (Number(payload.slice(dot + 1)) * 1000 < Date.now()) return { ended: kind === "i" ? "expired" : undefined };
  if (kind === "m") {
    const m = inviteCodes().find((c) => c.code === code);
    return m ? { code: m } : {};
  }
  if (kind !== "i") return {};
  const c = await getCode(normalCode(code)).catch(() => undefined);
  if (!c) return {};
  const state = codeStatus(c);
  return state === "active" ? { code: issued(c.code, c.email, c.expiresAt) } : { ended: state };
}

export async function currentCode(): Promise<InviteCode | undefined> {
  return (await sessionState()).code;
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
