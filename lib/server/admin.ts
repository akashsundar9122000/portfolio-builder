import "server-only";
import { cookies } from "next/headers";
import { env } from "./env";
import { same, sign, unsign } from "./crypto";

/**
 * Akash's side of access codes. Two locks:
 *  - request pages need a signed link (?sig=…), as sent in the request email;
 *  - every admin page and action needs the pb_admin cookie, set by
 *    signing in with ADMIN_PASSWORD once per device.
 * So a forwarded email alone can't issue a code, and the password alone
 * can't enumerate request ids.
 */

const COOKIE = "pb_admin";
const MAX_AGE = 30 * 24 * 60 * 60;

export const adminConfigured = () => Boolean(env.ADMIN_PASSWORD);

export function passwordMatches(input: string): boolean {
  return Boolean(env.ADMIN_PASSWORD) && same(input, env.ADMIN_PASSWORD!);
}

export async function startAdmin(secure: boolean) {
  const payload = `admin.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const payload = unsign((await cookies()).get(COOKIE)?.value);
  if (!payload?.startsWith("admin.")) return false;
  return Number(payload.slice(6)) * 1000 > Date.now();
}

export async function endAdmin() {
  (await cookies()).delete(COOKIE);
}

export const requestSig = (id: string) => sign(`req:${id}`);
export const requestSigOk = (id: string, sig: string | undefined) => Boolean(sig) && same(sig!, requestSig(id));

export function baseUrl(req?: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  return req ? new URL(req.url).origin : "http://localhost:3000";
}

export const requestLink = (id: string, req?: Request) => `${baseUrl(req)}/admin/requests/${id}?sig=${requestSig(id)}`;

/** Only same-site paths survive the post-login redirect. */
export const safeNext = (next: string | null | undefined) => (next && /^\/admin(\/|$|\?)/.test(next) ? next : "/admin");

export function isHttps(req: Request) {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}
