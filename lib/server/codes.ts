import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { hasRedis, redis } from "./limits";

/**
 * Emailed, single-portfolio access codes.
 *
 * Someone asks for a code on the landing page → a request is stored and
 * Akash is emailed → from the admin page he previews a code (as many times
 * as he likes) and sends it → the code is bound to that email address.
 *
 * A code stops working when the person has downloaded BOTH the ZIP and the
 * single HTML file, when it's 7 days old, or when it's revoked. Every code
 * ever issued is kept in a set, so no code is ever handed out twice.
 *
 * Keys (Upstash Redis):
 *   ff:req:<id>        request JSON                    30 d
 *   ff:reqs            zset of request ids by time     (trimmed to 30 d)
 *   ff:pending:<email> id of the open request          7 d
 *   ff:code:<CODE>     code JSON                       30 d (validity is expiresAt)
 *   ff:dl:<CODE>       set of formats downloaded       30 d
 *   ff:email:<email>   the email's active code         until it expires
 *   ff:issued          every code ever issued          forever
 *   ff:rl:*            request rate limits             24 h
 */

export const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_S = 30 * 24 * 60 * 60;
const DAY_S = 24 * 60 * 60;
export const REQUESTS_PER_DAY = 3;

// Crockford-style: no 0/O, 1/I/L or U, so a code read aloud or retyped survives
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_RE = /^FF-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;

export type DownloadKind = "html" | "zip";
export type RequestStatus = "pending" | "sent" | "rejected";
export type CodeStatus = "active" | "used" | "expired" | "revoked";

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  reason: string;
  ip: string;
  createdAt: number;
  status: RequestStatus;
  code?: string;
  note?: string;
  decidedAt?: number;
}

export interface IssuedCode {
  code: string;
  email: string;
  name: string;
  reqId: string;
  issuedAt: number;
  expiresAt: number;
  status: "active" | "used" | "revoked";
  usedAt?: number;
  revokedAt?: number;
  /** why the admin revoked it (shown to the person in the email) */
  revokeReason?: string;
}

export class StoreMissing extends Error {
  constructor() {
    super("Access codes need Upstash Redis — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }
}

function store() {
  if (!hasRedis()) throw new StoreMissing();
}

export const normalEmail = (e: string) => e.trim().toLowerCase();

/** Accepts "ff-abcd-efgh", "FF ABCD EFGH", "ffabcdefgh" … → "FF-ABCD-EFGH" (or the raw uppercased input). */
export function normalCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === 10 && raw.startsWith("FF")) return `FF-${raw.slice(2, 6)}-${raw.slice(6)}`;
  return input.trim().toUpperCase();
}

export const isCodeShape = (c: string) => CODE_RE.test(c);

export function generateCode(): string {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `FF-${pick()}-${pick()}`;
}

