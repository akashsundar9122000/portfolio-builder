import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hasRedis, redis } from "./limits";
import { kvDelete, kvGet, kvPut } from "./kv";
import { Draft } from "@/lib/builder/schema";
import { themeById } from "@/lib/builder/themes";
import { renderSite, type RenderAssets } from "@/lib/render";

/**
 * Published portfolios.
 *
 * Someone with a valid code presses Publish: their images/audio/PDF are
 * uploaded one by one (each ≤ 4 MB, Vercel's request limit), then the draft
 * JSON. The SERVER renders the page from that JSON with the same renderer
 * as a download — uploaded HTML is never trusted — and stores it.
 *
 *   Redis  ff:site:<id>          site record (JSON)
 *          ff:slug:<slug>        → id (current name and every old name, so old links redirect)
 *          ff:site-owner:<owner> → id (one site per email; "master" for master codes)
 *          ff:sites              zset of ids by last update (admin list)
 *   KV     h:<id>                the rendered page
 *          a:<id>:<file>         assets, named by content hash (immutable URLs)
 *
 * Sites stay online until the owner or an admin unpublishes them. Owners can
 * publish and rename only while their code is valid.
 */

export type SiteStatus = "pending" | "live" | "unpublished" | "removed";

export interface Site {
  id: string;
  owner: string;
  name: string;
  slug: string;
  oldSlugs: string[];
  status: SiteStatus;
  files: Record<string, number>; // asset file → bytes
  htmlBytes: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  unpublishedAt?: number;
  unpublishReason?: string;
}

export class StoreMissing extends Error {
  constructor() {
    super("Publishing needs Upstash Redis.");
  }
}

// ── names ────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

const RESERVED = new Set([
  "admin", "administrator", "api", "app", "about", "account", "auth", "billing", "blog", "build", "contact", "dashboard", "docs",
  "folioforge", "folio-forge", "help", "home", "login", "logout", "mail", "manage", "me", "new", "official", "owner", "p", "pricing",
  "privacy", "publish", "report", "root", "s", "samples", "security", "settings", "signin", "signup", "site", "sites", "staff",
  "status", "studio", "support", "system", "team", "terms", "test", "user", "verify", "www",
]);

// no impersonating companies people trust with passwords or money, and no slurs
const BLOCKED = [
  "paypal", "google", "gmail", "apple", "icloud", "microsoft", "outlook", "amazon", "facebook", "instagram", "whatsapp",
  "netflix", "bank", "sbi", "hdfc", "icici", "paytm", "phonepe", "gpay", "upi", "crypto", "wallet", "binance", "login", "verify",
  "password", "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "fag", "rape", "porn", "sex", "xxx", "nude",
];

export function toSlug(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40).replace(/-+$/, "");
}

/** Why this name can't be used by anyone, or null. */
export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3–40 lowercase letters, numbers and hyphens (not at the start or end).";
  if (slug.includes("--")) return "Use single hyphens between words.";
  if (RESERVED.has(slug)) return "That name is reserved — try another.";
  if (BLOCKED.some((w) => slug.split("-").includes(w) || slug.replace(/-/g, "").includes(w))) return "That name isn’t allowed — try another.";
  return null;
}

// ── records ──────────────────────────────────────────────────────────────