export function codeStatus(c: IssuedCode, now = Date.now()): CodeStatus {
  if (c.status !== "active") return c.status;
  return now >= c.expiresAt ? "expired" : "active";
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const raw = (await redis(["GET", key])) as string | null;
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function putJson(key: string, value: unknown, ttlS = KEEP_S) {
  await redis(["SET", key, JSON.stringify(value), "EX", ttlS]);
}

/** Fixed 24 h window. Returns false once `limit` is exceeded. */
async function underLimit(key: string, limit: number): Promise<boolean> {
  const n = Number(await redis(["INCR", key]));
  if (n === 1) await redis(["EXPIRE", key, DAY_S]);
  return n <= limit;
}

// ── requests ────────────────────────────────────────────────────────────

export type RequestOutcome =
  | { ok: true; request: AccessRequest }
  | { ok: false; reason: "active-code" | "pending" | "rate-limited" };

export async function createRequest(input: { name: string; email: string; reason: string; ip: string }): Promise<RequestOutcome> {
  store();
  const email = normalEmail(input.email);
  const active = await activeCodeFor(email);
  if (active) return { ok: false, reason: "active-code" };
  const pendingId = (await redis(["GET", `ff:pending:${email}`])) as string | null;
  if (pendingId) {
    const open = await getRequest(pendingId);
    if (open?.status === "pending") return { ok: false, reason: "pending" };
  }
  if (!(await underLimit(`ff:rl:req:email:${email}`, REQUESTS_PER_DAY))) return { ok: false, reason: "rate-limited" };
  if (!(await underLimit(`ff:rl:req:ip:${input.ip}`, REQUESTS_PER_DAY * 2))) return { ok: false, reason: "rate-limited" };

  const request: AccessRequest = {
    id: randomBytes(9).toString("base64url"),
    name: input.name.trim(),
    email,
    reason: input.reason.trim(),
    ip: input.ip,
    createdAt: Date.now(),
    status: "pending",
  };
  await putJson(`ff:req:${request.id}`, request);
  await redis(["ZADD", "ff:reqs", request.createdAt, request.id]);
  await redis(["ZREMRANGEBYSCORE", "ff:reqs", 0, request.createdAt - KEEP_S * 1000]);
  await redis(["SET", `ff:pending:${email}`, request.id, "EX", CODE_TTL_MS / 1000]);
  return { ok: true, request };
}

/** Undo a request whose notification email couldn't be sent, so the person can simply try again. */
export async function discardRequest(r: AccessRequest) {
  await redis(["DEL", `ff:req:${r.id}`, `ff:pending:${r.email}`]);
  await redis(["ZREM", "ff:reqs", r.id]);
}

export async function getRequest(id: string): Promise<AccessRequest | undefined> {
  store();
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return undefined;
  return getJson<AccessRequest>(`ff:req:${id}`);
}

export interface RequestRow {
  request: AccessRequest;
  code?: IssuedCode & { downloads: DownloadKind[]; state: CodeStatus };
}

/** Newest first, with each request's code and download progress. */
export async function listRequests(limit = 100): Promise<RequestRow[]> {
  store();
  const ids = (await redis(["ZRANGE", "ff:reqs", 0, limit - 1, "REV"])) as string[];
  if (!ids.length) return [];
  const raws = (await redis(["MGET", ...ids.map((id) => `ff:req:${id}`)])) as (string | null)[];
  const requests = raws.filter((r): r is string => Boolean(r)).map((r) => JSON.parse(r) as AccessRequest);
  return Promise.all(requests.map(async (request) => ({ request, code: request.code ? await codeDetails(request.code) : undefined })));
}

export async function codeDetails(code: string) {
  const c = await getJson<IssuedCode>(`ff:code:${code}`);
  if (!c) return undefined;
  const downloads = ((await redis(["SMEMBERS", `ff:dl:${code}`])) as DownloadKind[]).sort();
  return { ...c, downloads, state: codeStatus(c) };
}

export async function rejectRequest(id: string, note: string): Promise<AccessRequest> {
  const r = await getRequest(id);
  if (!r) throw new Error("Request not found.");
  if (r.status !== "pending") throw new Error(`This request was already ${r.status}.`);
  const next: AccessRequest = { ...r, status: "rejected", note: note.trim() || undefined, decidedAt: Date.now() };
  await putJson(`ff:req:${id}`, next);
  await redis(["DEL", `ff:pending:${r.email}`]);
  return next;
}

// ── codes ───────────────────────────────────────────────────────────────

/** A fresh code that has never been issued. Nothing is reserved until it's sent. */
export async function previewCode(): Promise<string> {
  store();
  for (let i = 0; i < 8; i++) {
    const c = generateCode();
    if (!Number(await redis(["SISMEMBER", "ff:issued", c]))) return c;
  }
  throw new Error("Could not find an unused code — try again.");
}

/**
 * Issues `candidate` (or a fresh code if it's malformed or was taken in the
 * meantime) to the request's email. SADD is the uniqueness lock: it adds
 * the code to the set of every code ever issued and says whether it was new.
 */
export async function issueCode(reqId: string, candidate: string, note: string): Promise<{ request: AccessRequest; code: IssuedCode }> {
  const r = await getRequest(reqId);
  if (!r) throw new Error("Request not found.");
  if (r.status !== "pending") throw new Error(`This request was already ${r.status}.`);

  let code = normalCode(candidate);
  if (!isCodeShape(code)) code = generateCode();
  for (let i = 0; !Number(await redis(["SADD", "ff:issued", code])); i++) {
    if (i >= 8) throw new Error("Could not find an unused code — try again.");
    code = generateCode();
  }

  // one active code per email: a new one replaces any older one
  const previous = (await redis(["GET", `ff:email:${r.email}`])) as string | null;
  if (previous) await revokeCode(previous);

  const now = Date.now();
  const issued: IssuedCode = { code, email: r.email, name: r.name, reqId, issuedAt: now, expiresAt: now + CODE_TTL_MS, status: "active" };
  await putJson(`ff:code:${code}`, issued);
  await redis(["SET", `ff:email:${r.email}`, code, "PX", CODE_TTL_MS]);
  const request: AccessRequest = { ...r, status: "sent", code, note: note.trim() || undefined, decidedAt: now };
  await putJson(`ff:req:${reqId}`, request);
  await redis(["DEL", `ff:pending:${r.email}`]);
  return { request, code: issued };
}

export async function getCode(code: string): Promise<IssuedCode | undefined> {
  store();
  return getJson<IssuedCode>(`ff:code:${normalCode(code)}`);
}

/** Silently retires a code (used when a newer code replaces it for the same email). */
export async function revokeCode(code: string): Promise<void> {
  const c = await getCode(code);
  if (!c) return;
  if (c.status === "active") await putJson(`ff:code:${c.code}`, { ...c, status: "revoked", revokedAt: Date.now() } satisfies IssuedCode);
  await clearEmailIndex(c);
}

/**
 * The admin's revoke: only a currently active code, and there is no way
 * back — the person has to request a new code. Their session ends on its
 * next request, because sessions re-check the code's status.
 */
export async function adminRevoke(code: string, reason: string): Promise<IssuedCode> {
  const c = await getCode(code);
  if (!c) throw new Error("Code not found.");
  const state = codeStatus(c);
  if (state !== "active") throw new Error(`This code is already ${state} — only an active code can be revoked.`);
  const revoked: IssuedCode = { ...c, status: "revoked", revokedAt: Date.now(), revokeReason: reason.trim() || undefined };
  await putJson(`ff:code:${c.code}`, revoked);
  await clearEmailIndex(c);
  return revoked;
}

async function clearEmailIndex(c: IssuedCode) {
  const current = (await redis(["GET", `ff:email:${c.email}`])) as string | null;
  if (current === c.code) await redis(["DEL", `ff:email:${c.email}`]);
}

async function activeCodeFor(email: string): Promise<IssuedCode | undefined> {
  const code = (await redis(["GET", `ff:email:${email}`])) as string | null;
  if (!code) return undefined;
  const c = await getJson<IssuedCode>(`ff:code:${code}`);
  return c && codeStatus(c) === "active" ? c : undefined;
}

export type LoginOutcome = { ok: true; code: IssuedCode } | { ok: false; reason: "invalid" | CodeStatus };

/** Sign-in check: the code must exist, belong to this email, and still be active. */
export async function checkLogin(email: string, input: string): Promise<LoginOutcome> {
  const c = await getCode(input);
  // a wrong email looks exactly like a wrong code, so neither can be probed
  if (!c || c.email !== normalEmail(email)) return { ok: false, reason: "invalid" };
  const state = codeStatus(c);
  return state === "active" ? { ok: true, code: c } : { ok: false, reason: state };
}

/** Records a finished download; the code is used up once both formats are done. */
export async function recordDownload(code: string, kind: DownloadKind): Promise<{ burned: boolean; downloads: DownloadKind[] }> {
  store();
  const key = `ff:dl:${code}`;
  await redis(["SADD", key, kind]);
  await redis(["EXPIRE", key, KEEP_S]);
  const downloads = ((await redis(["SMEMBERS", key])) as DownloadKind[]).sort();
  if (downloads.length < 2) return { burned: false, downloads };
  const c = await getCode(code);
  if (c && c.status === "active") {
    await putJson(`ff:code:${code}`, { ...c, status: "used", usedAt: Date.now() } satisfies IssuedCode);
    await clearEmailIndex(c);
  }
  return { burned: true, downloads };
}

export async function downloadsFor(code: string): Promise<DownloadKind[]> {
  store();
  return ((await redis(["SMEMBERS", `ff:dl:${code}`])) as DownloadKind[]).sort();
}