function store() {
  if (!hasRedis()) throw new StoreMissing();
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const raw = (await redis(["GET", key])) as string | null;
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function save(site: Site) {
  await redis(["SET", `ff:site:${site.id}`, JSON.stringify(site)]);
  await redis(["ZADD", "ff:sites", site.updatedAt, site.id]);
}

export async function getSite(id: string): Promise<Site | undefined> {
  store();
  if (!/^[a-z0-9]{10,24}$/.test(id)) return undefined;
  return getJson<Site>(`ff:site:${id}`);
}

export async function siteForOwner(owner: string): Promise<Site | undefined> {
  store();
  const id = (await redis(["GET", `ff:site-owner:${owner}`])) as string | null;
  return id ? getSite(id) : undefined;
}

/** The owner's site record, created (as "pending", not yet public) on first use. */
export async function ensureSite(owner: string, name: string): Promise<Site> {
  const existing = await siteForOwner(owner);
  if (existing) return existing;
  const now = Date.now();
  const site: Site = {
    id: randomBytes(8).toString("hex"), owner, name, slug: "", oldSlugs: [], status: "pending",
    files: {}, htmlBytes: 0, createdAt: now, updatedAt: now,
  };
  await save(site);
  await redis(["SET", `ff:site-owner:${owner}`, site.id]);
  return site;
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; slug: string; reason: string };

/** Can `owner` use this name? Their own current or old names are always theirs. */
export async function checkSlug(input: string, owner: string): Promise<SlugCheck> {
  store();
  const slug = toSlug(input);
  const problem = slugProblem(slug);
  if (problem) return { ok: false, slug, reason: problem };
  const holder = (await redis(["GET", `ff:slug:${slug}`])) as string | null;
  if (holder) {
    const site = await getSite(holder);
    if (site && site.owner !== owner) return { ok: false, slug, reason: "That name is taken — try another." };
  }
  return { ok: true, slug };
}

/** Resolves a public name: the site, and whether this is its current name (else redirect). */
export async function resolveSlug(slug: string): Promise<{ site: Site; current: boolean } | undefined> {
  store();
  if (!SLUG_RE.test(slug)) return undefined;
  const id = (await redis(["GET", `ff:slug:${slug}`])) as string | null;
  const site = id ? await getSite(id) : undefined;
  return site ? { site, current: site.slug === slug } : undefined;
}

export async function listSites(limit = 200): Promise<Site[]> {
  store();
  const ids = (await redis(["ZRANGE", "ff:sites", 0, limit - 1, "REV"])) as string[];
  if (!ids.length) return [];
  const raws = (await redis(["MGET", ...ids.map((id) => `ff:site:${id}`)])) as (string | null)[];
  return raws.filter((r): r is string => Boolean(r)).map((r) => JSON.parse(r) as Site).filter((s) => s.status !== "pending");
}

// ── files ────────────────────────────────────────────────────────────────

export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

const TYPES: Record<string, { mime: string; sniff: (b: Uint8Array) => boolean }> = {
  jpg: { mime: "image/jpeg", sniff: (b) => b[0] === 0xff && b[1] === 0xd8 },
  png: { mime: "image/png", sniff: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { mime: "image/webp", sniff: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  mp3: { mime: "audio/mpeg", sniff: (b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  m4a: { mime: "audio/mp4", sniff: (b) => ascii(b, 4, 8) === "ftyp" },
  webm: { mime: "audio/webm", sniff: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  pdf: { mime: "application/pdf", sniff: (b) => ascii(b, 0, 5) === "%PDF-" },
};

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
export const FILE_RE = /^[a-f0-9]{20}\.(jpg|png|webp|mp3|m4a|webm|pdf)$/;
export const mimeFor = (file: string) => TYPES[file.split(".").pop() ?? ""]?.mime ?? "application/octet-stream";

/** Stores one image/audio/PDF for this site, named by its content hash. */
export async function storeAsset(site: Site, bytes: Uint8Array, ext: string): Promise<string> {
  const t = TYPES[ext];
  if (!t) throw new Error("That file type can’t be published.");
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new Error("Each file must be under 4 MB.");
  if (!t.sniff(bytes)) throw new Error("That file doesn’t look like what it claims to be.");
  const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}.${ext}`;
  if (!(file in site.files)) await kvPut(`a:${site.id}:${file}`, bytes);
  return file;
}

export async function readAsset(id: string, file: string) {
  if (!FILE_RE.test(file)) return null;
  return kvGet(`a:${id}:${file}`);
}

export async function readHtml(id: string) {
  return kvGet(`h:${id}`);
}

// ── publish / unpublish ─────────────────────────────────────────────────

export interface AssetMap {
  portrait?: { file: string; kind: "cutout" | "framed" };
  voice?: string;
  resume?: string;
  covers: Record<string, string>;
}

export async function publish(owner: string, input: { slug: string; draft: unknown; assets: AssetMap }) {
  const draft = Draft.parse(input.draft);
  const site = await ensureSite(owner, draft.identity.name || "Portfolio");
  if (site.status === "removed") throw new Error("This site was taken down by FolioForge and can’t be republished. Reply to our email if you think that’s a mistake.");
  const check = await checkSlug(input.slug, owner);
  if (!check.ok) throw new Error(check.reason);

  const used = [input.assets.portrait?.file, input.assets.voice, input.assets.resume, ...Object.values(input.assets.covers)].filter((f): f is string => Boolean(f));
  if (!used.every((f) => FILE_RE.test(f))) throw new Error("Bad file reference.");

  const src = (f: string) => `/s/${site.id}/${f}`;
  const assets: RenderAssets = {
    portrait: input.assets.portrait ? { src: src(input.assets.portrait.file), kind: input.assets.portrait.kind } : undefined,
    voice: input.assets.voice ? src(input.assets.voice) : undefined,
    resume: input.assets.resume ? src(input.assets.resume) : undefined,
    covers: Object.fromEntries(Object.entries(input.assets.covers).map(([ref, f]) => [ref, src(f)])),
  };
  const html = renderSite(draft, themeById(draft.meta.themeId), assets);
  await kvPut(`h:${site.id}`, html);

  // files the new version no longer uses
  const keep = new Set(used);
  for (const f of Object.keys(site.files)) if (!keep.has(f)) await kvDelete(`a:${site.id}:${f}`).catch(() => undefined);

  const first = site.status !== "live";
  const renamed = Boolean(site.slug) && site.slug !== check.slug;
  if (renamed && !site.oldSlugs.includes(site.slug)) site.oldSlugs.push(site.slug);
  await redis(["SET", `ff:slug:${check.slug}`, site.id]);

  const now = Date.now();
  const next: Site = {
    ...site,
    name: draft.identity.name || site.name,
    slug: check.slug,
    status: "live",
    files: Object.fromEntries(used.map((f) => [f, site.files[f] ?? 0])),
    htmlBytes: Buffer.byteLength(html),
    updatedAt: now,
    publishedAt: site.publishedAt ?? now,
    unpublishedAt: undefined,
    unpublishReason: undefined,
  };
  await save(next);
  return { site: next, first, renamed };
}

/** Records asset sizes as they're uploaded, for the admin list. */
export async function noteAsset(site: Site, file: string, bytes: number) {
  const fresh = (await getSite(site.id)) ?? site;
  if (fresh.files[file] === bytes) return;
  await redis(["SET", `ff:site:${site.id}`, JSON.stringify({ ...fresh, files: { ...fresh.files, [file]: bytes } })]);
}

/**
 * Takes a site offline and deletes its files. The name stays reserved for
 * its owner. "removed" (by an admin) can't be republished; "unpublished"
 * (by the owner) can, while they hold a valid code.
 */
export async function unpublish(site: Site, by: "owner" | "admin", reason = ""): Promise<Site> {
  await kvDelete(`h:${site.id}`);
  for (const f of Object.keys(site.files)) await kvDelete(`a:${site.id}:${f}`).catch(() => undefined);
  const next: Site = {
    ...site, status: by === "admin" ? "removed" : "unpublished", files: {}, htmlBytes: 0,
    updatedAt: Date.now(), unpublishedAt: Date.now(), unpublishReason: reason.trim() || undefined,
  };
  await save(next);
  return next;
}

export const siteBytes = (s: Site) => s.htmlBytes + Object.values(s.files).reduce((a, b) => a + b, 0);
